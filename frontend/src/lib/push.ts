import { api } from "./api"

export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  )
}

/** VAPID public key (base64url) → Uint8Array for applicationServerKey. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export interface PushResult {
  ok: boolean
  reason?: string
}

/** Register the SW, request permission, subscribe, and store the subscription. */
export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) {
    return { ok: false, reason: "This browser doesn't support web push." }
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason:
        "Web push needs HTTPS (or localhost). Over Tailscale, enable HTTPS with `tailscale serve` — see the README.",
    }
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission was not granted." }
  }

  const registration = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready

  const { key } = await api.vapidPublicKey()
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  })

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "Subscription was incomplete." }
  }
  await api.pushSubscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })
  return { ok: true }
}

export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await api.pushUnsubscribe(subscription.endpoint).catch(() => undefined)
    await subscription.unsubscribe()
  }
}

/** Is there already an active push subscription in this browser? */
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return Boolean(subscription)
}
