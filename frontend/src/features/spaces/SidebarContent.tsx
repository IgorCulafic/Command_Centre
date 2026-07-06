import { useMemo, type ReactNode } from "react"
import { NavLink } from "react-router-dom"
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CalendarClock,
  Flag,
  Home,
  Pin,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  useArchivedSpaces,
  useItems,
  useSpaces,
  useSpaceTrash,
  useTrash,
  useUnarchiveSpace,
} from "@/lib/queries"
import { buildSpaceTree } from "@/lib/tree"
import { cn } from "@/lib/utils"
import { useDialogs } from "@/features/items/dialogs"
import { ActionMenu } from "@/features/actions/ActionMenu"
import { ObjectContextMenu } from "@/features/actions/ObjectContextMenu"
import { useSpaceActions } from "@/features/actions/useSpaceActions"
import { SpacesTree } from "./SpacesTree"
import type { Space } from "@/lib/api"

interface SidebarContentProps {
  /** Called after a navigation — used to close the mobile drawer. */
  onNavigate?: () => void
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { data: spaces, isLoading } = useSpaces()
  const { data: items } = useItems()
  const { data: archived } = useArchivedSpaces()
  const { data: trashItems } = useTrash()
  const { data: trashSpaces } = useSpaceTrash()
  const { openCapture, openSpaceCreate, openSearch } = useDialogs()
  const trashCount = (trashItems?.length ?? 0) + (trashSpaces?.length ?? 0)

  // Item-count badges per space (CLAUDE.md §9). Count every non-deleted item.
  const counts = useMemo(() => {
    const m = new Map<number, number>()
    for (const it of items ?? []) {
      m.set(it.space_id, (m.get(it.space_id) ?? 0) + 1)
    }
    return m
  }, [items])

  const tree = useMemo(() => buildSpaceTree(spaces ?? []), [spaces])
  const pinned = (spaces ?? []).filter((s) => s.is_pinned)

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Brand */}
      <div className="flex items-center gap-2 px-2 pt-1">
        <div className="grid size-7 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          C
        </div>
        <span className="font-semibold tracking-tight">Command Center</span>
      </div>

      <Button
        className="w-full justify-start gap-2"
        size="sm"
        onClick={() => {
          onNavigate?.()
          openCapture()
        }}
      >
        <Plus className="size-4" />
        Quick Add
      </Button>

      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          openSearch()
        }}
        className="flex items-center gap-2 rounded-md border bg-background/40 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border bg-muted px-1.5 text-[10px] text-muted-foreground">
          Ctrl K
        </kbd>
      </button>

      <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
        <nav className="space-y-0.5">
          <SideLink
            to="/"
            end
            icon={<Home className="size-4" />}
            label="Today"
            onNavigate={onNavigate}
          />
          <SideLink
            to="/filter/overdue"
            icon={<AlertTriangle className="size-4" />}
            label="Overdue"
            onNavigate={onNavigate}
          />
          <SideLink
            to="/filter/week"
            icon={<CalendarClock className="size-4" />}
            label="Due this week"
            onNavigate={onNavigate}
          />
          <SideLink
            to="/filter/flagged"
            icon={<Flag className="size-4" />}
            label="Flagged"
            onNavigate={onNavigate}
          />
        </nav>

        {pinned.length > 0 && (
          <Section title="Pinned" icon={<Pin className="size-3" />}>
            <ul className="space-y-0.5">
              {pinned.map((s) => (
                <PinnedRow key={s.id} space={s} onNavigate={onNavigate} />
              ))}
            </ul>
          </Section>
        )}

        <Section
          title="Spaces"
          action={
            <button
              type="button"
              onClick={() => openSpaceCreate()}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
              New
            </button>
          }
        >
          {isLoading ? (
            <SkeletonRows />
          ) : (
            <SpacesTree nodes={tree} counts={counts} onNavigate={onNavigate} />
          )}
        </Section>

        {archived && archived.length > 0 && (
          <Section title="Archived" icon={<Archive className="size-3" />}>
            <ul className="space-y-0.5">
              {archived.map((s) => (
                <ArchivedRow key={s.id} space={s} onNavigate={onNavigate} />
              ))}
            </ul>
          </Section>
        )}
      </ScrollArea>

      <Separator />

      <div className="flex items-center gap-2">
        <NavLink
          to="/trash"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(rowClass, "flex-1", isActive && rowActiveClass)
          }
        >
          <Trash2 className="size-4" />
          <span className="flex-1 truncate">Trash</span>
          {trashCount > 0 && (
            <span className="rounded-full bg-sidebar-accent px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
              {trashCount}
            </span>
          )}
        </NavLink>
      </div>

      <SideLink
        to="/settings"
        icon={<Settings className="size-4" />}
        label="Settings"
        onNavigate={onNavigate}
      />
    </div>
  )
}

/** An archived space row with a one-tap Unarchive (bring back) button. */
function ArchivedRow({
  space,
  onNavigate,
}: {
  space: Space
  onNavigate?: () => void
}) {
  const unarchive = useUnarchiveSpace()
  return (
    <li className="group flex items-center gap-0.5 rounded-md">
      <NavLink
        to={`/space/${space.id}`}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            rowClass,
            "w-auto min-w-0 flex-1 text-sidebar-foreground/50",
            isActive && rowActiveClass,
          )
        }
      >
        <span className="text-base leading-none">{space.icon ?? "📦"}</span>
        <span className="flex-1 truncate">{space.name}</span>
      </NavLink>
      <button
        type="button"
        aria-label={`Unarchive ${space.name}`}
        title="Unarchive"
        onClick={() => unarchive.mutate(space.id)}
        className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-70 hover:bg-sidebar-accent hover:text-foreground"
      >
        <ArchiveRestore className="size-3.5" />
      </button>
    </li>
  )
}

const rowClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
const rowActiveClass =
  "bg-sidebar-accent font-medium text-sidebar-accent-foreground"

function SideLink({
  to,
  end,
  icon,
  label,
  onNavigate,
}: {
  to: string
  end?: boolean
  icon: ReactNode
  label: string
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => cn(rowClass, isActive && rowActiveClass)}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
    </NavLink>
  )
}

/** A pinned space row with the same kebab + right-click actions as the tree. */
function PinnedRow({
  space,
  onNavigate,
}: {
  space: Space
  onNavigate?: () => void
}) {
  // Pinned is a flat list, so the positional actions (reorder / un-nest) don't
  // apply — isFirst/isLast = true and depth 0 hide them.
  const actions = useSpaceActions({
    node: { ...space, children: [] },
    depth: 0,
    isFirst: true,
    isLast: true,
    onReorder: () => {},
    onMoveToTopLevel: () => {},
  })
  return (
    <li className="group flex items-center gap-0.5 rounded-md">
      <ObjectContextMenu groups={actions}>
        <NavLink
          to={`/space/${space.id}`}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(rowClass, "w-auto min-w-0 flex-1", isActive && rowActiveClass)
          }
        >
          <span className="text-base leading-none">{space.icon ?? "📌"}</span>
          <span className="flex-1 truncate">{space.name}</span>
        </NavLink>
      </ObjectContextMenu>
      <ActionMenu
        groups={actions}
        align="start"
        side="right"
        label={`Actions for ${space.name}`}
        className="size-6 opacity-70 hover:bg-sidebar-accent"
      />
    </li>
  )
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 px-2 pb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="space-y-1 px-2">
      {[60, 75, 50].map((w, i) => (
        <div
          key={i}
          className="h-7 animate-pulse rounded-md bg-sidebar-accent/60"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  )
}
