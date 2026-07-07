import type { ReactNode } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useMediaQuery } from "@/hooks/use-media-query"
import { renderActionItems, type ActionMenuComponents } from "./renderActionItems"
import type { ActionGroup } from "./types"

const COMPONENTS: ActionMenuComponents = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
}

interface ObjectContextMenuProps {
  groups: ActionGroup[]
  /** The object's row/card. Right-click (desktop) or long-press (touch) opens the menu. */
  children: ReactNode
  asChild?: boolean
}

/**
 * Wraps any object so right-click shows its app actions instead of the browser's
 * link menu (Radix ContextMenu.Trigger preventDefaults the native event). The same
 * ActionGroup[] the kebab uses.
 *
 * Desktop (fine pointer) only: on touch devices this returns the child untouched,
 * because right-click is a mouse concept and Radix's touch long-press otherwise
 * fights list scrolling and drag-to-reorder (the kebab is the touch action surface).
 */
export function ObjectContextMenu({
  groups,
  children,
  asChild = true,
}: ObjectContextMenuProps) {
  const hasMouse = useMediaQuery("(hover: hover) and (pointer: fine)")
  if (groups.length === 0 || !hasMouse) return <>{children}</>
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild={asChild}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {renderActionItems(groups, COMPONENTS)}
      </ContextMenuContent>
    </ContextMenu>
  )
}
