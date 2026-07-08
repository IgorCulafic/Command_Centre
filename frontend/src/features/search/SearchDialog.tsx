import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Flag,
  FolderPlus,
  Home,
  Plus,
  Search as SearchIcon,
  Settings,
} from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useItems, useSpaces } from "@/lib/queries"
import { useDialogs } from "@/features/items/dialogs"
import { TypeBadge } from "@/features/items/ItemRow"
import type { Item, Space } from "@/lib/api"

interface SearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Command {
  label: string
  icon: ReactNode
  keywords: string
  run: () => void
}

/** Command palette: actions + search across all items and spaces (client-side). */
export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const { data: items } = useItems()
  const { data: spaces } = useSpaces()
  const { openDetail, openCapture, openSpaceCreate } = useDialogs()
  const navigate = useNavigate()
  const [q, setQ] = useState("")

  useEffect(() => {
    if (open) setQ("")
  }, [open])

  const query = q.trim().toLowerCase()
  const spaceById = useMemo(
    () => new Map((spaces ?? []).map((s) => [s.id, s])),
    [spaces],
  )

  const close = () => onOpenChange(false)
  const commands: Command[] = useMemo(() => {
    const go = (path: string) => () => {
      close()
      navigate(path)
    }
    return [
      {
        label: "New item",
        keywords: "add create capture task note",
        icon: <Plus className="size-4" />,
        run: () => {
          close()
          openCapture()
        },
      },
      {
        label: "New space",
        keywords: "add create list folder",
        icon: <FolderPlus className="size-4" />,
        run: () => {
          close()
          openSpaceCreate()
        },
      },
      { label: "Go to Today", keywords: "home", icon: <Home className="size-4" />, run: go("/") },
      {
        label: "Open Calendar",
        keywords: "dates schedule",
        icon: <CalendarDays className="size-4" />,
        run: go("/calendar"),
      },
      {
        label: "Overdue",
        keywords: "late filter due",
        icon: <AlertTriangle className="size-4" />,
        run: go("/filter/overdue"),
      },
      {
        label: "Due this week",
        keywords: "filter upcoming",
        icon: <CalendarClock className="size-4" />,
        run: go("/filter/week"),
      },
      {
        label: "Flagged",
        keywords: "priority important filter",
        icon: <Flag className="size-4" />,
        run: go("/filter/flagged"),
      },
      {
        label: "Settings",
        keywords: "preferences theme status",
        icon: <Settings className="size-4" />,
        run: go("/settings"),
      },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, openCapture, openSpaceCreate])

  const matchedCommands = useMemo(() => {
    if (!query) return commands
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(query) ||
        c.keywords.includes(query),
    )
  }, [commands, query])

  const matchedSpaces = useMemo(() => {
    if (!query) return []
    return (spaces ?? [])
      .filter((s) => s.name.toLowerCase().includes(query))
      .slice(0, 6)
  }, [spaces, query])

  const matchedItems = useMemo(() => {
    if (!query) return []
    return (items ?? [])
      .filter((it) => {
        const url = it.metadata?.url
        return (
          it.title.toLowerCase().includes(query) ||
          (!!it.body && it.body.toLowerCase().includes(query)) ||
          (typeof url === "string" && url.toLowerCase().includes(query))
        )
      })
      .slice(0, 40)
  }, [items, query])

  const chooseItem = (it: Item) => {
    close()
    openDetail(it)
  }
  const chooseSpace = (s: Space) => {
    close()
    navigate(`/space/${s.id}`)
  }

  const nothing =
    query !== "" &&
    matchedCommands.length === 0 &&
    matchedSpaces.length === 0 &&
    matchedItems.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or run a command…"
            className="border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {nothing && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No matches for “{q}”.
            </p>
          )}

          {matchedCommands.length > 0 && (
            <Group title={query ? "Commands" : "Actions"}>
              {matchedCommands.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={c.run}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="text-muted-foreground">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </Group>
          )}

          {matchedSpaces.length > 0 && (
            <Group title="Spaces">
              {matchedSpaces.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => chooseSpace(s)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="leading-none">{s.icon ?? "📁"}</span>
                  <span className="truncate">{s.name}</span>
                </button>
              ))}
            </Group>
          )}

          {matchedItems.length > 0 && (
            <Group title="Items">
              {matchedItems.map((it) => {
                const sp = spaceById.get(it.space_id)
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => chooseItem(it)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate">{it.title}</span>
                    {sp && (
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        {(sp.icon ?? "📁") + " " + sp.name}
                      </span>
                    )}
                    <TypeBadge type={it.type} />
                  </button>
                )
              })}
            </Group>
          )}

          {!query && (
            <p className="px-2 py-2 text-center text-xs text-muted-foreground">
              Type to search items and spaces.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  )
}
