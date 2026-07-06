import { useState, type ReactNode } from "react"
import { CalendarClock, CalendarDays } from "lucide-react"
import { DeadlinesRail } from "@/features/deadlines/DeadlinesRail"
import { CalendarPanel } from "@/features/calendar/CalendarPanel"
import { cn } from "@/lib/utils"

/** Desktop right rail: toggle between the deadlines list and the month calendar. */
export function RightRail() {
  const [tab, setTab] = useState<"deadlines" | "calendar">("deadlines")
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 p-3 pb-0">
        <TabButton
          active={tab === "deadlines"}
          onClick={() => setTab("deadlines")}
          icon={<CalendarClock className="size-4" />}
        >
          Deadlines
        </TabButton>
        <TabButton
          active={tab === "calendar"}
          onClick={() => setTab("calendar")}
          icon={<CalendarDays className="size-4" />}
        >
          Calendar
        </TabButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "deadlines" ? <DeadlinesRail /> : <CalendarPanel />}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
