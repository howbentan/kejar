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

async function click(listeners: Record<string, Listener>, pingId: string) {
  const pending: Promise<unknown>[] = []
  listeners.notificationclick({
    notification: { close: vi.fn(), data: { pingId } },
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
    await click(listeners, 'p1')
    expect(order).toEqual(['focus', 'navigate'])
    expect(tab.navigate).toHaveBeenCalledWith('/spike?ping=p1')
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
    await click(listeners, 'p1')
    expect(self.clients.openWindow).toHaveBeenCalledWith('/spike?ping=p1')
  })

  it('opens a new window when no tab is open', async () => {
    const { self, listeners } = loadWorker([])
    await click(listeners, 'p1')
    expect(self.clients.openWindow).toHaveBeenCalledWith('/spike?ping=p1')
  })
})

describe('service worker game check-in alerts', () => {
  async function push(listeners: Record<string, Listener>, data: unknown) {
    const pending: Promise<unknown>[] = []
    listeners.push({ data: { json: () => data }, waitUntil: (p: Promise<unknown>) => pending.push(p) })
    await Promise.all(pending)
  }

  it('shows the check-in alert for a game ping', async () => {
    const { self, listeners } = loadWorker([])
    await push(listeners, { type: 'checkin', code: 'ABC234', seq: 2 })
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      'kejar.',
      expect.objectContaining({ body: 'Ping in 30s — check in!', tag: 'kejar-ping', data: { url: '/g/ABC234' } }),
    )
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
