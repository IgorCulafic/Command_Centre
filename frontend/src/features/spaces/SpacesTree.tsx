import { useMemo, useState, type CSSProperties } from "react"
import { NavLink } from "react-router-dom"
import { ChevronRight, Folder, GripVertical } from "lucide-react"
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
import { useUpdateSpace } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { ActionMenu } from "@/features/actions/ActionMenu"
import { ObjectContextMenu } from "@/features/actions/ObjectContextMenu"
import { useSpaceActions } from "@/features/actions/useSpaceActions"
import type { SpaceNode } from "@/lib/tree"

interface SpacesTreeProps {
  nodes: SpaceNode[]
  counts: Map<number, number>
  /** Called after navigating — used to close the mobile drawer. */
  onNavigate?: () => void
}

/** The nested, collapsible Spaces tree shown in the sidebar and drawer. */
export function SpacesTree({ nodes, counts, onNavigate }: SpacesTreeProps) {
  // Track collapsed nodes (default: everything expanded).
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const updateSpace = useUpdateSpace()

  // Drag reorder (@dnd-kit) + the menu's move/reorder helpers all key off a
  // parent lookup and a flat list of every node.
  const flat = useMemo(() => {
    const out: SpaceNode[] = []
    const walk = (ns: SpaceNode[]) => {
      for (const n of ns) {
        out.push(n)
        walk(n.children)
      }
    }
    walk(nodes)
    return out
  }, [nodes])

  const parentOf = useMemo(() => {
    const m = new Map<number, number | null>()
    const walk = (ns: SpaceNode[], parent: number | null) => {
      for (const n of ns) {
        m.set(n.id, parent)
        walk(n.children, n.id)
      }
    }
    walk(nodes, null)
    return m
  }, [nodes])

  const isDescendant = (ancestorId: number, nodeId: number): boolean => {
    let cur = parentOf.get(nodeId) ?? null
    while (cur != null) {
      if (cur === ancestorId) return true
      cur = parentOf.get(cur) ?? null
    }
    return false
  }

  // Re-parent a space (used by the menu: "Move to top level"). Cycle-safe.
  const move = (draggedId: number, newParentId: number | null) => {
    if (draggedId === newParentId) return
    if (newParentId != null && isDescendant(draggedId, newParentId)) return
    if ((parentOf.get(draggedId) ?? null) === newParentId) return
    updateSpace.mutate({ id: draggedId, body: { parent_id: newParentId } })
  }

  // Reorder a space among its siblings by re-numbering positions.
  const reorderSibling = (
    nodeId: number,
    siblings: SpaceNode[],
    dir: "up" | "down",
  ) => {
    const sorted = [...siblings].sort((a, b) => a.position - b.position)
    const i = sorted.findIndex((s) => s.id === nodeId)
    const j = dir === "up" ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= sorted.length) return
    ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
    sorted.forEach((s, idx) => {
      if (s.position !== idx) {
        updateSpace.mutate({ id: s.id, body: { position: idx } })
      }
    })
  }

  // Drag-and-drop reorder within a sibling level (dropping across levels is a
  // no-op — re-nesting is done via the menu, which is unambiguous).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const activeId = Number(active.id)
    const overId = Number(over.id)
    const ap = parentOf.get(activeId) ?? null
    const op = parentOf.get(overId) ?? null
    if (ap !== op) return // only reorder within the same level
    const siblings = flat
      .filter((s) => (parentOf.get(s.id) ?? null) === ap)
      .sort((a, b) => a.position - b.position)
    const from = siblings.findIndex((s) => s.id === activeId)
    const to = siblings.findIndex((s) => s.id === overId)
    if (from < 0 || to < 0) return
    arrayMove(siblings, from, to).forEach((s, idx) => {
      if (s.position !== idx) {
        updateSpace.mutate({ id: s.id, body: { position: idx } })
      }
    })
  }

  const drag: DragApi = { move, reorderSibling }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <ul className="space-y-0.5">
        <SortableContext
          items={nodes.map((n) => n.id)}
          strategy={verticalListSortingStrategy}
        >
          {nodes.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              siblings={nodes}
              depth={0}
              counts={counts}
              collapsed={collapsed}
              toggle={toggle}
              onNavigate={onNavigate}
              drag={drag}
            />
          ))}
        </SortableContext>
      </ul>
    </DndContext>
  )
}

