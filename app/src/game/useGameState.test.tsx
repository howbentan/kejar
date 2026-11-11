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
      value: {
        watchPosition: (ok: (p: unknown) => void) => ((onFix = ok), 1),
        clearWatch: () => {},
        // The first fix is 30 s old when the window opens, so the phone asks for a fresh one.
        getCurrentPosition: (ok: (p: unknown) => void) => ok({ timestamp: Date.now(), coords: { latitude: 3, longitude: 101, accuracy: 8 } }),
      },
    })
    const alertAt = Date.now() + 30_000
    call.mockImplementation(async (action: string) => (action === 'state' ? { phase: 'chasing', now: Date.now(), nextAlertAt: alertAt } : { ok: true }))
    renderHook(() => useGameState('ABC234', { sendLocation: 'when-open' }))
    await act(async () => {})
    act(() => onFix({ timestamp: Date.now(), coords: { latitude: 3, longitude: 101, accuracy: 8 } }))
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

  it('retries quietly on the next poll when a poll is limited (429)', async () => {
    const limited = Object.assign(new Error('Too many requests — wait a moment and try again'), { status: 429 })
    call.mockRejectedValueOnce(limited)
    const { result } = renderHook(() => useGameState('ABC234', { sendLocation: 'never' }))
    await act(async () => {})
    expect(result.current.error).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(stateCalls()).toHaveLength(2)
    expect(result.current.error).toBeNull()
    expect(result.current.view).not.toBeNull()
  })

  it('still shows other poll errors', async () => {
    call.mockRejectedValueOnce(Object.assign(new Error('Something went wrong'), { status: 500 }))
    const { result } = renderHook(() => useGameState('ABC234', { sendLocation: 'never' }))
    await act(async () => {})
    expect(result.current.error).toBe('Something went wrong')
  })

  describe('check-in re-send', () => {
    const fixAt = (timestamp: number) => ({ timestamp, coords: { latitude: 3, longitude: 101, accuracy: 8 } })
    const locationCalls = () => call.mock.calls.filter(([a]) => a === 'location')
    const setup = (getCurrentPosition: (ok: (p: unknown) => void, bad: (e: unknown) => void, o: unknown) => void) => {
      let onFix: (p: unknown) => void = () => {}
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { watchPosition: (ok: (p: unknown) => void) => ((onFix = ok), 1), clearWatch: () => {}, getCurrentPosition },
      })
      // The window opens 2 s in, so the second poll (at 3 s) is the first inside it.
      const alertAt = Date.now() + 2_000
      call.mockImplementation(async (action: string) => (action === 'state' ? { phase: 'chasing', now: Date.now(), nextAlertAt: alertAt } : { ok: true }))
      renderHook(() => useGameState('ABC234', { sendLocation: 'when-open' }))
      return (p: unknown) => act(() => onFix(p))
    }

    it('re-sends a last fix that is 5 s old', async () => {
      const getCurrentPosition = vi.fn()
      const deliver = setup(getCurrentPosition)
      await act(async () => {})
      deliver(fixAt(Date.now() - 5_000))
      expect(locationCalls()).toHaveLength(1) // the watch send
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      expect(getCurrentPosition).not.toHaveBeenCalled()
      expect(locationCalls()).toHaveLength(2)
    })

    it('asks for a fresh fix when the last one is 3 min old, and sends that', async () => {
      const getCurrentPosition = vi.fn((ok: (p: unknown) => void, _bad?: unknown, _opts?: unknown) => ok({ timestamp: Date.now(), coords: { latitude: 4, longitude: 102, accuracy: 5 } }))
      const deliver = setup(getCurrentPosition)
      await act(async () => {})
      deliver(fixAt(Date.now() - 180_000))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      expect(getCurrentPosition).toHaveBeenCalledTimes(1)
      expect(getCurrentPosition.mock.calls[0][2]).toEqual({ maximumAge: 0, enableHighAccuracy: true, timeout: 15_000 })
      const sent = locationCalls()
      expect(sent).toHaveLength(2)
      expect(sent[1][1]).toMatchObject({ lat: 4, lng: 102, accuracy_m: 5 })
    })

    it('sends nothing and does not throw when the fresh fix fails', async () => {
      const getCurrentPosition = vi.fn((_ok: unknown, bad: (e: unknown) => void) => bad({ code: 3, message: 'timeout' }))
      const deliver = setup(getCurrentPosition)
      await act(async () => {})
      deliver(fixAt(Date.now() - 180_000))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      expect(getCurrentPosition).toHaveBeenCalled()
      expect(locationCalls()).toHaveLength(1) // only the watch send
    })
  })
})
