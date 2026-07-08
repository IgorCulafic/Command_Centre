import { useMemo, useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import { useItems } from "@/lib/queries"
import { useDialogs } from "@/features/items/dialogs"
import type { Item } from "@/lib/api"

/** ISO date (naive) → a local Date at midnight, for calendar comparisons. */
function dueDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function CalendarPanel() {
  const { data: items } = useItems()
  const { openDetail } = useDialogs()
  const [selected, setSelected] = useState<Date | undefined>(undefined)

  const dued = useMemo(
    () => (items ?? []).filter((i): i is Item & { due_at: string } => !!i.due_at),
    [items],
  )
  const dueDays = useMemo(() => dued.map((i) => dueDate(i.due_at)), [dued])

  const dayItems = selected
    ? dued.filter((i) => sameDay(dueDate(i.due_at), selected))
    : []

  return (
    <div className="p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">Calendar</h2>
      <Calendar
        mode="single"
        selected={selected}
        onSelect={setSelected}
        modifiers={{ due: dueDays }}
        modifiersClassNames={{
          due: "font-semibold text-primary aria-selected:text-primary-foreground",
        }}
        className="rounded-lg border bg-card/40"
      />
      {selected && (
        <div className="mt-3 space-y-1.5">
          <div className="px-1 text-xs font-medium text-muted-foreground">
            {selected.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>
          {dayItems.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">Nothing due.</p>
          ) : (
            <ul className="space-y-1.5">
              {dayItems.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(i)}
                    className="block w-full truncate rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-accent/40"
                  >
                    {i.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
