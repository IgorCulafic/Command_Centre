import { MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { renderActionItems, type ActionMenuComponents } from "./renderActionItems"
import type { ActionGroup } from "./types"

const COMPONENTS: ActionMenuComponents = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
}

interface ActionMenuProps {
  groups: ActionGroup[]
  /** Accessible label for the default kebab trigger. */
  label?: string
  align?: "start" | "center" | "end"
  side?: "top" | "right" | "bottom" | "left"
  /** Extra classes for the default kebab button. */
  className?: string
}

/**
 * The always-visible "⋮" kebab. Lives inside clickable rows, so its trigger stops
 * click/pointer propagation to avoid also triggering the row's own onClick.
 */
export function ActionMenu({
  groups,
  label = "Actions",
  align = "end",
  side,
  className,
}: ActionMenuProps) {
  if (groups.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
            className,
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side}>
        {renderActionItems(groups, COMPONENTS)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
