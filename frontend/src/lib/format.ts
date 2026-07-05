/** "Monday, June 1" — the date shown in the Today header. */
export function formatTodayLong(d: Date = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

/**
 * Short countdown badge for a due date: "today", "3d", "2w", "1mo", or
 * "overdue". Input is an ISO datetime string (UTC, naive) from the API.
 */
export function countdownLabel(dueIso: string): string {
  const due = new Date(dueIso + (dueIso.endsWith("Z") ? "" : "Z"))
  const now = new Date()
  const ms = due.getTime() - now.getTime()
  const days = Math.round(ms / 86_400_000)
  if (days < 0) return "overdue"
  if (days === 0) return "today"
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.round(days / 7)}w`
  return `${Math.round(days / 30)}mo`
}
