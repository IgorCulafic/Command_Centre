import { Eye, EyeOff } from "lucide-react"
import { useSpaces } from "@/lib/queries"
import { useSettings } from "@/lib/settings"
import { cn } from "@/lib/utils"

/**
 * Manage which spaces are excluded from the Today feed + deadline rail — a list
 * view of a preference that was previously only reachable per-space (sidebar
 * menu → Hide from Today).
 */
export function HiddenSpacesSettings() {
  const { data: spaces } = useSpaces()
  const { isHiddenFromToday, toggleHiddenFromToday } = useSettings()
  const list = spaces ?? []

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Hidden from Today</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Hidden spaces stay fully usable, but their items don't clutter the Today
          feed or the upcoming-deadlines list.
        </p>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No spaces yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {list.map((s) => {
            const hidden = isHiddenFromToday(s.id)
            return (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-base leading-none">{s.icon ?? "📁"}</span>
                <span className="flex-1 truncate text-sm">{s.name}</span>
                <button
                  type="button"
                  onClick={() => toggleHiddenFromToday(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                    hidden
                      ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                      : "border-transparent bg-accent/60 text-foreground hover:bg-accent",
                  )}
                >
                  {hidden ? (
                    <>
                      <EyeOff className="size-3.5" />
                      Hidden
                    </>
                  ) : (
                    <>
                      <Eye className="size-3.5" />
                      Shown
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
