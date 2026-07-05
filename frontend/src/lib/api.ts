import type { components } from "./api-types"

// Re-export the OpenAPI-generated shapes under friendly names. These are the
// single source of truth — regenerate with `npm run gen:api` when the backend
// changes, and the whole frontend type-checks against the new contract.
export type Space = components["schemas"]["SpaceRead"]
export type SpaceCreate = components["schemas"]["SpaceCreate"]
export type SpaceUpdate = components["schemas"]["SpaceUpdate"]
export type Item = components["schemas"]["ItemRead"]
export type ItemCreate = components["schemas"]["ItemCreate"]
export type ItemUpdate = components["schemas"]["ItemUpdate"]
export type StatusSet = components["schemas"]["StatusSetRead"]
export type StatusSetCreate = components["schemas"]["StatusSetCreate"]
export type StatusSetUpdate = components["schemas"]["StatusSetUpdate"]
export type Status = components["schemas"]["StatusRead"]
export type StatusCreate = components["schemas"]["StatusCreate"]
export type StatusUpdate = components["schemas"]["StatusUpdate"]
export type Attachment = components["schemas"]["AttachmentRead"]
export type AppSettings = components["schemas"]["SettingsRead"]
export type AppSettingsUpdate = components["schemas"]["SettingsUpdate"]

// Web build (served by the backend) uses relative "/api". Native builds (Tauri,
// Capacitor) load the UI locally, so they must point at the NAS — set
// VITE_API_BASE at build time, e.g. https://igorc-1.<tailnet>.ts.net
const API_ORIGIN = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "")
const BASE = `${API_ORIGIN}/api`

// ── Auth token (single shared token; see app/auth.py) ──────────────────────────
const TOKEN_KEY = "command-center.token"
let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null

export function setAuthToken(token: string | null) {
  authToken = token
  if (typeof localStorage !== "undefined") {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  }
}

export function getAuthToken(): string | null {
  return authToken
}

/** Append ?token= when a token is set — for plain <img>/<a> URLs that can't
 * send an Authorization header. */
function withToken(url: string): string {
  if (!authToken) return url
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}token=${encodeURIComponent(authToken)}`
}

export function attachmentRawUrl(id: number): string {
  return withToken(`${BASE}/attachments/${id}/raw`)
}
export function attachmentDownloadUrl(id: number): string {
  return withToken(`${BASE}/attachments/${id}/download`)
}

/** Thrown on a 401 so the UI can show the login screen. */
export class AuthError extends Error {
  constructor() {
    super("Unauthorized")
    this.name = "AuthError"
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`)
  }
  // 204 No Content (e.g. soft-delete) has no body to parse.
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface ItemFilters {
  space_id?: number
  type?: string
  behavior?: string
}

function itemQuery(filters?: ItemFilters): string {
  const q = new URLSearchParams()
  if (filters?.space_id != null) q.set("space_id", String(filters.space_id))
  if (filters?.type) q.set("type", filters.type)
  if (filters?.behavior) q.set("behavior", filters.behavior)
  const qs = q.toString()
  return qs ? `?${qs}` : ""
}

