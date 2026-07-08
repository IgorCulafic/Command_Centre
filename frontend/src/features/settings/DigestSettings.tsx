import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useServerSettings, useUpdateServerSettings } from "@/lib/queries"

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * The daily-digest schedule + count — server-side settings (stored in the DB and
 * applied to the scheduler live). Distinct from the client-only Today count: this
 * controls the push notification the server sends each day.
 */
export function DigestSettings() {
  const { data } = useServerSettings()
  const update = useUpdateServerSettings()
  // Derive from server data with a local "draft" override, so there's no
  // prop→state effect; saving clears the draft to reflect the server again.
  const [draft, setDraft] = useState<{
    hour: number
    minute: number
    count: number
  } | null>(null)

  const cur = draft ?? {
    hour: data?.digest_hour ?? 8,
    minute: data?.digest_minute ?? 0,
    count: data?.digest_count ?? 3,
  }
  const patch = (p: Partial<typeof cur>) => setDraft({ ...cur, ...p })

  const save = () => {
    update.mutate(
      { digest_hour: cur.hour, digest_minute: cur.minute, digest_count: cur.count },
      {
        onSuccess: () => {
          toast.success("Daily digest updated.")
          setDraft(null)
        },
      },
    )
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Daily digest</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          A once-a-day push with your top priorities. Changes take effect
          immediately — no restart.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="digest-time">Send at</Label>
          <Input
            id="digest-time"
            type="time"
            className="w-36"
            value={`${pad(cur.hour)}:${pad(cur.minute)}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number)
              if (!Number.isNaN(h) && !Number.isNaN(m))
                patch({ hour: h, minute: m })
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="digest-count">How many items</Label>
          <Input
            id="digest-count"
            type="number"
            min={1}
            max={20}
            className="w-28"
            value={cur.count}
            onChange={(e) => patch({ count: Number(e.target.value) || 1 })}
          />
        </div>
        <Button onClick={save} disabled={!draft || update.isPending}>
          Save
        </Button>
      </div>
    </section>
  )
}
