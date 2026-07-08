import { useState } from "react"
import { Check, Folder, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useEmptySpaceTrash,
  useEmptyTrash,
  usePurgeItem,
  usePurgeItems,
  usePurgeSpace,
  usePurgeSpaces,
  useRestoreItem,
  useRestoreSpace,
  useSpaceTrash,
  useTrash,
} from "@/lib/queries"
import { cn } from "@/lib/utils"
import { TypeBadge } from "@/features/items/ItemRow"

/** Format a deleted-at timestamp as a short relative-ish label. */
function whenDeleted(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Trash — restore or permanently delete soft-deleted items and spaces. Purge is
 * the one place the app hard-deletes (CLAUDE.md §7 exception): all / one /
 * selected, always behind an explicit confirm. The JSON export is the safety net.
 */
export function TrashView() {
  const { data: items = [] } = useTrash()
  const { data: spaces = [] } = useSpaceTrash()

  const restoreItem = useRestoreItem()
  const purgeItem = usePurgeItem()
  const emptyTrash = useEmptyTrash()
  const purgeItems = usePurgeItems()
  const restoreSpace = useRestoreSpace()
  const purgeSpace = usePurgeSpace()
  const emptySpaceTrash = useEmptySpaceTrash()
  const purgeSpaces = usePurgeSpaces()

  const [selItems, setSelItems] = useState<Set<number>>(new Set())
  const [selSpaces, setSelSpaces] = useState<Set<number>>(new Set())

  const total = items.length + spaces.length
  const selectedCount = selItems.size + selSpaces.size

  const toggle = (set: Set<number>, setFn: (s: Set<number>) => void, id: number) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFn(next)
  }

  const emptyAll = () => {
    if (
      !window.confirm(
        `Permanently delete everything in Trash (${total})? This can't be undone.`,
      )
    )
      return
    if (items.length) emptyTrash.mutate()
    if (spaces.length) emptySpaceTrash.mutate()
    setSelItems(new Set())
    setSelSpaces(new Set())
  }

  const purgeSelected = () => {
    if (
      !window.confirm(
        `Permanently delete ${selectedCount} selected? This can't be undone.`,
      )
    )
      return
    if (selItems.size)
      purgeItems.mutate([...selItems], { onSuccess: () => setSelItems(new Set()) })
    if (selSpaces.size)
      purgeSpaces.mutate([...selSpaces], {
        onSuccess: () => setSelSpaces(new Set()),
      })
  }

  const restoreSelected = () => {
    selItems.forEach((id) => restoreItem.mutate(id))
    selSpaces.forEach((id) => restoreSpace.mutate(id))
    setSelItems(new Set())
    setSelSpaces(new Set())
  }

  return (
    <div className="space-y-6 pb-24">
      <header className="flex items-center gap-3">
        <Trash2 className="size-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "item" : "items"} · restore or delete forever
          </p>
        </div>
        {total > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={emptyAll}
            className="ml-auto gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Empty trash
          </Button>
        )}
      </header>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Trash is empty. Deleted items and spaces land here and can be restored.
        </div>
      ) : (
        <div className="space-y-6">
          {spaces.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Spaces ({spaces.length})
              </h2>
              <ul className="space-y-2">
                {spaces.map((s) => (
                  <TrashRow
                    key={`space-${s.id}`}
                    selected={selSpaces.has(s.id)}
                    onToggle={() => toggle(selSpaces, setSelSpaces, s.id)}
                    icon={
                      s.icon ? (
                        <span className="text-base leading-none">{s.icon}</span>
                      ) : (
                        <Folder className="size-4 text-muted-foreground" />
                      )
                    }
                    title={s.name}
                    subtitle={`Space · deleted ${whenDeleted(s.deleted_at)}`}
                    onRestore={() => restoreSpace.mutate(s.id)}
                    onPurge={() => {
                      if (
                        window.confirm(
                          `Permanently delete "${s.name}" and everything inside it? This can't be undone.`,
                        )
                      )
                        purgeSpace.mutate(s.id)
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          {items.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Items ({items.length})
              </h2>
              <ul className="space-y-2">
                {items.map((it) => (
                  <TrashRow
                    key={`item-${it.id}`}
                    selected={selItems.has(it.id)}
                    onToggle={() => toggle(selItems, setSelItems, it.id)}
                    icon={<TypeBadge type={it.type} />}
                    title={it.title}
                    subtitle={`Deleted ${whenDeleted(it.deleted_at)}`}
                    onRestore={() => restoreItem.mutate(it.id)}
                    onPurge={() => {
                      if (
                        window.confirm(
                          `Permanently delete "${it.title}"? This can't be undone.`,
                        )
                      )
                        purgeItem.mutate(it.id)
                    }}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card/95 px-3 py-2 shadow-lg backdrop-blur sm:bottom-6">
          <span className="px-1 text-sm font-medium">{selectedCount} selected</span>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={restoreSelected}>
            <RotateCcw className="size-4" />
            Restore
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={purgeSelected}
          >
            <Trash2 className="size-4" />
            Delete forever
          </Button>
        </div>
      )}
    </div>
  )
}

function TrashRow({
  selected,
  onToggle,
  icon,
  title,
  subtitle,
  onRestore,
  onPurge,
}: {
  selected: boolean
  onToggle: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
  onRestore: () => void
  onPurge: () => void
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <button
        type="button"
        aria-label={selected ? "Deselect" : "Select"}
        onClick={onToggle}
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded border",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40",
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </button>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onRestore}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Restore"
        aria-label="Restore"
      >
        <RotateCcw className="size-4" />
      </button>
      <button
        type="button"
        onClick={onPurge}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        title="Delete forever"
        aria-label="Delete forever"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  )
}
