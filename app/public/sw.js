// Kejar service worker: check-in alerts for runners, safety alerts for marshals (and the old ping spike).
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
  if (data.type === 'checkin' && data.code) {
    event.waitUntil(
      self.registration.showNotification('kejar.', {
        body: 'Ping in 30s — check in!',
        tag: 'kejar-ping',
        renotify: true,
        requireInteraction: true,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: `/g/${data.code}` },
      }),
    )
    return
  }
  if (data.type === 'alert' && data.code) {
    // Marshal alerts: SOS and reports.
    event.waitUntil(
      self.registration.showNotification('kejar. marshal', {
        body: String(data.text || 'New safety alert'),
        tag: 'kejar-alert',
        renotify: true,
        requireInteraction: true,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: `/g/${data.code}` },
      }),
    )
    return
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
  const data = event.notification.data || {}
  const url = data.url || (data.pingId ? `/spike?ping=${encodeURIComponent(data.pingId)}` : '/spike')
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find((c) => 'focus' in c)
    if (client) {
      try {
        // Focus first: browsers only allow focus/openWindow shortly after the tap.
        await client.focus()
        await client.navigate(url)
        return
      } catch {
        // navigate() rejects for tabs this worker doesn't control; open a fresh one.
      }
    }
    await self.clients.openWindow(url)
  })())
})
