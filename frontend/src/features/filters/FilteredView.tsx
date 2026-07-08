import { useMemo } from "react"
import { useParams } from "react-router-dom"
import { useItems, useSpaces, useStatusIndex } from "@/lib/queries"
import { isClosed } from "@/lib/status"
import { ItemRow } from "@/features/items/ItemRow"
import type { Item } from "@/lib/api"

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function itemTags(it: Item): string[] {
  return Array.isArray(it.metadata?.tags)
    ? (it.metadata.tags as unknown[]).filter(
        (t): t is string => typeof t === "string",
      )
    : []
}

/**
 * A cross-space filtered list: tag pages (/tag/:tag) and the built-in "saved
 * filters" (/filter/overdue | week | flagged). Reuses ItemRow.
 */
export function FilteredView() {
  const { tag, kind } = useParams()
  const { data: items, isLoading } = useItems()
  const { data: spaces } = useSpaces()
  const index = useStatusIndex()

  const spaceById = useMemo(
    () => new Map((spaces ?? []).map((s) => [s.id, s])),
    [spaces],
  )

  const { title, filtered } = useMemo(() => {
    const all = items ?? []
    if (tag) {
      const tl = tag.toLowerCase()
      return {
        title: `#${tag}`,
        filtered: all.filter((it) =>
          itemTags(it).some((x) => x.toLowerCase() === tl),
        ),
      }
    }
    const today = startOfToday()
    const open = (it: Item) => !isClosed(index, it.status_id)
    if (kind === "overdue") {
      return {
        title: "Overdue",
        filtered: all.filter(
          (it) => it.due_at && new Date(it.due_at) < today && open(it),
        ),
      }
    }
    if (kind === "week") {
      const end = new Date(today)
      end.setDate(end.getDate() + 7)
      return {
        title: "Due this week",
        filtered: all.filter(
          (it) =>
            it.due_at &&
            new Date(it.due_at) >= today &&
            new Date(it.due_at) <= end &&
            open(it),
        ),
      }
    }
    if (kind === "flagged") {
      return {
        title: "Flagged",
        filtered: all.filter((it) => (it.priority ?? 0) > 0 && open(it)),
      }
    }
    return { title: "Filter", filtered: [] as Item[] }
  }, [items, tag, kind, index])

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          (b.priority ?? 0) - (a.priority ?? 0) ||
          (a.due_at ?? "~").localeCompare(b.due_at ?? "~"),
      ),
    [filtered],
  )

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "item" : "items"}
        </p>
      </header>

      {isLoading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
          ))}
        </ul>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing here right now.
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              space={spaceById.get(item.space_id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
