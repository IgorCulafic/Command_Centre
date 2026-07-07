import { useMemo, type ReactNode } from "react"
import { Flame } from "lucide-react"
import { useItems, useSpaces, useStatusIndex } from "@/lib/queries"
import { useSettings } from "@/lib/settings"
import { formatTodayLong } from "@/lib/format"
import { DeadlinesRail } from "@/features/deadlines/DeadlinesRail"
import { ItemRow, SpaceChip } from "@/features/items/ItemRow"
import { StatusMarker } from "@/features/items/StatusMarker"
import { useDialogs } from "@/features/items/dialogs"
import type { StatusIndex } from "@/lib/status"
import type { Item, Space } from "@/lib/api"

/** The default landing screen — top priorities + today's tasks (CLAUDE.md §2). */
export function TodayView() {
  const { data: active, isLoading } = useItems({ behavior: "active" })
  const { data: spaces } = useSpaces()
  const index = useStatusIndex()
  const { todayTopCount, isHiddenFromToday } = useSettings()

  const spaceById = useMemo(() => {
    const m = new Map<number, Space>()
    for (const s of spaces ?? []) m.set(s.id, s)
    return m
  }, [spaces])

  // The API already returns active items ordered by priority desc. Drop items
  // from spaces the owner has hidden from Today, then split into the configurable
  // number of priority cards + the remaining task list.
  const items = (active ?? []).filter((i) => !isHiddenFromToday(i.space_id))
  const top = items.slice(0, todayTopCount)
  const rest = items.slice(todayTopCount)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">{formatTodayLong()}</p>
      </header>

      <section>
        <SectionHeading>Top priorities</SectionHeading>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl border bg-card"
              />
            ))}
          </div>
        ) : top.length === 0 ? (
          <EmptyHint>
            Nothing active right now. Add a task or capture something to get
            started.
          </EmptyHint>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {top.map((item) => (
              <PriorityCard
                key={item.id}
                item={item}
                index={index}
                space={spaceById.get(item.space_id)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading>Today&apos;s tasks</SectionHeading>
        {rest.length === 0 ? (
          <EmptyHint>You&apos;re all caught up. ✨</EmptyHint>
        ) : (
          <ul className="space-y-2">
            {rest.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                index={index}
                space={spaceById.get(item.space_id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* The deadlines rail is a separate pane on wide desktop; inline it here
          when that pane is hidden (mobile + narrow desktop). */}
      <section className="-mx-2 xl:hidden">
        <DeadlinesRail />
      </section>
    </div>
  )
}

function PriorityCard({
  item,
  index,
  space,
}: {
  item: Item
  index: StatusIndex
  space?: Space
}) {
  const { openDetail } = useDialogs()
  return (
    <div
      onClick={() => openDetail(item)}
      className="flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-2">
        <StatusMarker item={item} index={index} />
        {space && <SpaceChip space={space} />}
        {item.priority > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Flame className="size-3.5 text-primary" />
            {item.priority}
          </span>
        )}
      </div>
      <div className="line-clamp-3 text-sm font-medium">{item.title}</div>
    </div>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  )
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
