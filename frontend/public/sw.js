/* Command Center service worker — web push only (no offline caching, so it never
   interferes with the dev server / HMR). */

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
)

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "Command Center", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "Command Center"
  const options = {
    body: data.body || "",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: data.url || "/" },
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options)
      // Tell any open tab so it can play the in-app reminder chime.
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      for (const client of clients) {
        client.postMessage({ type: "cc-push", title, body: options.body })
      }
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
