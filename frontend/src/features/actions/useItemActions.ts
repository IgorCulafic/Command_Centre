import { createElement } from "react"
import {
  Calendar,
  Circle,
  Copy,
  Eye,
  FolderInput,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  useDeleteItem,
  useDuplicateItem,
  useRestoreItem,
  useSpaces,
  useStatusIndex,
  useUpdateItem,
} from "@/lib/queries"
import { useSettings } from "@/lib/settings"
import { playCompleteDing } from "@/lib/sound"
import { statusesFor } from "@/lib/status"
import { useDialogs } from "@/features/items/dialogs"
import type { Item } from "@/lib/api"
import type { ActionGroup } from "./types"

/** "yyyy-mm-dd" for today + offsetDays (local time). Mirrors ItemEditDialog.ymd. */
function ymd(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Every action available on an item — the single definition consumed by the kebab,
 * the right-click menu, and the command palette. Mutations and the undo/sound idioms
 * are the same ones the editor and the status marker already use.
 */
export function useItemActions(item: Item): ActionGroup[] {
  const { openDetail, openItem } = useDialogs()
  const update = useUpdateItem()
  const del = useDeleteItem()
  const restore = useRestoreItem()
  const duplicate = useDuplicateItem()
  const index = useStatusIndex()
  const { data: spaces } = useSpaces()
  const { soundEnabled } = useSettings()

  const statuses = statusesFor(index, item.status_id)

  const setDue = (value: string | null) =>
    update.mutate({
      id: item.id,
      body: { due_at: value ? `${value}T00:00:00` : null },
    })

  const dueYmd = item.due_at ? item.due_at.slice(0, 10) : null
  const dueOptions = [
    { id: "today", label: "Today", days: 0 },
    { id: "tomorrow", label: "Tomorrow", days: 1 },
    { id: "next-week", label: "Next week", days: 7 },
  ]

  // Set status — mirrors StatusMarker.select (sound on done, undo when it leaves
  // the active list) so the two surfaces behave identically.
  const setStatus = (statusId: number) => {
    if (statusId === item.status_id) return
    const prev = item.status_id ?? null
    const next = index.byId.get(statusId)
    if (soundEnabled && next?.behavior === "done") playCompleteDing()
    update.mutate({ id: item.id, body: { status_id: statusId } })
    if (next && next.behavior !== "active") {
      const verb =
        next.behavior === "done" ? "Completed" : `Marked ${next.label}`
      toast.success(`${verb}: ${item.title}`, {
        action: {
          label: "Undo",
          onClick: () => update.mutate({ id: item.id, body: { status_id: prev } }),
        },
      })
    }
  }

  const remove = () => {
    const { id, title } = item
    del.mutate(id, {
      onSuccess: () =>
        toast(`Deleted: ${title}`, {
          action: { label: "Undo", onClick: () => restore.mutate(id) },
        }),
    })
  }

  const groups: ActionGroup[] = [
    {
      id: "open",
      actions: [
        {
          id: "open",
          label: "Open",
          icon: createElement(Eye, { className: "size-4" }),
          run: () => openDetail(item),
        },
        {
          id: "edit",
          label: "Edit…",
          icon: createElement(Pencil, { className: "size-4" }),
          run: () => openItem(item),
        },
      ],
    },
  ]

  if (statuses.length > 0) {
    groups.push({
      id: "status",
      actions: [
        {
          id: "status",
          label: "Set status",
          icon: createElement(Circle, { className: "size-4" }),
          submenu: statuses.map((s) => ({
            id: `status-${s.id}`,
            label: s.label,
            dotColor: s.color,
            active: s.id === item.status_id,
            run: () => setStatus(s.id),
          })),
        },
      ],
    })
  }

  const quick: ActionGroup = {
    id: "quick",
    actions: [
      {
        id: "due",
        label: "Due date",
        icon: createElement(Calendar, { className: "size-4" }),
        submenu: [
          ...dueOptions.map((o) => ({
            id: `due-${o.id}`,
            label: o.label,
            active: dueYmd === ymd(o.days),
            run: () => setDue(ymd(o.days)),
          })),
          {
            id: "due-clear",
            label: "Clear due date",
            disabled: !item.due_at,
            run: () => setDue(null),
          },
        ],
      },
    ],
  }
  // Groups hold spaces, not items, so they're never move targets.
  const moveTargets = (spaces ?? []).filter((s) => !s.is_group)
  if (moveTargets.length > 1) {
    quick.actions.push({
      id: "move",
      label: "Move to space",
      icon: createElement(FolderInput, { className: "size-4" }),
      submenu: moveTargets.map((s) => ({
        id: `move-${s.id}`,
        label: (s.icon ? `${s.icon} ` : "") + s.name,
        dotColor: s.icon ? undefined : (s.color ?? undefined),
        active: s.id === item.space_id,
        disabled: s.id === item.space_id,
        run: () => update.mutate({ id: item.id, body: { space_id: s.id } }),
      })),
    })
  }
  groups.push(quick)

  groups.push({
    id: "meta",
    actions: [
      {
        id: "pin",
        label: item.is_pinned ? "Unpin" : "Pin to top",
        icon: createElement(item.is_pinned ? PinOff : Pin, {
          className: "size-4",
        }),
        run: () =>
          update.mutate({ id: item.id, body: { is_pinned: !item.is_pinned } }),
      },
      {
        id: "duplicate",
        label: "Duplicate",
        icon: createElement(Copy, { className: "size-4" }),
        run: () =>
          duplicate.mutate(item.id, {
            onSuccess: () => toast.success(`Duplicated: ${item.title}`),
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
        run: remove,
      },
    ],
  })

  return groups
}
