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
import { nextOccurrence } from '../game/plannedStart'
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
  counts: { runnersFree: 2, runnersJailed: 0, runnersLuarGarisan: 0, chasers: 0 },
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
  it('opening the lobby with an organiser session records the last game', async () => {
    render(<HostLobby code="ABC234" />)
    await screen.findByText('CORE')
    expect(localStorage.getItem('kejar.lastGame')).toContain('"organiser"')
    expect(localStorage.getItem('kejar.lastGame')).toContain('"ABC234"')
  })

  it('typing a time sends nothing until the organiser leaves the field, and the field shows the saved time', async () => {
    const startsAt = new Date(nextOccurrence('19:30', Date.now())).toISOString()
    call.mockImplementation(async (action: string) => (action === 'state' ? { ...lobbyView, settings: { ...lobbyView.settings, startsAt } } : { ok: true }))
    render(<HostLobby code="ABC234" />)
    const input = (await screen.findByLabelText('planned start')) as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('19:30'))
    fireEvent.change(input, { target: { value: '07:03' } })
    fireEvent.change(input, { target: { value: '07:30' } })
    expect(call).not.toHaveBeenCalledWith('setStartTime', expect.anything())
    expect(input).not.toBeDisabled()
    fireEvent.blur(input)
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setStartTime', { code: 'ABC234', organiserToken: 'h1', startsAt: new Date(nextOccurrence('07:30', Date.now())).toISOString() }),
    )
    expect(call.mock.calls.filter((c) => c[0] === 'setStartTime')).toHaveLength(1)
  })

  it('the organiser sets a planned start, and clears it', async () => {
    const startsAt = new Date(Date.now() + 20 * 60_000).toISOString()
    call.mockImplementation(async (action: string) => {
      if (action === 'state') return { ...lobbyView, settings: { ...lobbyView.settings, startsAt } }
      return { ok: true }
    })
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByText(/in 20 min/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('planned start'), { target: { value: '19:30' } })
    fireEvent.blur(screen.getByLabelText('planned start'))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setStartTime', { code: 'ABC234', organiserToken: 'h1', startsAt: new Date(nextOccurrence('19:30', Date.now())).toISOString() }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('setStartTime', { code: 'ABC234', organiserToken: 'h1', startsAt: null }))
  })

  it('the organiser cancels the game in two taps: the red button, then Yes, cancel game', async () => {
    render(<HostLobby code="ABC234" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel game' }))
    expect(screen.getByText('Cancel game ABC234 for everyone?')).toBeInTheDocument()
    expect(call).not.toHaveBeenCalledWith('cancelGame', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Keep the game' }))
    expect(screen.queryByText('Cancel game ABC234 for everyone?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel game' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('cancelGame', { code: 'ABC234', organiserToken: 'h1' }))
  })

  it('a cancelled lobby shows Game cancelled', async () => {
    call.mockImplementation(async (action: string) => (action === 'state' ? { ...lobbyView, cancelled: true, roster: [] } : {}))
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByRole('heading', { name: 'Game cancelled' })).toBeInTheDocument()
    expect(screen.getByText('You cancelled this game. Nobody gets results this time.')).toBeInTheDocument()
  })

  it('shows the game mode next to the code', async () => {
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByText('CORE')).toBeInTheDocument()
  })

  it('a Full lobby shown to players gives nothing away, and has no Organiser tools: the walk hides the boxes', async () => {
    const stash = { lat: 0.002, lng: 0.002, claimedBy: null, claimedAt: null }
    call.mockImplementation(async (action: string) =>
      action === 'state' ? { ...lobbyView, settings: { ...DEFAULT_SETTINGS, mode: 'full' }, datoStash: stash } : {},
    )
    render(<HostLobby code="ABC234" />)
    await screen.findByText('FULL')
    expect(screen.queryByRole('button', { name: 'Organiser tools' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/dato|bomoh|legendary|hidden card|reprint/i)
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

describe('HostLobby setup steps', () => {
  const at = (search: string) =>
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, origin: 'https://kejar.test', search, assign: vi.fn() } })
  afterEach(() => at(''))

  it('?setup=crew shows step 4 with the progress bar and no join QR', async () => {
    at('?setup=crew')
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByRole('heading', { name: 'Your crew.' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Step 4 of 5' })).toBeInTheDocument()
    expect(screen.queryByAltText('Join QR code')).toBeNull()
  })

  it('?setup=pack shows step 5 with the progress bar and no join QR', async () => {
    at('?setup=pack')
    call.mockImplementation(async (action: string) =>
      action === 'state' ? { ...lobbyView, kit: { items: [{ id: 'armbands', group: 'pack', label: 'Armbands #01–#40', ticked: false }], places: [], placed: {} } } : {},
    )
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByRole('heading', { name: 'Pack.' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Step 5 of 5' })).toBeInTheDocument()
    expect(screen.queryByAltText('Join QR code')).toBeNull()
  })
})

describe('HostLobby mode and checks', () => {
  const fullView = {
    ...lobbyView,
    settings: { ...DEFAULT_SETTINGS, mode: 'full' },
    kit: {
      items: [
        { id: 'penjara', group: 'pack', label: 'Penjara card', ticked: false },
        { id: 'tupperware', group: 'pack', label: '1 red Tupperware, 1 Dikejar slip', tone: 'red', note: '(secret)', ticked: false },
        { id: 'brief-players', group: 'day', label: 'Brief the players', ticked: false },
      ],
      places: [],
      placed: {},
    },
  } as unknown as View

  it('Change switches Core to Full through setMode', async () => {
    render(<HostLobby code="ABC234" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('setMode', { code: 'ABC234', organiserToken: 'h1', mode: 'full' }))
  })

  it('switching Full to Core drops the Tupperware from the packing list, with no notice', async () => {
    let mode: 'full' | 'core' = 'full'
    call.mockImplementation(async (action: string, body: { mode?: 'full' | 'core' }) => {
      if (action === 'setMode') {
        mode = body.mode!
        return { ok: true }
      }
      if (action !== 'state') return {}
      if (mode === 'full') return fullView
      return { ...fullView, settings: { ...DEFAULT_SETTINGS, mode: 'core' }, kit: { ...fullView.kit, items: fullView.kit!.items.filter((i) => i.id !== 'tupperware') } }
    })
    render(<HostLobby code="ABC234" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Kit list' }))
    expect(await screen.findByText('1 red Tupperware, 1 Dikejar slip')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(screen.queryByText('1 red Tupperware, 1 Dikejar slip')).toBeNull())
    expect(screen.getByText('CORE')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/hidden card|pick it up/i)
  })

  it('goes straight to the game once it starts', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, origin: 'https://kejar.test', search: '', assign } })
    let started = false
    call.mockImplementation(async (action: string) => {
      if (action === 'start') {
        started = true
        return { startedAt: 'now' }
      }
      return action === 'state' ? { ...fullView, phase: started ? 'hiding' : 'lobby' } : {}
    })
    render(<HostLobby code="ABC234" />)
    fireEvent.click(await screen.findByRole('button', { name: /start game/i }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/g/ABC234'))
  })

  it('shows Before you start, and Start game stays enabled with every check unticked', async () => {
    call.mockImplementation(async (action: string) => (action === 'state' ? fullView : {}))
    render(<HostLobby code="ABC234" />)
    expect(await screen.findByText('BEFORE YOU START')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Kit placed/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: /start game/i })).toBeEnabled()
  })
})
