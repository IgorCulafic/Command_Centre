import { createElement } from "react"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bell,
  BellOff,
  CornerUpLeft,
  Eye,
  EyeOff,
  FolderInput,
  FolderPlus,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react"
import {
  useArchiveSpace,
  useDeleteSpace,
  useSpaces,
  useUpdateSpace,
} from "@/lib/queries"
import { useSettings } from "@/lib/settings"
import { useDialogs } from "@/features/items/dialogs"
import type { Space } from "@/lib/api"
import type { SpaceNode } from "@/lib/tree"
import type { Action, ActionGroup } from "./types"

/** Ids of every space beneath rootId (to keep "Move to group" cycle-free). */
function collectDescendantIds(spaces: Space[], rootId: number): Set<number> {
  const childrenByParent = new Map<number, number[]>()
  for (const s of spaces) {
    const p = s.parent_id ?? -1
    const arr = childrenByParent.get(p)
    if (arr) arr.push(s.id)
    else childrenByParent.set(p, [s.id])
  }
  const out = new Set<number>()
  const stack = [rootId]
  while (stack.length) {
    const cur = stack.pop() as number
    for (const child of childrenByParent.get(cur) ?? []) {
      if (!out.has(child)) {
        out.add(child)
        stack.push(child)
      }
    }
  }
  return out
}

/**
 * Tree-scoped mechanics the menu needs but can't compute on its own (reorder /
 * un-nest live in SpacesTree, where the whole tree is in scope). The hook owns
 * WHICH actions exist; the tree supplies HOW the positional ones run.
 */
export interface SpaceActionContext {
  node: SpaceNode
  depth: number
  isFirst: boolean
  isLast: boolean
  onReorder: (dir: "up" | "down") => void
  onMoveToTopLevel: () => void
}

/** Every action available on a space — shared by the kebab, right-click, palette. */
export function useSpaceActions(ctx: SpaceActionContext): ActionGroup[] {
  const { node, depth, isFirst, isLast, onReorder, onMoveToTopLevel } = ctx
  const { openSpaceCreate, openSpaceEdit } = useDialogs()
  const del = useDeleteSpace()
  const archive = useArchiveSpace()
  const update = useUpdateSpace()
  const { data: spaces } = useSpaces()
  const { isHiddenFromToday, toggleHiddenFromToday } = useSettings()
  const hidden = isHiddenFromToday(node.id)

  const groups: ActionGroup[] = [
    {
      id: "create",
      actions: [
        {
          id: "add-sub",
          label: "Add subspace",
          icon: createElement(FolderPlus, { className: "size-4" }),
          run: () => openSpaceCreate(node.id),
        },
      ],
    },
    {
      id: "edit",
      actions: [
        {
          id: "rename",
          label: "Rename…",
          icon: createElement(Pencil, { className: "size-4" }),
          run: () => openSpaceEdit(node),
        },
        {
          id: "pin",
          label: node.is_pinned ? "Unpin" : "Pin",
          icon: createElement(node.is_pinned ? PinOff : Pin, {
            className: "size-4",
          }),
          run: () =>
            update.mutate({ id: node.id, body: { is_pinned: !node.is_pinned } }),
        },
      ],
    },
  ]

  const order: Action[] = []
  if (!isFirst) {
    order.push({
      id: "up",
      label: "Move up",
      icon: createElement(ArrowUp, { className: "size-4" }),
      run: () => onReorder("up"),
    })
  }
  if (!isLast) {
    order.push({
      id: "down",
      label: "Move down",
      icon: createElement(ArrowDown, { className: "size-4" }),
      run: () => onReorder("down"),
    })
  }
  if (depth > 0) {
    order.push({
      id: "top",
      label: "Move to top level",
      icon: createElement(CornerUpLeft, { className: "size-4" }),
      run: onMoveToTopLevel,
    })
  }
  // Move into a group (a folder space). Exclude self, descendants, and the current
  // parent so the tree can't form a cycle.
  const descendants = collectDescendantIds(spaces ?? [], node.id)
  const groupTargets = (spaces ?? []).filter(
    (s) =>
      s.is_group &&
      s.id !== node.id &&
      s.id !== node.parent_id &&
      !descendants.has(s.id),
  )
  if (groupTargets.length) {
    order.push({
      id: "move-group",
      label: "Move to group",
      icon: createElement(FolderInput, { className: "size-4" }),
      submenu: groupTargets.map((g) => ({
        id: `move-group-${g.id}`,
        label: (g.icon ? `${g.icon} ` : "") + g.name,
        run: () => update.mutate({ id: node.id, body: { parent_id: g.id } }),
      })),
    })
  }
  if (order.length) groups.push({ id: "order", actions: order })

  groups.push({
    id: "today",
    actions: [
      {
        id: "archive",
        label: "Archive",
        icon: createElement(Archive, { className: "size-4" }),
        run: () => archive.mutate(node.id),
      },
      {
        id: "hide",
        label: hidden ? "Show on Today" : "Hide from Today",
        icon: createElement(hidden ? Eye : EyeOff, { className: "size-4" }),
        run: () => toggleHiddenFromToday(node.id),
      },
      {
        id: "mute",
        label: node.notifications_muted
          ? "Unmute notifications"
          : "Mute notifications",
        icon: createElement(node.notifications_muted ? Bell : BellOff, {
          className: "size-4",
        }),
        run: () =>
          update.mutate({
            id: node.id,
            body: { notifications_muted: !node.notifications_muted },
          }),
      },
    ],
  })

  groups.push({
    id: "danger",
    actions: [
      {
        id: "delete",
        label: "Delete",
        icon: createElement(Trash2, { className: "size-4" }),
        variant: "destructive",
        run: () => {
          if (
            window.confirm(
              `Delete "${node.name}" and everything inside it? You can restore it from Trash.`,
            )
          ) {
            del.mutate(node.id)
          }
        },
      },
    ],
  })

  return groups
}
