import { useEffect, useState, type ReactNode } from "react"
import {
  CalendarClock,
  Check,
  ExternalLink,
  MapPin,
  Pencil,
  Pin,
  Plus,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSpaces, useStatusIndex, useUpdateItem } from "@/lib/queries"
import { FilesPanel } from "@/features/files/FilesPanel"
import { getSubtasks, withSubtasks, type Subtask } from "@/lib/subtasks"
import { cn } from "@/lib/utils"
import { TypeBadge } from "./ItemRow"
import type { Item } from "@/lib/api"

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}

/** Format a stored datetime for display — date, plus time if it isn't midnight. */
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const hasTime = !iso.endsWith("T00:00:00") && (d.getHours() || d.getMinutes())
  return hasTime
    ? `${date}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
    : date
}

/** Tiny markdown-lite: preserve line breaks and render **bold** segments. */
function renderBody(body: string): ReactNode {
  return body.split("\n").map((line, li) => {
    if (line.trim() === "") return <br key={li} />
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
    return (
      <p key={li} className="mb-1.5 last:mb-0">
        {parts.map((p, pi) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={pi} className="font-semibold text-foreground">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <span key={pi}>{p}</span>
          ),
        )}
      </p>
    )
  })
}

function HeroImage({ src, href }: { src: string; href?: string }) {
  const [errored, setErrored] = useState(false)
  if (errored) return null
  // Show the whole image (no crop): scale to fit a max height, preserve aspect,
  // centred on a subtle backdrop so any letterboxing looks intentional.
  const img = (
    <img
      src={src}
      alt=""
      onError={() => setErrored(true)}
      className="mx-auto block max-h-80 max-w-full rounded-lg object-contain"
    />
  )
  return (
    <div className="flex justify-center rounded-lg border bg-muted/30 p-2">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className="block">
          {img}
        </a>
      ) : (
        img
      )}
    </div>
  )
}

interface ItemDetailDialogProps {
  item: Item | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Switch to edit mode for this item. */
  onEdit: (item: Item) => void
}

/**
 * Read-only "full post" view — clicking an item opens this (a calm, zoomed-in
 * card) instead of jumping straight into the editor. An Edit button hands off to
 * the editor for changes.
 */
export function ItemDetailDialog({
  item,
  open,
  onOpenChange,
  onEdit,
}: ItemDetailDialogProps) {
  const index = useStatusIndex()
  const { data: spaces } = useSpaces()
  const update = useUpdateItem()
  const [subs, setSubs] = useState<Subtask[]>([])
  const [subInput, setSubInput] = useState("")
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    setSubs(item ? getSubtasks(item) : [])
    setSubInput("")
    setPinned(item ? !!item.is_pinned : false)
  }, [item])

  if (!item) return null

  const togglePin = () => {
    const next = !pinned
    setPinned(next)
    update.mutate({ id: item.id, body: { is_pinned: next } })
  }

  const toggleSub = (i: number) => {
    const next = subs.map((s, j) => (j === i ? { ...s, done: !s.done } : s))
    setSubs(next)
    update.mutate({ id: item.id, body: { metadata: withSubtasks(item, next) } })
  }
  const addSub = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    const next = [...subs, { text: t, done: false }]
    setSubs(next)
    setSubInput("")
    update.mutate({ id: item.id, body: { metadata: withSubtasks(item, next) } })
  }
  const doneCount = subs.filter((s) => s.done).length

  const url = asString(item.metadata?.url)
  const image = asString(item.metadata?.preview_image)
  const location = asString(item.metadata?.location)
  const status =
    item.status_id != null ? index.byId.get(item.status_id) : undefined
  const space = spaces?.find((s) => s.id === item.space_id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-2xl">
        {image && <HeroImage src={image} href={url} />}

        <DialogHeader>
          <DialogTitle className="pr-6 text-xl leading-snug">
            {item.title}
          </DialogTitle>
        </DialogHeader>

        {/* meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <TypeBadge type={item.type} />
          {status && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: status.color }}
              />
              {status.label}
            </span>
          )}
          {item.due_at && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" />
              {formatWhen(item.due_at)}
            </span>
          )}
          {location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" />
              {location}
            </span>
          )}
          {space && (
            <span className="inline-flex items-center gap-1">
              <span className="leading-none">{space.icon ?? "📁"}</span>
              {space.name}
            </span>
          )}
        </div>

        {item.body && (
          <div className="text-sm leading-relaxed text-foreground/90">
            {renderBody(item.body)}
          </div>
        )}

        {/* Checklist is available on every item, not only where subtasks exist. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Checklist</span>
            {subs.length > 0 && (
              <span className="text-muted-foreground">
                {doneCount}/{subs.length}
              </span>
            )}
          </div>
          {subs.length > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(doneCount / subs.length) * 100}%` }}
              />
            </div>
          )}
          {subs.length > 0 && (
            <ul className="space-y-0.5">
              {subs.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => toggleSub(i)}
                    className="flex w-full items-start gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-accent"
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                        s.done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {s.done && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className={cn(s.done && "text-muted-foreground line-through")}>
                      {s.text}
                    </span>
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
                  addSub(subInput)
                }
              }}
              placeholder="Add a checklist item…"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => addSub(subInput)}
              className="shrink-0"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {url && (
          <Button asChild variant="outline" className="w-fit">
            <a href={url} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="size-4" />
              Open link
            </a>
          </Button>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Attachments</p>
          <FilesPanel target={{ item_id: item.id }} />
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={togglePin}
            className={cn("gap-1.5", pinned && "text-primary")}
          >
            <Pin className={cn("size-4", pinned && "fill-current")} />
            {pinned ? "Pinned" : "Pin"}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => onEdit(item)}>
              <Pencil className="size-4" />
              Edit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
