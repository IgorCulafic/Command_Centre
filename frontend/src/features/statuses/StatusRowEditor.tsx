import { useState } from "react"
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDeleteStatus, useUpdateStatus } from "@/lib/queries"
import type { Status } from "@/lib/api"

interface StatusRowEditorProps {
  status: Status
  isFirst: boolean
  isLast: boolean
  canDelete: boolean
  onMove: (status: Status, dir: -1 | 1) => void
}

const BEHAVIORS = [
  { value: "active", label: "Active" },
  { value: "done", label: "Done" },
  { value: "dismissed", label: "Dismissed" },
] as const

export function StatusRowEditor({
  status,
  isFirst,
  isLast,
  canDelete,
  onMove,
}: StatusRowEditorProps) {
  const update = useUpdateStatus()
  const remove = useDeleteStatus()

  // Local copies so typing / colour-dragging stays smooth; commit on blur.
  const [label, setLabel] = useState(status.label)
  const [color, setColor] = useState(status.color)

  const commitLabel = () => {
    const next = label.trim()
    if (next && next !== status.label) {
      update.mutate({ id: status.id, body: { label: next } })
    } else {
      setLabel(status.label)
    }
  }
  const commitColor = () => {
    if (color !== status.color) {
      update.mutate({ id: status.id, body: { color } })
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-2 py-2">
      {/* Colour swatch + hex */}
      <input
        type="color"
        aria-label="Colour"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        onBlur={commitColor}
        className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
      />

      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        className="h-8 flex-1"
        placeholder="Label"
      />

      <Select
        value={status.behavior}
        onValueChange={(v) =>
          update.mutate({ id: status.id, body: { behavior: v } })
        }
      >
        <SelectTrigger size="sm" className="w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BEHAVIORS.map((b) => (
            <SelectItem key={b.value} value={b.value}>
              {b.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center">
        <button
          type="button"
          aria-label="Move up"
          disabled={isFirst}
          onClick={() => onMove(status, -1)}
          className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={isLast}
          onClick={() => onMove(status, 1)}
          className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      <button
        type="button"
        aria-label="Delete state"
        disabled={!canDelete}
        onClick={() => remove.mutate(status.id)}
        className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}
