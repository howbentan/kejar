import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/types.js'
import type { View } from '../../shared/views.js'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', async () => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  return { call, ApiError }
})

// jsdom has no matchMedia; the alerts button is covered by MarshalTools tests.
vi.mock('../game/push', () => ({
  subscribe: vi.fn(),
  pushSupport: () => 'unsupported',
  currentPushEnv: () => ({}),
  NotificationsDeniedError: class extends Error {},
}))

vi.mock('../game/Map', () => ({ default: () => null }))

import { ApiError } from '../game/api'
import HostLobby from './HostLobby'

const lobbyView = {
  phase: 'lobby',
  endsAt: null,
  now: 0,
  me: { id: 'host', name: 'Organiser', role: 'marshal' },
  arena: { id: 'around-me', name: 'Around', boundary: [], jail: { lat: 0, lng: 0 }, start: { lat: 0, lng: 0 } },
  settings: DEFAULT_SETTINGS,
  dots: [],
  nextRevealAt: null,
  nextAlertAt: null,
  chaserNearby: false,
  feed: [],
  counts: { runnersFree: 2, runnersJailed: 0, chasers: 0 },
  roster: [
    { id: 'p1', name: 'Aina', role: 'runner', tag_id: 7, jailed: false },
    { id: 'p2', name: 'Hafiz', role: 'runner', tag_id: null, jailed: false },
    { id: 'p3', name: 'Wei', role: null, tag_id: null, jailed: false },
    { id: 'm1', name: 'Siti', role: 'marshal', tag_id: null, jailed: false },
  ],
  results: null,
  stations: [{ n: 1, lat: 0.001, lng: 0.001 }],
} as unknown as View

beforeEach(() => {
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'h1', name: 'Owner' }))
  call.mockReset()
  call.mockImplementation(async (action: string) => {
    if (action === 'state') return lobbyView
    if (action === 'start') throw new ApiError(409, 'Need at least 1 chaser')
    if (action === 'setRoles') return { roles: {}, problems: [] }
    return {}
  })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('HostLobby', () => {
  it('shows the game mode next to the code', async () => {
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByText('CORE')).toBeInTheDocument()
  })

  it('a Full lobby shown to players gives nothing away; the hidden card sits behind a toggle below the join card', async () => {
    const stash = { lat: 0.002, lng: 0.002, claimedBy: null, claimedAt: null }
    call.mockImplementation(async (action: string) =>
      action === 'state' ? { ...lobbyView, settings: { ...DEFAULT_SETTINGS, mode: 'full' }, datoStash: stash } : {},
    )
    render(<HostLobby code="ABC234" />)
    const toggle = await screen.findByRole('button', { name: 'Organiser tools' })
    expect(document.body.textContent).not.toMatch(/dato|legendary|yellow pin/i)
    expect(screen.queryByRole('button', { name: 'Drop the ★ card here' })).toBeNull()
    const join = screen.getByText('Scan to join')
    expect(join.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Drop the ★ card here' })).toBeInTheDocument()
  })

  it('lists the players with their tags', async () => {
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByText('Aina')).toBeInTheDocument()
    expect(screen.getByText('#07')).toBeInTheDocument()
    expect(screen.getByText('No tag yet')).toBeInTheDocument()
  })

  it('shows the start problem from the server verbatim', async () => {
    render(<HostLobby code="ABC234" />)
    fireEvent.click(await screen.findByRole('button', { name: /start game/i }))
    expect(await screen.findByText('Need at least 1 chaser')).toBeInTheDocument()
  })

  it("the organiser picks each player's side", async () => {
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByRole('radio', { name: 'Aina: Dikejar' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Wei: Dikejar' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Wei: Kejar' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Aina: Kejar' }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setRoles', { code: 'ABC234', organiserToken: 'h1', roles: { p1: 'chaser' } }),
    )
  })

  it('marshal is never a player option, and there is no random shuffle', async () => {
    render(<HostLobby code="ABC234" />)
    await screen.findByText('Aina')
    expect(screen.queryByRole('radio', { name: /Marshal/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /shuffle/i })).toBeNull()
  })

  it('an invited marshal is listed as a marshal, with no side to pick', async () => {
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByText('Siti')).toBeInTheDocument()
    expect(screen.getByText('Marshal')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Siti:/ })).toBeNull()
  })

  it('shows the team count and a suggested number of Kejar', async () => {
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByText('2 Dikejar · 0 Kejar · 1 to pick')).toBeInTheDocument()
    expect(screen.getByText('About 1 Kejar for every 4 players: 1 for 3 players.')).toBeInTheDocument()
  })

  it('the organiser sees the setup map', async () => {
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByText('Setup: where things go')).toBeInTheDocument()
    expect(screen.getByText('Station 1')).toBeInTheDocument()
  })
})
