import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { playReminderChime } from "./sound"

/**
 * Lightweight client-side preferences (single user — no backend needed).
 * Persisted to localStorage. Controls what reaches the Today front page.
 */
export type Theme = "light" | "dark" | "system"

interface Settings {
  /** Colour theme; "system" follows the OS preference. */
  theme: Theme
  /** How many priority cards show on Today. */
  todayTopCount: number
  /** How many upcoming deadlines the rail shows. */
  upcomingCount: number
  /** Space ids excluded from the Today feed + deadline rail. */
  hiddenFromToday: number[]
  /** Play in-app sounds (reminder chime + complete-task ding). */
  soundEnabled: boolean
}

const DEFAULTS: Settings = {
  theme: "dark",
  todayTopCount: 3,
  upcomingCount: 12,
  hiddenFromToday: [],
  soundEnabled: true,
}

/** Apply a theme to <html> (toggles the `dark` class Tailwind keys off). */
function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
}

const STORAGE_KEY = "command-center.settings.v1"

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    /* ignore malformed storage */
  }
  return DEFAULTS
}

interface SettingsContextValue extends Settings {
  setTheme: (theme: Theme) => void
  setTodayTopCount: (n: number) => void
  setUpcomingCount: (n: number) => void
  toggleHiddenFromToday: (spaceId: number) => void
  isHiddenFromToday: (spaceId: number) => boolean
  setSoundEnabled: (on: boolean) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within <SettingsProvider>")
  return ctx
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  // Apply the theme, and follow the OS while on "system".
  useEffect(() => {
    applyTheme(settings.theme)
    if (settings.theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [settings.theme])

  // Chime when a push reminder arrives while the app is open (the service worker
  // posts a "cc-push" message on every push).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "cc-push" && settings.soundEnabled) playReminderChime()
    }
    navigator.serviceWorker.addEventListener("message", onMsg)
    return () => navigator.serviceWorker.removeEventListener("message", onMsg)
  }, [settings.soundEnabled])

  const value: SettingsContextValue = {
    ...settings,
    setTheme: (theme) => setSettings((s) => ({ ...s, theme })),
    setTodayTopCount: (n) =>
      setSettings((s) => ({ ...s, todayTopCount: clamp(n, 1, 12) })),
    setUpcomingCount: (n) =>
      setSettings((s) => ({ ...s, upcomingCount: clamp(n, 1, 50) })),
    toggleHiddenFromToday: (spaceId) =>
      setSettings((s) => ({
        ...s,
        hiddenFromToday: s.hiddenFromToday.includes(spaceId)
          ? s.hiddenFromToday.filter((x) => x !== spaceId)
          : [...s.hiddenFromToday, spaceId],
      })),
    isHiddenFromToday: (spaceId) => settings.hiddenFromToday.includes(spaceId),
    setSoundEnabled: (on) => setSettings((s) => ({ ...s, soundEnabled: on })),
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}
