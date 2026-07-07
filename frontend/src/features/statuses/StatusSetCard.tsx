import { useState } from "react"
import { Plus, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useCreateStatus,
  useUpdateSpace,
  useUpdateStatus,
  useUpdateStatusSet,
} from "@/lib/queries"
import { StatusRowEditor } from "./StatusRowEditor"
import type { Space, Status, StatusSet } from "@/lib/api"

interface StatusSetCardProps {
  set: StatusSet
  statuses: Status[] // already sorted by position
  spaces: Space[]
}

export function StatusSetCard({ set, statuses, spaces }: StatusSetCardProps) {
  const updateSet = useUpdateStatusSet()
  const updateStatus = useUpdateStatus()
  const createStatus = useCreateStatus()
  const updateSpace = useUpdateSpace()

  const [name, setName] = useState(set.name)
  const usedBy = spaces.filter((s) => s.status_set_id === set.id)
  const unassigned = spaces.filter((s) => s.status_set_id !== set.id)

  const commitName = () => {
    const next = name.trim()
    if (next && next !== set.name) {
      updateSet.mutate({ id: set.id, body: { name: next } })
    } else {
      setName(set.name)
    }
  }

  // Reorder by swapping the position of two neighbours.
  const move = (status: Status, dir: -1 | 1) => {
    const i = statuses.findIndex((s) => s.id === status.id)
    const neighbour = statuses[i + dir]
    if (!neighbour) return
    updateStatus.mutate({ id: status.id, body: { position: neighbour.position } })
    updateStatus.mutate({ id: neighbour.id, body: { position: status.position } })
  }

  const addState = () => {
    const maxPos = statuses.reduce((m, s) => Math.max(m, s.position), -1)
    createStatus.mutate({
      setId: set.id,
      body: {
        label: "New state",
        color: "#64748b",
        behavior: "active",
        position: maxPos + 1,
      },
    })
  }

  return (
    <section className="rounded-xl border bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
          className="h-9 max-w-xs text-base font-semibold"
        />
        {set.is_default ? (
          <Badge className="gap-1 border-transparent bg-primary/15 text-primary">
            <Star className="size-3 fill-current" />
            Default
          </Badge>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() =>
              updateSet.mutate({ id: set.id, body: { is_default: true } })
            }
          >
            <Star className="size-3.5" />
            Make default
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {statuses.map((s, i) => (
          <StatusRowEditor
            key={s.id}
            status={s}
            isFirst={i === 0}
            isLast={i === statuses.length - 1}
            canDelete={statuses.length > 1}
            onMove={move}
          />
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="mt-3 gap-1.5 border-dashed"
        onClick={addState}
      >
        <Plus className="size-4" />
        Add state
      </Button>

      {/* Assignment */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground">Used by:</span>
        {usedBy.length === 0 ? (
          <span className="text-muted-foreground/70">no spaces</span>
        ) : (
          usedBy.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
            >
              <span className="leading-none">{s.icon ?? "📁"}</span>
              {s.name}
            </span>
          ))
        )}

        {unassigned.length > 0 && (
          <Select
            value=""
            onValueChange={(v) =>
              updateSpace.mutate({
                id: Number(v),
                body: { status_set_id: set.id },
              })
            }
          >
            <SelectTrigger size="sm" className="ml-auto w-[180px]">
              <SelectValue placeholder="Assign to space…" />
            </SelectTrigger>
            <SelectContent>
              {unassigned.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {(s.icon ?? "📁") + " " + s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </section>
  )
}
