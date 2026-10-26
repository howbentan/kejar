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
vi.mock('../spike/push', () => ({
  subscribe: vi.fn(),
  pushSupport: () => 'unsupported',
  currentPushEnv: () => ({}),
  NotificationsDeniedError: class extends Error {},
}))

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
  ],
  results: null,
} as unknown as View

beforeEach(() => {
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ hostKey: 'h1' }))
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

  it('shuffles roles through setRoles', async () => {
    render(<HostLobby code="ABC234" />)
    fireEvent.click(await screen.findByRole('button', { name: /shuffle roles/i }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setRoles', { code: 'ABC234', hostKey: 'h1', shuffle: true }),
    )
  })

  it('sets a role with the pill buttons, showing the current one as selected', async () => {
    render(<HostLobby code="ABC234" />)
    const runner = await screen.findByRole('radio', { name: 'Aina: Dikejar' })
    expect(runner).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Aina: Kejar' }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setRoles', { code: 'ABC234', hostKey: 'h1', roles: { p1: 'chaser' } }),
    )
  })
})
