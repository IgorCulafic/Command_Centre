import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useCreateSpace, useSpaces, useUpdateSpace } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { IconPicker } from "./IconPicker"
import type { Space } from "@/lib/api"

interface SpaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing an existing space… */
  editSpace?: Space | null
  /** …or creating one under this parent (null/undefined = top level). */
  parentId?: number | null
}

export function SpaceDialog({
  open,
  onOpenChange,
  editSpace,
  parentId,
}: SpaceDialogProps) {
  const { data: spaces } = useSpaces()
  const create = useCreateSpace()
  const update = useUpdateSpace()
  const isEdit = Boolean(editSpace)

  const [name, setName] = useState("")
  const [icon, setIcon] = useState("")
  const [color, setColor] = useState("#6366f1")
  const [description, setDescription] = useState("")
  const [isGroup, setIsGroup] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editSpace?.name ?? "")
    setIcon(editSpace?.icon ?? "")
    setColor(editSpace?.color ?? "#6366f1")
    setDescription(editSpace?.description ?? "")
    setIsGroup(editSpace?.is_group ?? false)
  }, [open, editSpace])

  const submit = () => {
    const n = name.trim()
    if (!n) return
    const desc = description.trim() || null
    if (editSpace) {
      update.mutate(
        {
          id: editSpace.id,
          body: { name: n, icon: icon || null, color, description: desc },
        },
        { onSuccess: () => onOpenChange(false) },
      )
    } else {
      const siblings = (spaces ?? []).filter(
        (s) => (s.parent_id ?? null) === (parentId ?? null),
      )
      const position =
        siblings.reduce((m, s) => Math.max(m, s.position), -1) + 1
      create.mutate(
        {
          name: n,
          icon: icon || null,
          color,
          description: desc,
          parent_id: parentId ?? null,
          position,
          is_pinned: false,
          is_favorite: false,
          is_group: isGroup,
          notifications_muted: false,
        },
        { onSuccess: () => onOpenChange(false) },
      )
    }
  }

  const title = isEdit
    ? "Edit space"
    : parentId != null
      ? "New subspace"
      : "New space"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {!isEdit && parentId != null && (
            <DialogDescription>
              Nested inside the selected space.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <IconPicker value={icon} onChange={setIcon} />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="sp-name">Name</Label>
              <Input
                id="sp-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="Space name"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Space colour"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="size-8 cursor-pointer rounded-md border bg-transparent p-0.5"
              />
              <span className="text-sm text-muted-foreground">{color}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-description">Description</Label>
            <Textarea
              id="sp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What's this space for? (optional)"
            />
          </div>

          {!isEdit && (
            <button
              type="button"
              onClick={() => setIsGroup((v) => !v)}
              className="flex w-full items-start gap-2 rounded-md border p-2.5 text-left hover:bg-accent/40"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                  isGroup
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40",
                )}
              >
                {isGroup && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="text-sm">
                Make this a group
                <span className="block text-xs text-muted-foreground">
                  A collapsible folder that holds spaces (not items) — for
                  grouping the sidebar.
                </span>
              </span>
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
