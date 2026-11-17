import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { View } from '../../shared/views.js'
import { testView } from './testView'

const state = vi.hoisted(() => ({ view: null as View | null }))
vi.mock('../game/useGameState', () => ({ useGameState: () => ({ view: state.view, error: '', refresh: vi.fn() }) }))
vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
// jsdom has no matchMedia, which the marshal alerts card checks.
vi.mock('../game/push', () => ({
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

describe('GameScreen loading', () => {
  it('shows the home logo with the game code while the game loads', () => {
    state.view = null
    render(<GameScreen code="ABC234" />)
    expect(screen.getByRole('img', { name: 'kejar.' })).toBeInTheDocument()
    expect(document.querySelector('.hl-caption')?.textContent).toContain('JOM, LOADING GAME ABC234')
    expect(screen.getByRole('status', { name: 'JOM, LOADING GAME ABC234' })).toBeInTheDocument()
  })

  it('once the game arrives the j runs off and the game shows', () => {
    state.view = null
    const { rerender } = render(<GameScreen code="ABC234" />)
    state.view = testView({ paused: true })
    rerender(<GameScreen code="ABC234" />)
    // Without a measured screen (jsdom) the run-off finishes at once.
    expect(screen.getByText('Game paused')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /LOADING GAME/ })).toBeNull()
  })
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

  it('a cancelled game shows Game cancelled to everyone, with no SOS and no results', () => {
    state.view = testView({ phase: 'ended', cancelled: true, results: null })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByRole('heading', { name: 'Game cancelled' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Help and SOS' })).toBeNull()
    expect(screen.queryByText('Game over')).toBeNull()
  })

  it('the organiser can cancel a running game from the live screen; a marshal cannot', () => {
    const base = testView()
    localStorage.clear()
    localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'h1', name: 'Owner' }))
    state.view = testView({ me: { ...base.me, id: 'host', name: 'Owner', role: 'marshal', tag_id: null } })
    const { unmount } = render(<GameScreen code="ABC234" />)
    expect(screen.getByRole('button', { name: 'Cancel game' })).toHaveClass('btn-danger')
    unmount()
    state.view = testView({ me: { ...base.me, id: 'm1', role: 'marshal', tag_id: null } })
    render(<GameScreen code="ABC234" />)
    expect(screen.queryByRole('button', { name: 'Cancel game' })).toBeNull()
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

describe('GameScreen Luar Garisan routing', () => {
  it('shows Luar Garisan, not Penjara or the chase, to a disqualified runner', () => {
    const base = testView()
    state.view = testView({ me: { ...base.me, disqualified_at: '2026-10-25T09:10:00.000Z' } })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByRole('heading', { name: /Luar Garisan/ })).toBeInTheDocument()
    expect(screen.queryByText(/penjara/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Scan' })).toBeNull()
  })

  it('shows Luar Garisan, not Hide, to a runner disqualified in the hiding phase', () => {
    const base = testView()
    state.view = testView({ phase: 'hiding', me: { ...base.me, disqualified_at: '2026-10-25T09:10:00.000Z' } })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByRole('heading', { name: /Luar Garisan/ })).toBeInTheDocument()
  })

  it('wins over Penjara for a runner who is somehow both', () => {
    const base = testView()
    state.view = testView({ me: { ...base.me, jailed: true, disqualified_at: '2026-10-25T09:10:00.000Z' } })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByRole('heading', { name: /Luar Garisan/ })).toBeInTheDocument()
  })
})

describe('marshal header counts with Luar Garisan', () => {
  const marshal = (n: number) => {
    const base = testView()
    return testView({
      me: { ...base.me, id: 'm1', role: 'marshal', tag_id: null },
      counts: { runnersFree: 2, runnersJailed: 1, runnersLuarGarisan: n, chasers: 1 },
    })
  }
  it('adds the Luar Garisan count when there is one', () => {
    state.view = marshal(2)
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText(/2 free · 1 in Penjara · 2 Luar Garisan · 1 Kejar/)).toBeInTheDocument()
  })
  it('leaves it out at zero', () => {
    state.view = marshal(0)
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText(/2 free · 1 in Penjara · 1 Kejar/)).toBeInTheDocument()
  })
})

describe('Super Ring house arrest routing (new power-ups §6.2)', () => {
  const arrest = { endsAt: 231_000, center: { lat: 3, lng: 101 }, openBy: null }

  it('a runner under house arrest gets the house-arrest screen, not the chase', () => {
    state.view = testView({ arrest })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText('House arrest: stay within 26 m for 2:36.')).toBeInTheDocument()
    expect(screen.queryByText(/DIKEJAR #07/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Help and SOS' })).toBeInTheDocument()
  })

  it('released: says Free! Super Ring is spent, then goes back to the chase', () => {
    vi.useFakeTimers()
    state.view = testView({ arrest })
    const { rerender } = render(<GameScreen code="ABC234" />)
    state.view = testView({ arrest: null })
    rerender(<GameScreen code="ABC234" />)
    expect(screen.getByRole('heading', { name: 'Free! Super Ring is spent.' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3_000))
    expect(screen.queryByRole('heading', { name: 'Free! Super Ring is spent.' })).toBeNull()
  })

  it('an undone arrest gives Super Ring back, so no "spent" line', () => {
    state.view = testView({ arrest })
    const { rerender } = render(<GameScreen code="ABC234" />)
    const ring = { id: 'u1', game_id: 'g1', player_id: 'r1', kind: 'ring' as const, station: null, claimed_at: '', used_at: null, consumed_at: null, sealed: false, taken_at: null, offer: null, twin_of: null, spot: null }
    state.view = testView({ arrest: null, hand: [ring] })
    rerender(<GameScreen code="ABC234" />)
    expect(screen.queryByRole('heading', { name: 'Free! Super Ring is spent.' })).toBeNull()
  })

  it('bail revoked goes to the normal Penjara screen', () => {
    state.view = testView({ arrest })
    const { rerender } = render(<GameScreen code="ABC234" />)
    const base = testView()
    state.view = testView({ arrest: null, jailReason: 'bail-revoked', me: { ...base.me, jailed: true } })
    rerender(<GameScreen code="ABC234" />)
    expect(screen.getByRole('heading', { name: 'Bail revoked. To Penjara.' })).toBeInTheDocument()
  })
})

describe('GameScreen: the endgame takeover (endgame design §6.4)', () => {
  const bomba = { kind: 'bomba' as const, revealedAt: 90_000, wanted: null, bountyCaught: false }
  const base = testView()
  it.each([
    ['the runner chase', testView({ endgame: bomba })],
    ['the chaser chase', testView({ endgame: bomba, me: { ...base.me, id: 'c1', role: 'chaser', tag_id: null } })],
    ['Penjara', testView({ endgame: bomba, me: { ...base.me, jailed: true } })],
    ['house arrest', testView({ endgame: bomba, arrest: { endsAt: 160_000, center: { lat: 3, lng: 101 }, openBy: null } })],
    ['the marshal', testView({ endgame: bomba, me: { ...base.me, id: 'm1', role: 'marshal', tag_id: null } })],
  ])('goes over %s', (_, v) => {
    state.view = v
    render(<GameScreen code="ABC234" />)
    expect(screen.getByRole('alertdialog', { name: 'bomba!' })).toBeInTheDocument()
  })

  it('not on the results screen', () => {
    state.view = testView({
      phase: 'ended',
      endgame: bomba,
      results: { winner: 'runners', survivors: [], longestSurvivor: null, mostCatches: null, jailbreakHero: null },
    })
    render(<GameScreen code="ABC234" />)
    expect(screen.queryByRole('alertdialog', { name: 'bomba!' })).toBeNull()
  })

  it('the chase screen carries the chip once it is revealed', () => {
    localStorage.setItem('kejar:endgame-seen:ABC234', '1')
    state.view = testView({ endgame: bomba })
    render(<GameScreen code="ABC234" />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('button', { name: /Bomba/ })).toBeInTheDocument()
  })
})

describe('GameScreen: how a rescue ended (rules §9a)', () => {
  const base = testView()
  const feedLine = (text: string) => ({ at: new Date(100_500).toISOString(), text, means: null, act: false, label: 'RESCUE' })
  const rescue = (by: string) => ({ by, byName: by === 'r1' ? 'Aina' : 'Hafiz', heldMs: 18_000, holdSince: 99_000, resetAt: null })

  it('a runner in Penjara it freed sees the gate open: LEPAS! and their head start', () => {
    state.view = testView({ rescue: rescue('r3'), me: { ...base.me, jailed: true, caught_at: new Date(10_000).toISOString() } })
    const { rerender } = render(<GameScreen code="ABC234" />)
    state.view = testView({
      now: 101_000,
      rescue: null,
      feed: [feedLine('Jailbreak! 2 Dikejar free.')],
      me: { ...base.me, jailed: false, freed_once: true, freed_at: new Date(100_500).toISOString(), caught_at: new Date(10_000).toISOString() },
    })
    rerender(<GameScreen code="ABC234" />)
    expect(screen.getByText('LEPAS!')).toBeInTheDocument()
    expect(screen.getByText("You're free.")).toBeInTheDocument()
  })

  it('the rescuer sees Rescue reset. once, and not again on the next poll', () => {
    state.view = testView({ rescue: rescue('r1') })
    const { rerender } = render(<GameScreen code="ABC234" />)
    state.view = testView({ now: 101_000, rescue: null, feed: [feedLine('The rescue reset.')] })
    rerender(<GameScreen code="ABC234" />)
    expect(screen.getByText('Rescue reset.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Rescue reset.'))
    state.view = testView({ now: 104_000, rescue: null, feed: [feedLine('The rescue reset.')] })
    rerender(<GameScreen code="ABC234" />)
    expect(screen.queryByText('Rescue reset.')).toBeNull()
  })

  it('a free runner with nothing to do with it sees no ending', () => {
    state.view = testView({ rescue: rescue('r3') })
    const { rerender } = render(<GameScreen code="ABC234" />)
    state.view = testView({ now: 101_000, rescue: null, feed: [feedLine('Jailbreak! 2 Dikejar free.')] })
    rerender(<GameScreen code="ABC234" />)
    expect(screen.queryByText('LEPAS!')).toBeNull()
  })
})
