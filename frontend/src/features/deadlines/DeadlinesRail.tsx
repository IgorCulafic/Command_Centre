import { useNavigate } from "react-router-dom"
import { CalendarClock, MoreHorizontal, Pencil, Target } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useItems, useUpdateItem } from "@/lib/queries"
import { useSettings } from "@/lib/settings"
import { useDialogs } from "@/features/items/dialogs"
import { countdownLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/api"

/** A naive-UTC-ish ISO string for `today + days` at midnight (matches the API). */
function isoDatePlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}T00:00:00`
}

/** Sorted list of items that have a due date, soonest first. */
function useUpcoming(): Item[] {
  const { data: items } = useItems()
  const { upcomingCount, isHiddenFromToday } = useSettings()
  return (items ?? [])
    .filter((i) => i.due_at && !isHiddenFromToday(i.space_id))
    .sort((a, b) => ((a.due_at as string) < (b.due_at as string) ? -1 : 1))
    .slice(0, upcomingCount)
}

export function DeadlinesRail() {
  const upcoming = useUpcoming()

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
        <CalendarClock className="size-4 text-muted-foreground" />
        Upcoming deadlines
      </h2>
      {upcoming.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing due yet. Deadlines you add will show up here with a countdown.
        </div>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((item) => (
            <DeadlineRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}

function DeadlineRow({ item }: { item: Item }) {
  const navigate = useNavigate()
  const { openDetail } = useDialogs()
  const update = useUpdateItem()

  const label = countdownLabel(item.due_at as string)
  const urgent = label === "overdue" || label === "today"

  const focus = () => navigate(`/space/${item.space_id}`)
  const snooze = (days: number) =>
    update.mutate({ id: item.id, body: { due_at: isoDatePlusDays(days) } })

  return (
    <li className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <button
        type="button"
        onClick={focus}
        className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary"
        title="Focus space"
      >
        {item.title}
      </button>

      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
          urgent
            ? "bg-destructive/15 text-destructive"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        {label}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Deadline actions"
            className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={focus}>
            <Target className="size-4" />
            Focus space
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDetail(item)}>
            <Pencil className="size-4" />
            Open item
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => snooze(1)}>Tomorrow</DropdownMenuItem>
          <DropdownMenuItem onClick={() => snooze(3)}>In 3 days</DropdownMenuItem>
          <DropdownMenuItem onClick={() => snooze(7)}>Next week</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
