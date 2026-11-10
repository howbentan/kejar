// Kejar service worker: check-in alerts for runners, safety alerts for marshals.
// Push payload: { "type": "checkin" | "alert", "code": string, ... }

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// A notice's own deep link, only if it resolves to this site; otherwise null.
function sameSiteUrl(u) {
  if (typeof u !== 'string') return null
  try {
    const url = new URL(u, self.location.origin)
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : null
  } catch {
    return null
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  if (data.type === 'checkin' && data.code) {
    // Scheduled pings alert 45 s ahead; Mat Rempit bonus pings (seq 1000 and up) alert 30 s ahead (motion §7a).
    // A push can go out late (the server works on the next poll), so say the time actually left when we know it.
    const bonus = Number(data.seq) >= 1000
    const at = typeof data.revealAt === 'number' ? new Date(data.revealAt) : null
    const fixed = bonus ? 30 : 45
    const lead = at ? Math.min(fixed, Math.max(5, Math.round((at.getTime() - Date.now()) / 5000) * 5)) : fixed
    const when = at ? ` Kejar see you at ${at.getHours() % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')}.` : ''
    event.waitUntil(
      self.registration.showNotification(`Ping in ${lead}s — check in!`, {
        body: `Tap to check in.${when}`,
        tag: 'kejar-ping',
        renotify: true,
        requireInteraction: true,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // The banner explains scheduled pings; a bonus push just opens the game, where the banner shows `open`.
        data: { url: bonus ? `/g/${data.code}` : `/g/${data.code}?checkin=1` },
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
  if (data.type === 'notice' && data.code) {
    // Luar Garisan: a warning or disqualification for the player who left the play area.
    event.waitUntil(
      self.registration.showNotification(String(data.title || 'kejar.'), {
        body: String(data.body || ''),
        tag: 'kejar-notice',
        renotify: true,
        requireInteraction: true,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // A notice may carry its own deep link (a caught runner's dispute link); only a path on this site is trusted.
        data: { url: sameSiteUrl(data.url) || '/g/' + data.code },
      }),
    )
    return
  }
  // Anything else isn't a Kejar push; show nothing.
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const url = data.url || '/'
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
