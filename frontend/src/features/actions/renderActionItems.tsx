import { Fragment, type ComponentType, type ReactNode } from "react"
import { Check } from "lucide-react"
import type { Action, ActionGroup } from "./types"

// The kebab (DropdownMenu) and the right-click menu (ContextMenu) are structurally
// identical clones, so both can render the same ActionGroup[] through this one
// function — we just hand it the matching component set.
interface MenuItemProps {
  variant?: "default" | "destructive"
  disabled?: boolean
  onSelect?: (event: Event) => void
  children?: ReactNode
}

export interface ActionMenuComponents {
  Item: ComponentType<MenuItemProps>
  Separator: ComponentType<{ className?: string }>
  Sub: ComponentType<{ children?: ReactNode }>
  SubTrigger: ComponentType<{ children?: ReactNode }>
  SubContent: ComponentType<{ children?: ReactNode }>
}

function renderAction(action: Action, C: ActionMenuComponents): ReactNode {
  if (action.submenu && action.submenu.length > 0) {
    return (
      <C.Sub key={action.id}>
        <C.SubTrigger>
          {action.icon}
          {action.label}
        </C.SubTrigger>
        <C.SubContent>
          {action.submenu.map((sub) => renderAction(sub, C))}
        </C.SubContent>
      </C.Sub>
    )
  }
  return (
    <C.Item
      key={action.id}
      variant={action.variant}
      disabled={action.disabled}
      onSelect={() => action.run?.()}
    >
      {action.dotColor ? (
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: action.dotColor }}
        />
      ) : (
        action.icon
      )}
      {action.label}
      {action.active && <Check className="ml-auto size-3.5 text-muted-foreground" />}
    </C.Item>
  )
}

/** Render action groups into menu rows, separated by a divider between groups. */
export function renderActionItems(
  groups: ActionGroup[],
  C: ActionMenuComponents,
): ReactNode {
  return groups.map((group, i) => (
    <Fragment key={group.id}>
      {i > 0 && <C.Separator />}
      {group.actions.map((action) => renderAction(action, C))}
    </Fragment>
  ))
}
