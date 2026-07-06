import { Outlet } from "react-router-dom"
import { SidebarContent } from "@/features/spaces/SidebarContent"
import { RightRail } from "@/layouts/RightRail"

/** Three-pane desktop layout: sidebar · context center · deadlines rail. */
export function DesktopLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="w-72 shrink-0 border-r bg-sidebar">
        <SidebarContent />
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 py-8">
          <Outlet />
        </div>
      </main>

      {/* Deadlines rail appears once there's room (xl). */}
      <aside className="hidden w-80 shrink-0 border-l bg-card/30 xl:block">
        <RightRail />
      </aside>
    </div>
  )
}
