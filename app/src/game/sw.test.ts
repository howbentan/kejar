// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import SOURCE from '../../public/sw.js?raw'

type Listener = (event: unknown) => void

function loadWorker(windows: unknown[]) {
  const listeners: Record<string, Listener> = {}
  const self = {
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn
    },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => {}) },
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
  }
  new Function('self', 'fetch', SOURCE)(self, vi.fn(async () => ({})))
  return { self, listeners }
}

async function click(listeners: Record<string, Listener>, url: string) {
  const pending: Promise<unknown>[] = []
  listeners.notificationclick({
    notification: { close: vi.fn(), data: { url } },
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  })
  await Promise.all(pending)
}

describe('service worker notification tap', () => {
  it('focuses the open tab before navigating it to the check-in', async () => {
    const order: string[] = []
    const tab = {
      focus: vi.fn(async () => {
        order.push('focus')
        return tab
      }),
      navigate: vi.fn(async () => {
        order.push('navigate')
        return tab
      }),
    }
    const { self, listeners } = loadWorker([tab])
    await click(listeners, '/g/ABC234?checkin=1')
    expect(order).toEqual(['focus', 'navigate'])
    expect(tab.navigate).toHaveBeenCalledWith('/g/ABC234?checkin=1')
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('opens a new window when the open tab cannot be navigated', async () => {
    const tab = {
      focus: vi.fn(async () => tab),
      navigate: vi.fn(async () => {
        throw new TypeError('This service worker is not the client’s active service worker.')
      }),
    }
    const { self, listeners } = loadWorker([tab])
    await click(listeners, '/g/ABC234?checkin=1')
    expect(self.clients.openWindow).toHaveBeenCalledWith('/g/ABC234?checkin=1')
  })

  it('opens a new window when no tab is open', async () => {
    const { self, listeners } = loadWorker([])
    await click(listeners, '/g/ABC234?checkin=1')
    expect(self.clients.openWindow).toHaveBeenCalledWith('/g/ABC234?checkin=1')
  })
})

describe('service worker game check-in alerts', () => {
  async function push(listeners: Record<string, Listener>, data: unknown) {
    const pending: Promise<unknown>[] = []
    listeners.push({ data: { json: () => data }, waitUntil: (p: Promise<unknown>) => pending.push(p) })
    await Promise.all(pending)
  }

  it('shows the check-in alert for a game ping, with when Kejar see you, opening the check-in', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 14, 4, 15) })
    const { self, listeners } = loadWorker([])
    await push(listeners, { type: 'checkin', code: 'ABC234', seq: 2, revealAt: new Date(2026, 10, 1, 14, 5).getTime() })
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      'Ping in 45s — check in!',
      expect.objectContaining({ body: 'Tap to check in. Kejar see you at 2:05.', tag: 'kejar-ping', data: { url: '/g/ABC234?checkin=1' } }),
    )
    vi.useRealTimers()
  })

  it('a late push says the time actually left', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 14, 4, 40) })
    const { self, listeners } = loadWorker([])
    await push(listeners, { type: 'checkin', code: 'ABC234', seq: 2, revealAt: new Date(2026, 10, 1, 14, 5).getTime() })
    expect(self.registration.showNotification).toHaveBeenCalledWith('Ping in 20s — check in!', expect.anything())
    vi.useRealTimers()
  })

  it('a Mat Rempit bonus ping says 30 s and just opens the game', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 1, 9, 39, 30) })
    const { self, listeners } = loadWorker([])
    await push(listeners, { type: 'checkin', code: 'ABC234', seq: 1000, revealAt: new Date(2026, 10, 1, 9, 40).getTime() })
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      'Ping in 30s — check in!',
      expect.objectContaining({ body: 'Tap to check in. Kejar see you at 9:40.', data: { url: '/g/ABC234' } }),
    )
    vi.useRealTimers()
  })

  it('opens the game when a check-in alert is tapped', async () => {
    const { self, listeners } = loadWorker([])
    const pending: Promise<unknown>[] = []
    listeners.notificationclick({
      notification: { close: vi.fn(), data: { url: '/g/ABC234' } },
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    })
    await Promise.all(pending)
    expect(self.clients.openWindow).toHaveBeenCalledWith('/g/ABC234')
  })
})

describe('service worker notices', () => {
  it('shows a notice with its title and body, and tapping it opens the game', async () => {
    const { self, listeners } = loadWorker([])
    const pending: Promise<unknown>[] = []
    listeners.push({
      data: { json: () => ({ type: 'notice', code: 'ABC234', title: 'T', body: 'B' }) },
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    })
    await Promise.all(pending)
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      'T',
      expect.objectContaining({ body: 'B', tag: 'kejar-notice', requireInteraction: true, data: { url: '/g/ABC234' } }),
    )
    await click(listeners, '/g/ABC234')
    expect(self.clients.openWindow).toHaveBeenCalledWith('/g/ABC234')
  })
})
