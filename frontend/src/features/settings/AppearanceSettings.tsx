import { useSettings, type Theme } from "@/lib/settings"
import { cn } from "@/lib/utils"

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

/** Theme picker (light / dark / system). */
export function AppearanceSettings() {
  const { theme, setTheme } = useSettings()
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your colour theme. “System” follows your device.
        </p>
      </div>
      <div className="inline-flex rounded-lg border p-1">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTheme(t.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              theme === t.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </section>
  )
}
