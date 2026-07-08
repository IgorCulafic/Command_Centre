import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSettings } from "@/lib/settings"

/** Controls how much reaches the Today front page. */
export function FrontPageSettings() {
  const { todayTopCount, upcomingCount, setTodayTopCount, setUpcomingCount } =
    useSettings()

  return (
    <section className="rounded-xl border bg-card/40 p-4">
      <h2 className="text-base font-semibold tracking-tight">Front page</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        How much surfaces on Today. To stop a space feeding the front page, use
        its <span className="text-foreground">“…”</span> menu in the sidebar →{" "}
        <span className="text-foreground">Hide from Today</span>.
      </p>

      <div className="mt-4 grid max-w-sm grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="set-top">Priority cards</Label>
          <Input
            id="set-top"
            type="number"
            min={1}
            max={12}
            value={todayTopCount}
            onChange={(e) => setTodayTopCount(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-upcoming">Upcoming deadlines</Label>
          <Input
            id="set-upcoming"
            type="number"
            min={1}
            max={50}
            value={upcomingCount}
            onChange={(e) => setUpcomingCount(Number(e.target.value))}
          />
        </div>
      </div>
    </section>
  )
}
