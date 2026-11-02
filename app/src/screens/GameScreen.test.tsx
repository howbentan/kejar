import { cleanup, render, screen } from '@testing-library/react'
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

beforeEach(() => localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' })))
afterEach(() => {
  cleanup()
  localStorage.clear()
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

  it('sends a marshal to MarshalLive once the game has ended too, not to Results', () => {
    const base = testView()
    state.view = testView({ phase: 'ended', me: { ...base.me, id: 'm1', role: 'marshal', tag_id: null } })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText('Marshal · live')).toBeInTheDocument()
    expect(screen.queryByText('Game over')).toBeNull()
  })

  it('sends a non-marshal to Results once the game has ended', () => {
    state.view = testView({ phase: 'ended', results: { winner: 'runners', survivors: [], longestSurvivor: null, mostCatches: null, jailbreakHero: null } })
    render(<GameScreen code="ABC234" />)
    expect(screen.getByText('Game over')).toBeInTheDocument()
    expect(screen.queryByText('Marshal · live')).toBeNull()
  })
})
