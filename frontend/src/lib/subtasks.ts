import type { Item } from "./api"

/** A single checklist item stored in an Item's metadata.subtasks. */
export interface Subtask {
  text: string
  done: boolean
}

/** Read + normalize an item's subtasks (tolerant of malformed metadata). */
export function getSubtasks(item: Item): Subtask[] {
  const raw = (item.metadata as Record<string, unknown> | null)?.subtasks
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (s): s is Record<string, unknown> => typeof s === "object" && s !== null,
    )
    .map((s) => ({ text: typeof s.text === "string" ? s.text : "", done: !!s.done }))
    .filter((s) => s.text.length > 0)
}

/** Merge subtasks back into an item's metadata (dropping the key when empty). */
export function withSubtasks(
  item: Item,
  subtasks: Subtask[],
): Record<string, unknown> {
  const meta = { ...((item.metadata as Record<string, unknown> | null) ?? {}) }
  if (subtasks.length) meta.subtasks = subtasks
  else delete meta.subtasks
  return meta
}
