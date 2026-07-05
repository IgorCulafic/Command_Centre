import type { Item, Status } from "./api"

/** Status behaviors the app understands (CLAUDE.md §7). */
export type Behavior = "active" | "done" | "dismissed"

/** Fast lookups over the full status vocabulary. */
export interface StatusIndex {
  /** status id → Status */
  byId: Map<number, Status>
  /** status set id → that set's statuses, ordered by position (the cycle). */
  bySet: Map<number, Status[]>
}

export function buildStatusIndex(statuses: Status[]): StatusIndex {
  const byId = new Map<number, Status>()
  const bySet = new Map<number, Status[]>()
  for (const s of statuses) {
    byId.set(s.id, s)
    const arr = bySet.get(s.status_set_id)
    if (arr) arr.push(s)
    else bySet.set(s.status_set_id, [s])
  }
  for (const arr of bySet.values()) arr.sort((a, b) => a.position - b.position)
  return { byId, bySet }
}

/** The statuses available to an item, given its current status. */
export function statusesFor(
  index: StatusIndex,
  statusId: number | null | undefined,
): Status[] {
  if (statusId == null) return []
  const current = index.byId.get(statusId)
  if (!current) return []
  return index.bySet.get(current.status_set_id) ?? []
}

/** The next status in the cycle (wraps around). Used by tap-to-advance. */
export function nextStatus(
  index: StatusIndex,
  statusId: number,
): Status | undefined {
  const set = statusesFor(index, statusId)
  if (set.length === 0) return undefined
  const i = set.findIndex((s) => s.id === statusId)
  return set[(i + 1) % set.length]
}

export function behaviorOf(
  index: StatusIndex,
  statusId: number | null | undefined,
): Behavior | null {
  if (statusId == null) return null
  return (index.byId.get(statusId)?.behavior as Behavior) ?? null
}

/** Closed = folds into Completed (done OR dismissed). */
export function isClosed(
  index: StatusIndex,
  statusId: number | null | undefined,
): boolean {
  const b = behaviorOf(index, statusId)
  return b === "done" || b === "dismissed"
}

const BEHAVIOR_RANK: Record<Behavior, number> = {
  active: 0,
  done: 1,
  dismissed: 2,
}

/** One status's items — the unit the space view renders as a section. */
export interface StatusGroup {
  status: Status
  items: Item[]
}

/**
 * Group items by their status. Groups are ordered the way the user would read a
 * pipeline: active stages first (in set order), then done, then dismissed.
 * Items within a group sort by priority then position. Items with no (known)
 * status come back separately as `noStatus`.
 */
export function groupByStatus(
  index: StatusIndex,
  items: Item[],
): { groups: StatusGroup[]; noStatus: Item[] } {
  const byStatus = new Map<number, Item[]>()
  const noStatus: Item[] = []

  for (const it of items) {
    if (it.status_id == null || !index.byId.has(it.status_id)) {
      noStatus.push(it)
      continue
    }
    const arr = byStatus.get(it.status_id)
    if (arr) arr.push(it)
    else byStatus.set(it.status_id, [it])
  }

  const groups: StatusGroup[] = [...byStatus.entries()].map(([id, groupItems]) => {
    groupItems.sort((a, b) => b.priority - a.priority || a.position - b.position)
    return { status: index.byId.get(id) as Status, items: groupItems }
  })

  groups.sort((a, b) => {
    const ra = BEHAVIOR_RANK[a.status.behavior as Behavior] ?? 0
    const rb = BEHAVIOR_RANK[b.status.behavior as Behavior] ?? 0
    return ra - rb || a.status.position - b.status.position
  })

  noStatus.sort((a, b) => b.priority - a.priority || a.position - b.position)
  return { groups, noStatus }
}
