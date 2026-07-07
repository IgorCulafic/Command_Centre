import type { ReactNode } from "react"

/**
 * One thing the user can do to an object (item or space). The same Action list is
 * surfaced three ways — a kebab menu, a right-click/long-press menu, and the
 * Ctrl/Cmd-K palette — so an action is defined once and appears everywhere.
 */
export interface Action {
  id: string
  label: string
  /** Leading icon. Ignored when `dotColor` is set (status swatches use a dot). */
  icon?: ReactNode
  /** What the action does. Omitted only when `submenu` is present. */
  run?: () => void
  variant?: "default" | "destructive"
  disabled?: boolean
  /** Nested actions, e.g. "Set status ▸" or "Move to space ▸". */
  submenu?: Action[]
  /** Colored swatch shown instead of an icon (status / space color pickers). */
  dotColor?: string
  /** Shows a check — marks the currently-selected option inside a submenu. */
  active?: boolean
  /** Optional keyword used by the command palette for matching. */
  keywords?: string
}

/** A separated cluster of actions within a menu. */
export interface ActionGroup {
  id: string
  actions: Action[]
}
