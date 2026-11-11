import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

const flush = () => new Promise((r) => setTimeout(r, 0))

function mockWakeLock(request?: () => Promise<unknown>) {
  const release = vi.fn(() => Promise.resolve())
  const req = vi.fn(request ?? (() => Promise.resolve({ release, addEventListener: vi.fn() })))
  Object.defineProperty(navigator, 'wakeLock', { value: { request: req }, configurable: true })
  return { req, release }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => setVisibility('visible'))
afterEach(() => {
  cleanup()
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock
})

describe('useWakeLock', () => {
  it('requests a screen lock once while active', async () => {
    const { req } = mockWakeLock()
    renderHook(() => useWakeLock(true))
    await flush()
    expect(req).toHaveBeenCalledTimes(1)
    expect(req).toHaveBeenCalledWith('screen')
  })

  it('does not request while inactive', async () => {
    const { req } = mockWakeLock()
    renderHook(() => useWakeLock(false))
    await flush()
    expect(req).not.toHaveBeenCalled()
  })

  it('releases when active turns false, and on unmount', async () => {
    const { release } = mockWakeLock()
    const { rerender, unmount } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } })
    await flush()
    rerender({ on: false })
    await flush()
    expect(release).toHaveBeenCalledTimes(1)
    rerender({ on: true })
    await flush()
    unmount()
    await flush()
    expect(release).toHaveBeenCalledTimes(2)
  })

  it('re-requests when the page becomes visible again', async () => {
    const { req } = mockWakeLock()
    renderHook(() => useWakeLock(true))
    await flush()
    setVisibility('hidden')
    await flush()
    expect(req).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await flush()
    expect(req).toHaveBeenCalledTimes(2)
  })

  it('does nothing and does not throw where wakeLock is missing', () => {
    expect(() => renderHook(() => useWakeLock(true)).unmount()).not.toThrow()
  })

  it('swallows a rejected request', async () => {
    const { req } = mockWakeLock(() => Promise.reject(new Error('denied')))
    const { unmount } = renderHook(() => useWakeLock(true))
    await flush()
    expect(req).toHaveBeenCalledTimes(1)
    expect(() => unmount()).not.toThrow()
  })
})