interface DragApi {
  move: (draggedId: number, newParentId: number | null) => void
  reorderSibling: (
    nodeId: number,
    siblings: SpaceNode[],
    dir: "up" | "down",
  ) => void
}

interface TreeRowProps {
  node: SpaceNode
  siblings: SpaceNode[]
  depth: number
  counts: Map<number, number>
  collapsed: Set<number>
  toggle: (id: number) => void
  onNavigate?: () => void
  drag: DragApi
}

function TreeRow({
  node,
  siblings,
  depth,
  counts,
  collapsed,
  toggle,
  onNavigate,
  drag,
}: TreeRowProps) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const count = counts.get(node.id) ?? 0

  const sortedSibs = [...siblings].sort((a, b) => a.position - b.position)
  const sibIndex = sortedSibs.findIndex((s) => s.id === node.id)
  const isFirst = sibIndex <= 0
  const isLast = sibIndex === sortedSibs.length - 1

  const actions = useSpaceActions({
    node,
    depth,
    isFirst,
    isLast,
    onReorder: (dir) => drag.reorderSibling(node.id, siblings, dir),
    onMoveToTopLevel: () => drag.move(node.id, null),
  })

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: node.id })
  const rowStyle: CSSProperties = {
    paddingLeft: depth * 14,
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li>
      <ObjectContextMenu groups={actions}>
        <div
          ref={setNodeRef}
          className={cn(
            "group flex items-center gap-0.5 rounded-md",
            isDragging && "relative z-10 opacity-70",
          )}
          style={rowStyle}
        >
          <span
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${node.name}`}
            className="grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/50 hover:bg-sidebar-accent hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </span>

          {node.is_group ? (
            // A group is a collapsible section header — it holds spaces, not items,
            // so the whole row toggles its children instead of navigating.
            <button
              type="button"
              onClick={() => toggle(node.id)}
              className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0 transition-transform",
                  !isCollapsed && "rotate-90",
                )}
              />
              <SpaceIcon node={node} />
              <span className="flex-1 truncate text-left">{node.name}</span>
            </button>
          ) : (
            <>
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggle(node.id)}
                  aria-label={isCollapsed ? "Expand" : "Collapse"}
                  className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 transition-transform",
                      !isCollapsed && "rotate-90",
                    )}
                  />
                </button>
              ) : (
                <span className="w-5 shrink-0" />
              )}

              <NavLink
                to={`/space/${node.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isActive &&
                      "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                  )
                }
              >
                <SpaceIcon node={node} />
                <span className="flex-1 truncate">{node.name}</span>
                {count > 0 && (
                  <span className="ml-auto rounded-full bg-sidebar-accent px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground group-hover:bg-sidebar/60">
                    {count}
                  </span>
                )}
              </NavLink>
            </>
          )}

          <ActionMenu
            groups={actions}
            align="start"
            side="right"
            label={`Actions for ${node.name}`}
            className="size-6 opacity-70 hover:bg-sidebar-accent"
          />
        </div>
      </ObjectContextMenu>

      {hasChildren && !isCollapsed && (
        <ul className="mt-0.5 space-y-0.5">
          <SortableContext
            items={node.children.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {node.children.map((child) => (
              <TreeRow
                key={child.id}
                node={child}
                siblings={node.children}
                depth={depth + 1}
                counts={counts}
                collapsed={collapsed}
                toggle={toggle}
                onNavigate={onNavigate}
                drag={drag}
              />
            ))}
          </SortableContext>
        </ul>
      )}
    </li>
  )
}

function SpaceIcon({ node }: { node: SpaceNode }) {
  if (node.icon) {
    return <span className="text-base leading-none">{node.icon}</span>
  }
  if (node.color) {
    return (
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: node.color }}
      />
    )
  }
  return <Folder className="size-4 shrink-0 text-muted-foreground" />
}
