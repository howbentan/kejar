// Kejar service worker: receives check-in alerts during the ping spike.
// Push payload: { "pingId": string, "deviceId": string }

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const { pingId, deviceId } = data
  const ack = pingId && deviceId
    ? fetch('/api/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pingId, deviceId }),
      }).catch(() => undefined)
    : Promise.resolve()
  const show = self.registration.showNotification('kejar.', {
    body: 'Ping in 30s — check in!',
    tag: 'kejar-ping',
    renotify: true,
    requireInteraction: true,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { pingId },
  })
  event.waitUntil(Promise.all([ack, show]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const pingId = event.notification.data && event.notification.data.pingId
  const url = pingId ? `/spike?ping=${encodeURIComponent(pingId)}` : '/spike'
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(url)
        return client.focus()
      }
    }
    return self.clients.openWindow(url)
  })())
})
