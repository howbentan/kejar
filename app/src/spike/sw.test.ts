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
