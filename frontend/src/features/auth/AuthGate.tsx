import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, getAuthToken, setAuthToken } from "@/lib/api"

type Phase = "checking" | "need-login" | "ok"

/**
 * Gates the app behind the shared token *only when the backend requires one*.
 * In dev (no AUTH_TOKEN configured) `auth_required` is false and this is a
 * transparent pass-through — no login friction.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data: status, isLoading } = useQuery({
    queryKey: ["auth-status"],
    queryFn: api.authStatus,
    retry: false,
  })

  const [phase, setPhase] = useState<Phase>("checking")
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!status) return
    if (!status.auth_required) {
      setPhase("ok")
      return
    }
    let cancelled = false
    void (async () => {
      if (!getAuthToken()) {
        if (!cancelled) setPhase("need-login")
        return
      }
      try {
        await api.authCheck()
        if (!cancelled) setPhase("ok")
      } catch {
        setAuthToken(null)
        if (!cancelled) setPhase("need-login")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status])

  if (isLoading || phase === "checking") {
    return (
      <Centered>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </Centered>
    )
  }

  if (phase === "ok") return <>{children}</>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setAuthToken(token.trim())
    try {
      await api.authCheck()
      await qc.invalidateQueries()
      setPhase("ok")
    } catch {
      setAuthToken(null)
      setError("That token didn't work.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Centered>
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-lg"
      >
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            C
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Command Center</h1>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token">Access token</Label>
          <Input
            id="token"
            type="password"
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your token"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={!token.trim() || submitting}
        >
          Unlock
        </Button>
      </form>
    </Centered>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      {children}
    </div>
  )
}
