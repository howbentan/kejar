import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ call, ApiError: class extends Error {} }))

import { useGameState } from './useGameState'

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  vi.useFakeTimers()
  call.mockReset()
  call.mockResolvedValue({ phase: 'lobby' })
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

const stateCalls = () => call.mock.calls.filter(([action]) => action === 'state')

describe('useGameState', () => {
  it('polls the game state every 3 s with the stored token', async () => {
    renderHook(() => useGameState('ABC234', { sendLocation: 'never' }))
    await act(async () => {})
    expect(stateCalls()).toHaveLength(1)
    expect(stateCalls()[0][1]).toEqual({ code: 'ABC234', token: 't1' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000)
    })
    expect(stateCalls()).toHaveLength(3)
  })

  it('stops polling while the page is hidden', async () => {
    renderHook(() => useGameState('ABC234', { sendLocation: 'never' }))
    await act(async () => {})
    visibility = 'hidden'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    expect(stateCalls()).toHaveLength(1)
  })

  it('sends a location once when a check-in window opens, even if the phone gave no new fix', async () => {
    let onFix: (p: unknown) => void = () => {}
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition: (ok: (p: unknown) => void) => ((onFix = ok), 1), clearWatch: () => {} },
    })
    const alertAt = Date.now() + 30_000
    call.mockImplementation(async (action: string) => (action === 'state' ? { phase: 'chasing', now: Date.now(), nextAlertAt: alertAt } : { ok: true }))
    renderHook(() => useGameState('ABC234', { sendLocation: 'when-open' }))
    await act(async () => {})
    act(() => onFix({ coords: { latitude: 3, longitude: 101, accuracy: 8 } }))
    const locationCalls = () => call.mock.calls.filter(([a]) => a === 'location').length
    expect(locationCalls()).toBe(1)
    // The runner stays still: no more fixes. The window opens at +30 s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(33_000)
    })
    expect(locationCalls()).toBe(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    expect(locationCalls()).toBe(2) // once per window
  })

  it('reports location off when the phone refuses or fails to give a position, and clears it on a fix', async () => {
    let onFix: (p: unknown) => void = () => {}
    let onError: (e: unknown) => void = () => {}
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (ok: (p: unknown) => void, bad: (e: unknown) => void) => {
          onFix = ok
          onError = bad
          return 1
        },
        clearWatch: () => {},
      },
    })
    const { result } = renderHook(() => useGameState('ABC234', { sendLocation: 'when-open' }))
    await act(async () => {})
    expect(result.current.locationOff).toBe(false)
    act(() => onError({ code: 1, message: 'denied' }))
    expect(result.current.locationOff).toBe(true)
    act(() => onFix({ coords: { latitude: 3, longitude: 101, accuracy: 8 } }))
    expect(result.current.locationOff).toBe(false)
  })
})
