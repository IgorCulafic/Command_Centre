import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
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
import { MicButton } from "@/components/MicButton"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCreateItem, useSpaces } from "@/lib/queries"
import type { Space } from "@/lib/api"

const TYPES = ["task", "note", "link", "opportunity", "event"] as const

/** Best guess at the "dump it here" space (groups can't hold items). */
function pickInbox(spaces: Space[]): Space | undefined {
  const targets = spaces.filter((s) => !s.is_group)
  return (
    targets.find((s) => s.name.toLowerCase() === "inbox") ??
    targets.find((s) => s.is_pinned) ??
    targets[0]
  )
}

interface QuickCaptureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSpaceId?: number
}

export function QuickCaptureDialog({
  open,
  onOpenChange,
  defaultSpaceId,
}: QuickCaptureDialogProps) {
  const { data: spaces } = useSpaces()
  const create = useCreateItem()

  const [title, setTitle] = useState("")
  const [type, setType] = useState<string>("task")
  const [spaceId, setSpaceId] = useState<string>("")
  const [body, setBody] = useState("")
  const [due, setDue] = useState("")
  const [url, setUrl] = useState("")
  const [showMore, setShowMore] = useState(false)

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setTitle("")
    setType("task")
    setBody("")
    setDue("")
    setUrl("")
    setShowMore(false)
    const initial = defaultSpaceId ?? pickInbox(spaces ?? [])?.id
    setSpaceId(initial != null ? String(initial) : "")
  }, [open, defaultSpaceId, spaces])

  const canSubmit = title.trim().length > 0 && spaceId !== "" && !create.isPending

  const submit = () => {
    if (!canSubmit) return
    create.mutate(
      {
        space_id: Number(spaceId),
        type,
        title: title.trim(),
        body: body.trim() ? body : null,
        due_at: due ? `${due}T00:00:00` : null,
        priority: 0,
        position: 0,
        is_pinned: false,
        metadata: url.trim() ? { url: url.trim() } : {},
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick capture</DialogTitle>
          <DialogDescription>
            Dump it now, organise it later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="qc-title">Title</Label>
            <div className="flex gap-2">
              <Input
                id="qc-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="What's on your mind?"
              />
              <MicButton
                onText={(text) =>
                  setTitle((t) => (t.trim() ? t.trim() + " " : "") + text)
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Space</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Space" />
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
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                showMore && "rotate-180",
              )}
            />
            {showMore ? "Fewer details" : "Add details (notes, date, link)"}
          </button>

          {showMore && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="qc-notes">Notes</Label>
                <Textarea
                  id="qc-notes"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  placeholder="Markdown supported…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="qc-due">Due date</Label>
                  <Input
                    id="qc-due"
                    type="date"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qc-url">Link</Label>
                  <Input
                    id="qc-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
