import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn(async () => ({})))
const mapProps = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }))
const wake = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({
  default: (p: Record<string, unknown>) => {
    mapProps.last = p
    return null
  },
}))
vi.mock('../game/here', () => ({ currentCoords: async () => ({ lat: 3.1, lng: 101.1, accuracy_m: 8 }) }))
vi.mock('../game/useWakeLock', () => ({ useWakeLock: wake }))
import HouseArrest, { ARREST_PING_MS } from './HouseArrest'
import { testView } from './testView'

beforeEach(() => {
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
  call.mockClear()
  wake.mockClear()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

const centre = { lat: 3.1, lng: 101.1 }
// testView's clock is at 100 000 ms.
const running = testView({ arrest: { endsAt: 231_000, center: centre, openBy: null } })
const waiting = testView({ arrest: { endsAt: null, center: null, openBy: 148_000 } })

describe('HouseArrest (new power-ups §6.2)', () => {
  it('shows the countdown, the rule and Keep Kejar open', () => {
    render(<HouseArrest code="ABC234" view={running} />)
    expect(screen.getByText('2:11')).toBeInTheDocument()
    expect(screen.getByText('House arrest: stay within 26 m for 2:36.')).toBeInTheDocument()
    expect(screen.getByText('Keep Kejar open.')).toBeInTheDocument()
  })

  it('draws the 26 m circle on the map with my own dot', () => {
    const me = { id: 'r1', kind: 'me' as const, lat: 3.1001, lng: 101.1, at: '', revealedBy: null }
    render(<HouseArrest code="ABC234" view={{ ...running, dots: [me] }} />)
    expect(mapProps.last?.circle).toEqual({ ...centre, radiusM: 26 })
    expect(mapProps.last?.dots).toEqual([me])
  })

  it('the countdown holds still while paused', () => {
    vi.useFakeTimers()
    render(<HouseArrest code="ABC234" view={{ ...running, paused: true }} />)
    act(() => vi.advanceTimersByTime(5_000))
    expect(screen.getByText('2:11')).toBeInTheDocument()
  })

  it('waiting: asks them to open Kejar, with the seconds left, and no circle yet', () => {
    render(<HouseArrest code="ABC234" view={waiting} />)
    expect(screen.getByRole('heading', { name: 'Open Kejar to start house arrest' })).toBeInTheDocument()
    expect(screen.getByText('48 s')).toBeInTheDocument()
    expect(screen.getByText('Keep Kejar open.')).toBeInTheDocument()
    expect(mapProps.last?.circle ?? null).toBeNull()
  })

  it('keeps the screen awake and sends a fresh fix straight away, then every few seconds', async () => {
    vi.useFakeTimers()
    render(<HouseArrest code="ABC234" view={waiting} />)
    expect(wake).toHaveBeenCalledWith(true)
    await act(async () => {})
    expect(call).toHaveBeenCalledWith('location', { code: 'ABC234', token: 't1', lat: 3.1, lng: 101.1, accuracy_m: 8 })
    const first = call.mock.calls.length
    await act(async () => vi.advanceTimersByTime(ARREST_PING_MS))
    expect(call.mock.calls.length).toBeGreaterThan(first)
  })

  it('released: Free! Super Ring is spent.', () => {
    render(<HouseArrest code="ABC234" view={testView()} released />)
    expect(screen.getByRole('heading', { name: 'Free! Super Ring is spent.' })).toBeInTheDocument()
  })
})
