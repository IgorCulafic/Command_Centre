import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  CircleDot,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ListChecks,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useAttachments,
  useDeleteItem,
  useItems,
  useRestoreItem,
  useSpaces,
  useStatusIndex,
  useUpdateItem,
} from "@/lib/queries"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { groupByStatus, statusesFor, type StatusIndex } from "@/lib/status"
import { ItemRow } from "@/features/items/ItemRow"
import { useDialogs } from "@/features/items/dialogs"
import { FilesPanel } from "@/features/files/FilesPanel"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/api"

/** Per-space view: items grouped into a section per status; completed folded below. */
export function SpaceView() {
  const { spaceId } = useParams()
  const id = Number(spaceId)

  const { data: spaces } = useSpaces()
  const { data: items, isLoading } = useItems({ space_id: id })
  const index = useStatusIndex()
  const { openCapture } = useDialogs()
  const { data: libraryFiles } = useAttachments({ space_id: id })
  const update = useUpdateItem()
  const del = useDeleteItem()
  const restore = useRestoreItem()

  const [completedOpen, setCompletedOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const space = useMemo(
    () => (spaces ?? []).find((s) => s.id === id),
    [spaces, id],
  )
  const isGroup = !!space?.is_group
  const childSpaces = useMemo(
    () => (spaces ?? []).filter((s) => s.parent_id === id),
    [spaces, id],
  )

  const { activeGroups, closedGroups, noStatus, completedCount } = useMemo(() => {
    const { groups, noStatus } = groupByStatus(index, items ?? [])
    const active = groups.filter((g) => g.status.behavior === "active")
    const closed = groups.filter((g) => g.status.behavior !== "active")
    return {
      activeGroups: active,
      closedGroups: closed,
      noStatus,
      completedCount: closed.reduce((n, g) => n + g.items.length, 0),
    }
  }, [items, index])

  const total = items?.length ?? 0
  const hasActive = activeGroups.length > 0 || noStatus.length > 0
  const itemsById = useMemo(
    () => new Map((items ?? []).map((it) => [it.id, it])),
    [items],
  )

  const exitSelect = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }
  const toggleSelect = (itemId: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })

  const selected = [...selectedIds]

  // Statuses offered in bulk = the set of the first selected item that has one
  // (within a space, items share the space's status set).
  const bulkStatuses = (() => {
    for (const sid of selected) {
      const it = itemsById.get(sid)
      if (it?.status_id != null) {
        const set = statusesFor(index, it.status_id)
        if (set.length) return set
      }
    }
    return []
  })()

  const bulkSetStatus = (statusId: number, label: string) => {
    const prev = new Map<number, number | null>()
    for (const sid of selected) {
      const it = itemsById.get(sid)
      if (!it) continue
      prev.set(sid, it.status_id ?? null)
      update.mutate({ id: sid, body: { status_id: statusId } })
    }
    toast.success(
      `Set ${prev.size} item${prev.size === 1 ? "" : "s"} to ${label}.`,
      {
        action: {
          label: "Undo",
          onClick: () =>
            prev.forEach((ps, sid) =>
              update.mutate({ id: sid, body: { status_id: ps } }),
            ),
        },
      },
    )
    exitSelect()
  }

  const bulkMove = (targetSpaceId: number) => {
    for (const sid of selected) {
      update.mutate({ id: sid, body: { space_id: targetSpaceId } })
    }
    toast.success(`Moved ${selected.length} item${selected.length === 1 ? "" : "s"}.`)
    exitSelect()
  }

  const bulkDelete = () => {
    const ids = [...selected]
    for (const sid of ids) del.mutate(sid)
    toast(`Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}.`, {
      action: {
        label: "Undo",
        onClick: () => ids.forEach((sid) => restore.mutate(sid)),
      },
    })
    exitSelect()
  }

  const sectionProps = {
    index,
    selectionMode: selectMode,
    selectedIds,
    onSelect: toggleSelect,
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="text-2xl leading-none">{space?.icon ?? "📁"}</span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {space?.name ?? "Space"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "item" : "items"}
          </p>
        </div>
        {!isGroup && (
          <div className="ml-auto flex items-center gap-2">
            {total > 0 &&
              (selectMode ? (
                <Button size="sm" variant="ghost" onClick={exitSelect}>
                  Done
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setSelectMode(true)}
                >
                  <ListChecks className="size-4" />
                  Select
                </Button>
              ))}
            <Button size="sm" className="gap-1.5" onClick={() => openCapture(id)}>
              <Plus className="size-4" />
              Add item
            </Button>
          </div>
        )}
      </header>

      {space?.description && <SpaceDescription text={space.description} />}

      {isGroup ? (
        childSpaces.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            This group is empty. Move spaces into it from a space's menu (Move to
            group), or drag them onto it in the sidebar.
          </div>
        ) : (
          <ul className="space-y-2">
            {childSpaces.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/space/${s.id}`}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition hover:bg-accent/40"
                >
                  <span className="text-base leading-none">{s.icon ?? "📁"}</span>
                  <span className="flex-1 truncate text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.is_group ? "Group" : "Space"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : isLoading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-14 animate-pulse rounded-lg border bg-card"
            />
          ))}
        </ul>
      ) : total === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          This space is empty. Items added here will appear in this list.
        </div>
      ) : (
        <div className="space-y-6">
          {hasActive ? (
            <div className="space-y-6">
              {activeGroups.map((g) => (
                <StatusSection
                  key={g.status.id}
                  label={g.status.label}
                  color={g.status.color}
                  items={g.items}
                  {...sectionProps}
                />
              ))}
              {noStatus.length > 0 && (
                <StatusSection label="Other" items={noStatus} {...sectionProps} />
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nothing active here. ✨
            </div>
          )}

          {completedCount > 0 && (
            <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight
                  className={cn(
                    "size-4 transition-transform",
                    completedOpen && "rotate-90",
                  )}
                />
                Completed ({completedCount})
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-5 pt-3">
                {closedGroups.map((g) => (
                  <StatusSection
                    key={g.status.id}
                    label={g.status.label}
                    color={g.status.color}
                    items={g.items}
                    {...sectionProps}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {!isGroup && (
        <Collapsible open={libraryOpen} onOpenChange={setLibraryOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight
              className={cn(
                "size-4 transition-transform",
                libraryOpen && "rotate-90",
              )}
            />
            <FolderOpen className="size-4" />
            Library{libraryFiles?.length ? ` (${libraryFiles.length})` : ""}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <FilesPanel target={{ space_id: id }} />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Bulk action bar */}
      {selectMode && selected.length > 0 && (
        <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card/95 px-3 py-2 shadow-lg backdrop-blur sm:bottom-6">
          <span className="px-1 text-sm font-medium">{selected.length} selected</span>
          {bulkStatuses.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-1.5">
                  <CircleDot className="size-4" />
                  Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {bulkStatuses.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => bulkSetStatus(s.id, s.label)}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5">
                <FolderOpen className="size-4" />
                Move
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
              {(spaces ?? [])
                .filter((s) => s.id !== id && !s.is_group)
                .map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => bulkMove(s.id)}>
                    <span className="leading-none">{s.icon ?? "📁"}</span>
                    {s.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={bulkDelete}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={exitSelect}
            className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function SpaceDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const isLong = text.length > 140 || text.includes("\n")

  return (
    <div className="rounded-lg border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
      <p className={open || !isLong ? "whitespace-pre-wrap" : "line-clamp-2"}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
          />
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

function StatusSection({
  label,
  color,
  items,
  index,
  selectionMode,
  selectedIds,
  onSelect,
}: {
  label: string
  color?: string
  items: Item[]
  index: StatusIndex
  selectionMode: boolean
  selectedIds: Set<number>
  onSelect: (id: number) => void
}) {
  const update = useUpdateItem()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Pinned first, then position order (manual order is authoritative).
  const ordered = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          Number(!!b.is_pinned) - Number(!!a.is_pinned) ||
          a.position - b.position,
      ),
    [items],
  )
  const ids = ordered.map((i) => i.id)

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(Number(active.id))
    const to = ids.indexOf(Number(over.id))
    if (from < 0 || to < 0) return
    arrayMove(ordered, from, to).forEach((it, idx) => {
      if (it.position !== idx) update.mutate({ id: it.id, body: { position: idx } })
    })
  }

  const header = (
    <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {color && (
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span>{label}</span>
      <span className="text-muted-foreground/60">{items.length}</span>
    </div>
  )

  if (selectionMode) {
    return (
      <section className="space-y-2">
        {header}
        <ul className="space-y-2">
          {ordered.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              selectionMode
              selected={selectedIds.has(item.id)}
              onSelect={onSelect}
            />
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section className="space-y-2">
      {header}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {ordered.map((item) => (
              <SortableItemRow key={item.id} item={item} index={index} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  )
}

function SortableItemRow({ item, index }: { item: Item; index: StatusIndex }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: item.id })
  return (
    <ItemRow
      item={item}
      index={index}
      reorder={{
        setNodeRef,
        style: { transform: CSS.Transform.toString(transform), transition },
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as unknown as Record<string, unknown> | undefined,
        isDragging,
      }}
    />
  )
}
