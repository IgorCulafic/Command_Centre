import { useEffect, useState } from "react"
import { Check, Plus, Trash2, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MicButton } from "@/components/MicButton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  useDeleteItem,
  useRestoreItem,
  useSpaces,
  useUpdateItem,
} from "@/lib/queries"
import { FilesPanel } from "@/features/files/FilesPanel"
import { getSubtasks, type Subtask } from "@/lib/subtasks"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/api"

const TYPES = ["task", "note", "link", "opportunity", "event"] as const

/** ISO datetime → "yyyy-mm-dd" for a <input type="date">. */
function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ""
}

/** "yyyy-mm-dd" for today + offsetDays (local time). */
function ymd(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

const DATE_CHIPS: { label: string; value: () => string }[] = [
  { label: "Today", value: () => ymd(0) },
  { label: "Tomorrow", value: () => ymd(1) },
  { label: "Next week", value: () => ymd(7) },
]

interface ItemEditDialogProps {
  item: Item | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ItemEditDialog({ item, open, onOpenChange }: ItemEditDialogProps) {
  const { data: spaces } = useSpaces()
  const update = useUpdateItem()
  const del = useDeleteItem()
  const restore = useRestoreItem()

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [type, setType] = useState("task")
  const [spaceId, setSpaceId] = useState("")
  const [priority, setPriority] = useState("0")
  const [due, setDue] = useState("")
  const [remind, setRemind] = useState("")
  const [recurrence, setRecurrence] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [subInput, setSubInput] = useState("")
  const [url, setUrl] = useState("")

  useEffect(() => {
    if (!item) return
    setTitle(item.title)
    setBody(item.body ?? "")
    setType(item.type)
    setSpaceId(String(item.space_id))
    setPriority(String(item.priority ?? 0))
    setDue(toDateInput(item.due_at))
    setRemind(item.remind_at ? item.remind_at.slice(0, 16) : "")
    const meta = item.metadata as Record<string, unknown> | null
    setRecurrence(typeof meta?.recurrence === "string" ? meta.recurrence : "")
    setTags(
      Array.isArray(meta?.tags)
        ? (meta.tags as unknown[]).filter((t): t is string => typeof t === "string")
        : [],
    )
    setTagInput("")
    setSubtasks(getSubtasks(item))
    setSubInput("")
    setUrl(typeof meta?.url === "string" ? meta.url : "")
  }, [item])

  const addSubtask = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    setSubtasks((prev) => [...prev, { text: t, done: false }])
    setSubInput("")
  }

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "")
    if (!t) return
    setTags((prev) =>
      prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t],
    )
    setTagInput("")
  }

  if (!item) return null

  const save = () => {
    // Merge recurrence into existing metadata (preserve url/image/location).
    const meta: Record<string, unknown> = {
      ...((item.metadata as Record<string, unknown> | null) ?? {}),
    }
    if (recurrence) meta.recurrence = recurrence
    else delete meta.recurrence
    if (tags.length) meta.tags = tags
    else delete meta.tags
    if (subtasks.length) meta.subtasks = subtasks
    else delete meta.subtasks
    if (url.trim()) meta.url = url.trim()
    else delete meta.url

    update.mutate(
      {
        id: item.id,
        body: {
          title: title.trim() || item.title,
          body: body.trim() ? body : null,
          type,
          space_id: Number(spaceId),
          priority: Number(priority) || 0,
          due_at: due ? `${due}T00:00:00` : null,
          remind_at: remind ? `${remind}:00` : null,
          metadata: meta,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  const remove = () => {
    const { id, title } = item
    del.mutate(id, {
      onSuccess: () => {
        onOpenChange(false)
        toast(`Deleted: ${title}`, {
          action: { label: "Undo", onClick: () => restore.mutate(id) },
        })
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ie-title">Title</Label>
            <div className="flex gap-2">
              <Input
                id="ie-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <MicButton
                onText={(text) =>
                  setTitle((t) => (t.trim() ? t.trim() + " " : "") + text)
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="ie-body">Notes</Label>
              <MicButton
                onText={(text) =>
                  setBody((b) => (b.trim() ? b.trim() + " " : "") + text)
                }
              />
            </div>
            <Textarea
              id="ie-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Markdown supported…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ie-url">Link</Label>
            <Input
              id="ie-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ie-tags">Tags</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                  >
                    #{t}
                    <button
                      type="button"
                      aria-label={`Remove ${t}`}
                      onClick={() =>
                        setTags((prev) => prev.filter((x) => x !== t))
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <Input
              id="ie-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  addTag(tagInput)
                } else if (
                  e.key === "Backspace" &&
                  tagInput === "" &&
                  tags.length
                ) {
                  setTags((prev) => prev.slice(0, -1))
                }
              }}
              onBlur={() => addTag(tagInput)}
              placeholder="Add a tag and press Enter…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Subtasks</Label>
            {subtasks.length > 0 && (
              <ul className="space-y-1">
                {subtasks.map((st, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={st.done ? "Mark not done" : "Mark done"}
                      onClick={() =>
                        setSubtasks((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, done: !x.done } : x,
                          ),
                        )
                      }
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border",
                        st.done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {st.done && <Check className="size-3" strokeWidth={3} />}
                    </button>
                    <input
                      value={st.text}
                      onChange={(e) =>
                        setSubtasks((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, text: e.target.value } : x,
                          ),
                        )
                      }
                      className={cn(
                        "flex-1 bg-transparent text-sm outline-none",
                        st.done && "text-muted-foreground line-through",
                      )}
                    />
                    <button
                      type="button"
                      aria-label="Remove subtask"
                      onClick={() =>
                        setSubtasks((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addSubtask(subInput)
                  }
                }}
                placeholder="Add a subtask…"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addSubtask(subInput)}
                className="shrink-0"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Space</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(spaces ?? [])
                    .filter((s) => !s.is_group)
                    .map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {(s.icon ?? "📁") + " " + s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ie-priority">Priority</Label>
              <Input
                id="ie-priority"
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ie-due">Due date</Label>
              <Input
                id="ie-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {DATE_CHIPS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setDue(c.value())}
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {c.label}
                  </button>
                ))}
                {due && (
                  <button
                    type="button"
                    onClick={() => setDue("")}
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ie-remind">Reminder</Label>
            <div className="flex gap-2">
              <Input
                id="ie-remind"
                type="datetime-local"
                value={remind}
                onChange={(e) => setRemind(e.target.value)}
              />
              {remind && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRemind("")}
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Pushes a notification at this time (needs reminders enabled in
              Settings).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Repeat</Label>
            <Select
              value={recurrence || "none"}
              onValueChange={(v) => setRecurrence(v === "none" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Don&apos;t repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Completing it creates the next occurrence.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Attachments</Label>
            <FilesPanel target={{ item_id: item.id }} />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={remove}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={update.isPending}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
