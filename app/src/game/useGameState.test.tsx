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
})
