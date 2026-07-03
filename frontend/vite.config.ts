import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // "@/..." → "src/..." — matches the shadcn / tsconfig path alias.
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // During dev the frontend (5173) and backend (8000) are separate servers.
    // Proxy /api to the backend so the browser sees one origin — no CORS, and
    // the same relative "/api" paths work in production where the backend
    // serves the built frontend.
    // 127.0.0.1 (not "localhost") avoids the Windows IPv6 ::1 resolution quirk —
    // uvicorn binds IPv4 by default, so localhost→::1 would refuse the connection.
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
})
