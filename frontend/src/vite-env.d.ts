/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for native builds (Tauri/Capacitor). Unset for the web build. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
