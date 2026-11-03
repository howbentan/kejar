import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { View } from '../../shared/views.js'
import { testView } from './testView'

const state = vi.hoisted(() => ({ view: null as View | null }))
vi.mock('../game/useGameState', () => ({ useGameState: () => ({ view: state.view, error: '', refresh: vi.fn() }) }))
vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
// jsdom has no matchMedia, which the marshal alerts card checks.
vi.mock('../spike/push', () => ({
  subscribe: vi.fn(),
  pushSupport: () => 'unsupported',
  currentPushEnv: () => ({}),
  NotificationsDeniedError: class extends Error {},
}))

import GameScreen from './GameScreen'

beforeEach(() => {
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
  sessionStorage.clear() // shouldPlay('freed', ...) marks itself played here; a stale mark would leak between tests.
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

describe('GameScreen safety routing', () => {
  it('shows Game paused to runners, with SOS still there', () => {
    state.view = testView({ paused: true })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText('Game paused')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Help and SOS' })).toBeInTheDocument()
  })

  it('shows the removed message to removed players, without SOS', () => {
    const base = testView()
    state.view = testView({ me: { ...base.me, removed_at: '2026-10-25T09:10:00.000Z' } })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText('A marshal removed you from this game')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Help and SOS' })).toBeNull()
  })

  it.each([
    ['the runner chase', testView()],
    ['the chaser chase', testView({ me: { ...testView().me, id: 'c1', role: 'chaser', tag_id: null } })],
    ['Penjara', testView({ me: { ...testView().me, jailed: true } })],
    ['hiding', testView({ phase: 'hiding' })],
    ['paused', testView({ paused: true })],
  ])('shows the SOS icon on %s, and no old safety bar', (_, v) => {
    state.view = v
    render(<GameScreen code="ABC234" />)
    expect(screen.getByRole('button', { name: 'Help and SOS' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'SOS' })).toBeNull()
  })

  it('sends a marshal to MarshalLive once the game has ended too, with the results shown there', () => {
    const base = testView()
    state.view = testView({
      phase: 'ended',
      me: { ...base.me, id: 'm1', role: 'marshal', tag_id: null },
      results: { winner: 'chasers', survivors: [], longestSurvivor: null, mostCatches: null, jailbreakHero: null },
    })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText('Marshal · live')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /after game/i })).toBeInTheDocument()
    expect(screen.getByText('Game over')).toBeInTheDocument()
    expect(screen.getByText('Kejar win.')).toBeInTheDocument()
    // The post-game rating and report are for players, not marshals.
    expect(screen.queryByText('How fun was it?')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Play again' })).toBeNull()
  })

  it('sends the organiser to MarshalLive once ended, with the results and Play again', () => {
    const base = testView()
    localStorage.clear()
    localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'h1', name: 'Owner' }))
    state.view = testView({
      phase: 'ended',
      me: { ...base.me, id: 'host', name: 'Owner', role: 'marshal', tag_id: null },
      results: { winner: 'runners', survivors: ['r1'], longestSurvivor: null, mostCatches: null, jailbreakHero: null },
    })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText('Dikejar escaped.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Play again' })).toHaveAttribute('href', '/host/new')
    expect(screen.getByRole('tab', { name: /after game/i })).toBeInTheDocument()
  })

  it('sends a non-marshal to Results once the game has ended', () => {
    state.view = testView({ phase: 'ended', results: { winner: 'runners', survivors: [], longestSurvivor: null, mostCatches: null, jailbreakHero: null } })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText('Game over')).toBeInTheDocument()
    expect(screen.queryByText('Marshal · live')).toBeNull()
  })
})

describe('GameScreen: the freed-moment window (design doc §6a)', () => {
  const base = testView()
  const freedAt = new Date(base.now).toISOString() // fresh relative to testView's own clock

  it('keeps showing Penjara for a beat after Settle frees this player, then hands off to the runner chase', () => {
    vi.useFakeTimers()
    state.view = testView({ me: { ...base.me, jailed: true, caught_by: 'c1' }, caughtBy: 'Ben', jailReason: 'caught' })
    const { rerender } = render(<GameScreen code="ABC234" />)
    expect(screen.getByText('PENJARA', { selector: 'p.eyebrow' })).toBeInTheDocument()

    // The next poll: Settle resolved, jailed flips false, but the player hasn't seen the stamp yet.
    state.view = testView({ me: { ...base.me, jailed: false, freed_at: freedAt } })
    act(() => rerender(<GameScreen code="ABC234" />))
    expect(screen.getByText('PENJARA', { selector: 'p.eyebrow' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(2_500))
    expect(screen.queryByText('PENJARA', { selector: 'p.eyebrow' })).toBeNull()
  })

  it('an auto-jailed player who gets freed still shows as auto-jailed, not misrouted to the catch screen', () => {
    state.view = testView({ me: { ...base.me, jailed: true }, jailReason: 'missed-checkins' })
    const { rerender } = render(<GameScreen code="ABC234" />)
    expect(screen.getByText('PENJARA · AUTO', { selector: 'p.eyebrow' })).toBeInTheDocument()

    state.view = testView({ me: { ...base.me, jailed: false, freed_at: freedAt } })
    rerender(<GameScreen code="ABC234" />)
    expect(screen.getByText('PENJARA · AUTO', { selector: 'p.eyebrow' })).toBeInTheDocument()
  })

  it('an old freed_at, well outside the moment window, does not hold the screen open', () => {
    state.view = testView({ me: { ...base.me, jailed: false, freed_at: new Date(base.now - 10 * 60_000).toISOString() } })
    render(<GameScreen code="ABC234" />)
    expect(screen.queryByText('PENJARA', { selector: 'p.eyebrow' })).toBeNull()
  })
})
