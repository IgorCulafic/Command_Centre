import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Check, X } from "lucide-react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { toast } from "sonner"
import { useUpdateItem } from "@/lib/queries"
import { useSettings } from "@/lib/settings"
import { playCompleteDing } from "@/lib/sound"
import { cn } from "@/lib/utils"
import { nextStatus, statusesFor, type StatusIndex } from "@/lib/status"
import type { Item } from "@/lib/api"

interface StatusMarkerProps {
  item: Item
  index: StatusIndex
}

/**
 * The multi-state status marker (CLAUDE.md §7).
 *   • click            → advance to the next status in the set
 *   • right-click      → open the picker (desktop)
 *   • long-press       → open the picker (touch)
 * Colour and shape come from the selected status; behaviour drives the icon.
 */
export function StatusMarker({ item, index }: StatusMarkerProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const update = useUpdateItem()
  const { soundEnabled } = useSettings()
  const suppressClick = useRef(false)
  const longPressTimer = useRef<number | null>(null)

  // Clear any pending long-press timer if the row unmounts mid-press.
  useEffect(() => {
    return () => {
      if (longPressTimer.current != null) clearTimeout(longPressTimer.current)
    }
  }, [])

  const current =
    item.status_id != null ? index.byId.get(item.status_id) : undefined
  const set = statusesFor(index, item.status_id)

  // Items without a status (e.g. notes) get a static, non-interactive dot.
  if (!current) {
    return (
      <span
        className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/30"
        aria-hidden
      />
    )
  }

  const select = (statusId: number) => {
    setPickerOpen(false)
    if (statusId === item.status_id) return
    const prev = item.status_id ?? null
    const next = index.byId.get(statusId)
    if (soundEnabled && next?.behavior === "done") playCompleteDing()
    update.mutate({ id: item.id, body: { status_id: statusId } })
    // Offer undo when an item leaves the active list (done / dismissed).
    if (next && next.behavior !== "active") {
      const verb = next.behavior === "done" ? "Completed" : `Marked ${next.label}`
      toast.success(`${verb}: ${item.title}`, {
        action: {
          label: "Undo",
          onClick: () =>
            update.mutate({ id: item.id, body: { status_id: prev } }),
        },
      })
    }
  }

  const cycle = () => {
    const next = nextStatus(index, current.id)
    if (next) select(next.id)
  }

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  const startLongPress = () => {
    clearLongPress()
    longPressTimer.current = window.setTimeout(() => {
      suppressClick.current = true // stop the trailing click from cycling
      setPickerOpen(true)
    }, 450)
  }

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label={`Status: ${current.label}. Click to advance, right-click for options.`}
          title={current.label}
          onClick={(e) => {
            e.stopPropagation()
            if (suppressClick.current) {
              suppressClick.current = false
              return
            }
            cycle()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setPickerOpen(true)
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
            startLongPress()
          }}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          className="grid size-4 shrink-0 place-items-center rounded-full transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          style={markerStyle(current.behavior, current.color)}
        >
          {current.behavior === "done" && (
            <Check className="size-3 text-white" strokeWidth={3} />
          )}
          {current.behavior === "dismissed" && (
            <X className="size-3 text-white" strokeWidth={3} />
          )}
        </button>
      </PopoverAnchor>

      <PopoverContent align="start" className="w-52 p-1">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Set status
        </div>
        <ul>
          {set.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => select(s.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                  s.id === item.status_id && "bg-accent/60",
                )}
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 text-left">{s.label}</span>
                {s.id === item.status_id && (
                  <Check className="size-3.5 text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function markerStyle(behavior: string, color: string): CSSProperties {
  if (behavior === "active") {
    // Hollow ring in the status colour.
    return { border: `2px solid ${color}`, backgroundColor: "transparent" }
  }
  // done / dismissed → filled in the status colour (icon distinguishes them).
  return { border: `2px solid ${color}`, backgroundColor: color }
}
