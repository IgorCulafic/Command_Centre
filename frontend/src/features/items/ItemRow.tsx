import { useState, type CSSProperties } from "react"
import { useNavigate } from "react-router-dom"
import {
  Check,
  ChevronDown,
  ExternalLink,
  GripVertical,
  ListChecks,
  Pin,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { hexToRgba } from "@/lib/color"
import { getSubtasks } from "@/lib/subtasks"
import { type StatusIndex } from "@/lib/status"
import { StatusMarker } from "./StatusMarker"
import { useDialogs } from "./dialogs"
import { ActionMenu } from "@/features/actions/ActionMenu"
import { ObjectContextMenu } from "@/features/actions/ObjectContextMenu"
import { useItemActions } from "@/features/actions/useItemActions"
import type { Item, Space } from "@/lib/api"

/** Strip the most common markdown so a body can be shown as a one-line preview. */
function previewBody(body: string): string {
  return body
    .replace(/[#*_`>~-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}

interface ReorderHandlers {
  setNodeRef: (el: HTMLElement | null) => void
  style: CSSProperties
  attributes: Record<string, unknown>
  listeners: Record<string, unknown> | undefined
  isDragging: boolean
}

interface ItemRowProps {
  item: Item
  index: StatusIndex
  /** When set, shows the originating space as a chip (used in cross-space feeds). */
  space?: Space
  /** Selection mode: show a checkbox; row click toggles selection instead of opening. */
  selectionMode?: boolean
  selected?: boolean
  onSelect?: (id: number) => void
  /** Drag-to-reorder wiring (provided by the parent list). */
  reorder?: ReorderHandlers
}

export function ItemRow({
  item,
  index,
  space,
  selectionMode,
  selected,
  onSelect,
  reorder,
}: ItemRowProps) {
  const { openDetail } = useDialogs()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const actions = useItemActions(item)

  const tags = Array.isArray(item.metadata?.tags)
    ? (item.metadata.tags as unknown[]).filter(
        (t): t is string => typeof t === "string",
      )
    : []
  const subs = getSubtasks(item)

  const status =
    item.status_id != null ? index.byId.get(item.status_id) : undefined
  const done = status?.behavior === "done"
  const dismissed = status?.behavior === "dismissed"

  const url = asString(item.metadata?.url)
  const previewImage = asString(item.metadata?.preview_image)
  const isLong =
    !!item.body && (item.body.length > 120 || item.body.includes("\n"))

  // Highlighter tint: a wash + a coloured left spine in the status's colour.
  const tint = status
    ? {
        borderLeftColor: status.color,
        backgroundColor: hexToRgba(status.color, 0.12),
      }
    : undefined

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <ObjectContextMenu groups={actions}>
    <li
      ref={reorder?.setNodeRef}
      onClick={() =>
        selectionMode && onSelect ? onSelect(item.id) : openDetail(item)
      }
      style={reorder ? { ...tint, ...reorder.style } : tint}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition",
        status ? "border-l-4 hover:brightness-110" : "bg-card hover:bg-accent/40",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        reorder?.isDragging && "relative z-10 opacity-70 shadow-lg",
      )}
    >
      {reorder && (
        <span
          {...reorder.attributes}
          {...reorder.listeners}
          onClick={stop}
          aria-label="Drag to reorder"
          className="mt-0.5 grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </span>
      )}

      {selectionMode ? (
        <span
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          )}
        >
          {selected && <Check className="size-3" strokeWidth={3} />}
        </span>
      ) : (
        <span className="mt-0.5 shrink-0">
          <StatusMarker item={item} index={index} />
        </span>
      )}

      {previewImage && (
        <PreviewThumb src={previewImage} href={url ?? previewImage} onClick={stop} />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {item.is_pinned && (
            <Pin className="size-3 shrink-0 fill-current text-primary" />
          )}
          <span
            className={cn(
              "truncate text-sm",
              (done || dismissed) && "text-muted-foreground line-through",
            )}
          >
            {item.title}
          </span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={stop}
              aria-label="Open link"
              className="shrink-0 text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>

        {item.body && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {expanded ? (
              <p className="whitespace-pre-wrap">{item.body}</p>
            ) : (
              <p className="truncate">{previewBody(item.body)}</p>
            )}
          </div>
        )}

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={stop}
            className="mt-0.5 block truncate text-xs text-primary/80 hover:underline"
          >
            {url}
          </a>
        )}

        {tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={(e) => {
                  stop(e)
                  navigate(`/tag/${encodeURIComponent(t)}`)
                }}
                className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground hover:bg-accent"
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-0.5 flex shrink-0 items-center gap-2">
        {subs.length > 0 && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
            title="Subtasks completed"
          >
            <ListChecks className="size-3" />
            {subs.filter((s) => s.done).length}/{subs.length}
          </span>
        )}
        {space && <SpaceChip space={space} />}
        {isLong && (
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={(e) => {
              stop(e)
              setExpanded((v) => !v)
            }}
            className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
        <TypeBadge type={item.type} />
        {!selectionMode && (
          <ActionMenu
            groups={actions}
            label={`Actions for ${item.title}`}
            className="opacity-70"
          />
        )}
      </div>
    </li>
    </ObjectContextMenu>
  )
}

/** Preview thumbnail that quietly disappears if the image fails to load
 * (broken external URL, removed file, …) — no broken-image icon. */
function PreviewThumb({
  src,
  href,
  onClick,
}: {
  src: string
  href: string
  onClick: (e: React.MouseEvent) => void
}) {
  const [errored, setErrored] = useState(false)
  if (errored) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={onClick}
      className="shrink-0"
    >
      <img
        src={src}
        alt=""
        onError={() => setErrored(true)}
        className="size-10 rounded-md border object-cover"
      />
    </a>
  )
}

export function SpaceChip({ space }: { space: Space }) {
  return (
    <span className="hidden shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground sm:inline-flex">
      <span className="leading-none">{space.icon ?? "📁"}</span>
      <span className="max-w-24 truncate">{space.name}</span>
    </span>
  )
}

const typeStyles: Record<string, string> = {
  task: "border-transparent bg-primary/15 text-primary",
  note: "border-transparent bg-amber-500/15 text-amber-500",
  link: "border-transparent bg-sky-500/15 text-sky-500",
  opportunity: "border-transparent bg-violet-500/15 text-violet-500",
  event: "border-transparent bg-emerald-500/15 text-emerald-500",
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 capitalize", typeStyles[type])}
    >
      {type}
    </Badge>
  )
}
