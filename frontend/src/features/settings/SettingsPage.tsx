import { useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  Bell,
  CircleDot,
  Database,
  Info,
  ListChecks,
  type LucideIcon,
  Palette,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AppearanceSettings } from "./AppearanceSettings"
import { FrontPageSettings } from "./FrontPageSettings"
import { ReminderSettings } from "./ReminderSettings"
import { DataSettings } from "./DataSettings"
import { DigestSettings } from "./DigestSettings"
import { HiddenSpacesSettings } from "./HiddenSpacesSettings"
import { StatusSetsSection } from "@/features/statuses/StatusSetsSection"

type CategoryId =
  | "appearance"
  | "today"
  | "notifications"
  | "statuses"
  | "data"
  | "about"

const CATEGORIES: { id: CategoryId; label: string; icon: LucideIcon }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "today", label: "Today & Lists", icon: ListChecks },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "statuses", label: "Status sets", icon: CircleDot },
  { id: "data", label: "Data & Privacy", icon: Database },
  { id: "about", label: "About", icon: Info },
]

/**
 * Segmented Settings — a left category nav + a content pane (a horizontal,
 * scrollable tab strip on mobile). Each category composes the existing,
 * self-contained settings sections; one organized home instead of a long scroll.
 */
export function SettingsPage() {
  const [active, setActive] = useState<CategoryId>("appearance")

  return (
    <div className="space-y-4">
      <header>
        <Link
          to="/"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <div className="flex flex-col gap-6 sm:flex-row">
        <nav className="-mx-1 flex shrink-0 gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-48 sm:flex-col sm:overflow-visible sm:px-0 sm:pb-0">
          {CATEGORIES.map((c) => {
            const Icon = c.icon
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active === c.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {c.label}
              </button>
            )
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {active === "appearance" && <AppearanceSettings />}
          {active === "today" && (
            <>
              <FrontPageSettings />
              <HiddenSpacesSettings />
            </>
          )}
          {active === "notifications" && (
            <>
              <ReminderSettings />
              <DigestSettings />
            </>
          )}
          {active === "statuses" && <StatusSetsSection />}
          {active === "data" && (
            <>
              <DataSettings />
              <section className="space-y-2">
                <h2 className="text-base font-semibold tracking-tight">Trash</h2>
                <p className="max-w-prose text-sm text-muted-foreground">
                  Deleted items and spaces can be restored — or permanently
                  removed — in one place.
                </p>
                <Link
                  to="/trash"
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <Trash2 className="size-4" />
                  Open Trash
                </Link>
              </section>
            </>
          )}
          {active === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

function AboutSection() {
  return (
    <section className="space-y-3 text-sm text-muted-foreground">
      <div>
        <p className="text-base font-semibold tracking-tight text-foreground">
          Command Center
        </p>
        <p>Version 0.1.0 · self-hosted · runs on your NAS over Tailscale.</p>
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground">For AI agents &amp; the API</p>
        <p>
          The full REST API (what Claude/Codex call to edit your lists) is
          documented at{" "}
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            /docs
          </a>
          .
        </p>
      </div>
    </section>
  )
}