export const api = {
  // Spaces
  listSpaces: () => request<Space[]>("/spaces"),
  createSpace: (body: SpaceCreate) =>
    request<Space>("/spaces", { method: "POST", body: JSON.stringify(body) }),
  updateSpace: (id: number, body: SpaceUpdate) =>
    request<Space>(`/spaces/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSpace: (id: number) =>
    request<void>(`/spaces/${id}`, { method: "DELETE" }),
  /** Bring a trashed space (and everything trashed with it) back. */
  restoreSpace: (id: number) =>
    request<Space>(`/spaces/${id}/restore`, { method: "POST" }),
  /** Permanently delete a trashed space and its subtree. */
  purgeSpace: (id: number) =>
    request<void>(`/spaces/${id}/purge`, { method: "DELETE" }),
  archiveSpace: (id: number) =>
    request<Space>(`/spaces/${id}/archive`, { method: "POST" }),
  unarchiveSpace: (id: number) =>
    request<Space>(`/spaces/${id}/unarchive`, { method: "POST" }),
  /** Archived (put-away) spaces. */
  listArchivedSpaces: () => request<Space[]>("/spaces/archived"),
  /** Trashed spaces (the Trash view). */
  listSpaceTrash: () => request<Space[]>("/spaces/trash"),
  emptySpaceTrash: () =>
    request<{ purged: number }>("/spaces/trash/empty", { method: "POST" }),
  purgeSpaces: (ids: number[]) =>
    request<{ purged: number }>("/spaces/trash/purge", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  // Items
  listItems: (filters?: ItemFilters) =>
    request<Item[]>(`/items${itemQuery(filters)}`),
  createItem: (body: ItemCreate) =>
    request<Item>("/items", { method: "POST", body: JSON.stringify(body) }),
  updateItem: (id: number, body: ItemUpdate) =>
    request<Item>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteItem: (id: number) =>
    request<void>(`/items/${id}`, { method: "DELETE" }),
  /** Soft-deleted items (the Trash). */
  listTrash: () => request<Item[]>("/items/trash"),
  /** Bring a soft-deleted item back. */
  restoreItem: (id: number) =>
    request<Item>(`/items/${id}/restore`, { method: "POST" }),
  /** Permanently delete a trashed item. */
  purgeItem: (id: number) =>
    request<void>(`/items/${id}/purge`, { method: "DELETE" }),
  emptyTrash: () =>
    request<{ purged: number }>("/items/trash/empty", { method: "POST" }),
  purgeItems: (ids: number[]) =>
    request<{ purged: number }>("/items/trash/purge", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  /** Full JSON snapshot of everything (backup). */
  exportAll: () => request<Record<string, unknown>>("/export"),

  // Server-side settings (daily-digest schedule + count)
  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (body: AppSettingsUpdate) =>
    request<AppSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // Status sets
  listStatusSets: () => request<StatusSet[]>("/status-sets"),
  createStatusSet: (body: StatusSetCreate) =>
    request<StatusSet>("/status-sets", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateStatusSet: (id: number, body: StatusSetUpdate) =>
    request<StatusSet>(`/status-sets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // Statuses
  listStatuses: (setId: number) =>
    request<Status[]>(`/status-sets/${setId}/statuses`),
  /** Every status across all sets — the full multi-state vocabulary. */
  listAllStatuses: () => request<Status[]>("/statuses"),
  createStatus: (setId: number, body: StatusCreate) =>
    request<Status>(`/status-sets/${setId}/statuses`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateStatus: (id: number, body: StatusUpdate) =>
    request<Status>(`/statuses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteStatus: (id: number) =>
    request<void>(`/statuses/${id}`, { method: "DELETE" }),

  // Auth
  authStatus: () => request<{ auth_required: boolean }>("/auth/status"),
  authCheck: () => request<{ ok: boolean }>("/auth/check"),

  // Web push
  vapidPublicKey: () => request<{ key: string }>("/push/vapid-public-key"),
  pushSubscribe: (body: {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }) =>
    request<{ ok: boolean }>("/push/subscribe", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  pushUnsubscribe: (endpoint: string) =>
    request<{ ok: boolean }>("/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),
  pushTest: () =>
    request<{ subscriptions: number; sent: number; removed: number }>(
      "/push/test",
      { method: "POST" },
    ),

  // Attachments
  listAttachments: (params: { item_id?: number; space_id?: number }) => {
    const q = new URLSearchParams()
    if (params.item_id != null) q.set("item_id", String(params.item_id))
    if (params.space_id != null) q.set("space_id", String(params.space_id))
    return request<Attachment[]>(`/attachments?${q.toString()}`)
  },
  uploadAttachment: async (
    file: File,
    target: { item_id?: number; space_id?: number },
  ): Promise<Attachment> => {
    const fd = new FormData()
    fd.append("file", file)
    if (target.item_id != null) fd.append("item_id", String(target.item_id))
    if (target.space_id != null) fd.append("space_id", String(target.space_id))
    const headers: Record<string, string> = {}
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`
    const res = await fetch(`${BASE}/attachments`, {
      method: "POST",
      body: fd,
      headers,
    })
    if (res.status === 401) throw new AuthError()
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return (await res.json()) as Attachment
  },
  deleteAttachment: (id: number) =>
    request<void>(`/attachments/${id}`, { method: "DELETE" }),
}
