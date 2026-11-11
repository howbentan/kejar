import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from '../../shared/alerts.js'
import type { View } from '../../shared/views.js'
import { testView } from './testView'

const call = vi.hoisted(() => vi.fn())
const useWakeLock = vi.hoisted(() => vi.fn())
vi.mock('../game/useWakeLock', () => ({ useWakeLock }))
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
// jsdom has no matchMedia, which the marshal alerts card checks.
vi.mock('../game/push', () => ({
  subscribe: vi.fn(),
  pushSupport: () => 'unsupported',
  currentPushEnv: () => ({}),
  NotificationsDeniedError: class extends Error {},
}))

import MarshalLive from './MarshalLive'

const sos = (id: string, text = 'SOS from Aina #07', handled = false): Alert => ({
  id,
  at: new Date(100_000 - 60_000).toISOString(),
  kind: 'sos',
  text,
  where: null,
  targetId: null,
  handled,
  respondingName: null,
  outcome: null,
  closedByName: null,
})

const marshal = (over: Partial<View> = {}) => {
  const base = testView()
  return testView({ me: { ...base.me, id: 'm1', name: 'Siti', role: 'marshal', tag_id: null }, ...over })
}
const organiser = (over: Partial<View> = {}) => {
  const base = testView()
  return testView({ me: { ...base.me, id: 'host', name: 'Owner', role: 'marshal', tag_id: null }, ...over })
}

let refresh: () => void

beforeEach(() => {
  call.mockReset()
  call.mockResolvedValue({ ok: true })
  refresh = vi.fn()
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'h1', name: 'Owner' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const takeover = () => screen.queryByRole('dialog', { name: 'SOS' })

describe('MarshalLive wake lock', () => {
  it('keeps the screen awake while the game runs, and not once it has ended', () => {
    const { rerender } = render(<MarshalLive code="ABC234" view={marshal()} refresh={refresh} />)
    expect(useWakeLock).toHaveBeenLastCalledWith(true)
    rerender(<MarshalLive code="ABC234" view={organiser({ phase: 'ended' })} refresh={refresh} />)
    expect(useWakeLock).toHaveBeenLastCalledWith(false)
  })
})

describe('MarshalLive SOS takeover', () => {
  it('"See the map first" hands back the normal screen, and it stays that way across polls, without touching the server', () => {
    const view = marshal({ alerts: [sos('e1')] })
    const { rerender } = render(<MarshalLive code="ABC234" view={view} refresh={refresh} />)
    expect(takeover()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /see the map first/i }))
    expect(takeover()).toBeNull()
    expect(screen.getByRole('button', { name: 'Pause game' })).toBeInTheDocument()
    // The next poll brings a fresh view with the same SOS still open: still stepped out.
    rerender(<MarshalLive code="ABC234" view={marshal({ alerts: [sos('e1')] })} refresh={refresh} />)
    expect(takeover()).toBeNull()
    expect(call).not.toHaveBeenCalled()
  })

  it('the pinned SOS row brings the takeover back', () => {
    render(<MarshalLive code="ABC234" view={marshal({ alerts: [sos('e1')] })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: /see the map first/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Open SOS' }))
    expect(takeover()).toBeInTheDocument()
  })

  it('a new SOS takes over again even after an earlier one was stepped out of', () => {
    const { rerender } = render(<MarshalLive code="ABC234" view={marshal({ alerts: [sos('e1')] })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: /see the map first/i }))
    rerender(<MarshalLive code="ABC234" view={marshal({ alerts: [sos('e2', 'SOS from Hafiz #03'), sos('e1')] })} refresh={refresh} />)
    expect(takeover()).toHaveTextContent('Hafiz #03')
  })

  it("a different SOS starts fresh: the last one's outcome isn't still chosen", () => {
    // The first SOS's chosen outcome must not carry over (nor enable Close SOS) once another one takes over.
    const { rerender } = render(<MarshalLive code="ABC234" view={marshal({ alerts: [sos('e1')] })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: /sorted, all good/i }))
    expect(screen.getByRole('button', { name: /close sos/i })).toBeEnabled()
    rerender(<MarshalLive code="ABC234" view={marshal({ alerts: [sos('e2', 'SOS from Hafiz #03'), sos('e1', undefined, true)] })} refresh={refresh} />)
    expect(takeover()).toHaveTextContent('Hafiz #03')
    expect(screen.getByRole('button', { name: /sorted, all good/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /close sos/i })).toBeDisabled()
  })

  it('Close SOS sends the outcome once, then refreshes', async () => {
    render(<MarshalLive code="ABC234" view={organiser({ alerts: [sos('e1')] })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: /first aid given/i }))
    fireEvent.click(screen.getByRole('button', { name: /close sos/i }))
    fireEvent.click(screen.getByRole('button', { name: /close sos/i }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('handleAlert', { code: 'ABC234', organiserToken: 'h1', eventId: 'e1', outcome: 'first-aid' })
  })

  it('a failed "I\'m going" shows the error on the takeover instead of failing silently', async () => {
    call.mockRejectedValue(new Error('Organiser only'))
    render(<MarshalLive code="ABC234" view={organiser({ alerts: [sos('e1')] })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: /i'm going/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Organiser only')
    expect(call).toHaveBeenCalledWith('respondToSos', { code: 'ABC234', organiserToken: 'h1', eventId: 'e1' })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('MarshalLive Undo kejar', () => {
  const roster = [
    { id: 'r1', name: 'Aina', role: 'runner' as const, tag_id: 7, jailed: true, caught_by: 'Ben', undoKejarId: 'e9' },
    { id: 'r2', name: 'Hafiz', role: 'runner' as const, tag_id: 3, jailed: true, caught_by: null, undoKejarId: null },
    { id: 'c1', name: 'Ben', role: 'chaser' as const, tag_id: null, jailed: false },
  ]
  const flagged: Alert = { ...sos('e9', 'Check catch: #07 by Ben (far from their last spot)'), kind: 'flagged-catch', targetId: 'r1' }

  it("a caught runner's row offers Undo kejar, and tapping it undoes that catch", async () => {
    render(<MarshalLive code="ABC234" view={organiser({ roster })} refresh={refresh} />)
    const buttons = screen.getAllByRole('button', { name: 'Undo kejar' })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(call).toHaveBeenCalledWith('undoKejar', { code: 'ABC234', organiserToken: 'h1', eventId: 'e9' })
  })

  it("that catch's flagged-catch alert offers it too", async () => {
    render(<MarshalLive code="ABC234" view={organiser({ roster, alerts: [flagged] })} refresh={refresh} />)
    expect(screen.getAllByRole('button', { name: 'Undo kejar' })).toHaveLength(2)
  })

  it("an alert for a catch that can't be undone any more has no Undo kejar", () => {
    render(<MarshalLive code="ABC234" view={organiser({ roster: roster.map((p) => ({ ...p, undoKejarId: null })), alerts: [flagged] })} refresh={refresh} />)
    expect(screen.queryByRole('button', { name: 'Undo kejar' })).toBeNull()
  })
})

describe('MarshalLive New phone', () => {
  const roster = [
    { id: 'r1', name: 'Aina', role: 'runner' as const, tag_id: 7, jailed: false },
    { id: 'c1', name: 'Ben', role: 'chaser' as const, tag_id: null, jailed: false },
    { id: 'm2', name: 'Lee', role: 'marshal' as const, tag_id: null, jailed: false },
  ]
  const share = vi.fn()
  beforeEach(() => {
    share.mockReset()
    share.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  })
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share')
  })

  it('is offered on runner and chaser rows only', () => {
    render(<MarshalLive code="ABC234" view={organiser({ roster })} refresh={refresh} />)
    expect(screen.getAllByRole('button', { name: /^New phone/ })).toHaveLength(2)
  })

  it('makes the link on the first tap, then Send link shares it inside that tap', async () => {
    call.mockResolvedValue({ inviteToken: 'tk9' })
    render(<MarshalLive code="ABC234" view={organiser({ roster })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'New phone for Aina' }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('createPhoneMove', { code: 'ABC234', organiserToken: 'h1', playerId: 'r1' }),
    )
    expect(await screen.findByText("Link ready. Send it to Aina's new phone.")).toBeInTheDocument()
    expect(share).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }))
    // No await before this: the share has to happen synchronously inside the click.
    expect(share).toHaveBeenCalledTimes(1)
    expect(share.mock.calls[0][0].text).toContain(`${window.location.origin}/p/ABC234/tk9`)
  })

  it('shows the error when the link cannot be made', async () => {
    call.mockRejectedValue(new Error('The game has ended'))
    render(<MarshalLive code="ABC234" view={organiser({ roster })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'New phone for Aina' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The game has ended')
    expect(screen.queryByRole('button', { name: 'Send link' })).toBeNull()
  })
})

describe('MarshalLive after the game', () => {
  const results = {
    winner: 'chasers' as const,
    survivors: [],
    longestSurvivor: { id: 'r1', ms: 25 * 60_000 },
    mostCatches: { id: 'c1', count: 2 },
    jailbreakHero: null,
  }
  const roster = [
    { id: 'r1', name: 'Aina', role: 'runner' as const, tag_id: 7, jailed: true },
    { id: 'c1', name: 'Ben', role: 'chaser' as const, tag_id: null, jailed: false },
  ]

  it('shows the winner and awards, with the marshal tools and After game tab still in reach', () => {
    render(<MarshalLive code="ABC234" view={marshal({ phase: 'ended', results, roster })} refresh={refresh} />)
    expect(screen.getByText('Game over')).toBeInTheDocument()
    expect(screen.getByText('Kejar win.')).toBeInTheDocument()
    expect(screen.getByText('Aina · 25:00')).toBeInTheDocument()
    expect(screen.getByText('Ben · 2')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /after game/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Play again' })).toBeNull()
  })

  it('gives the organiser Play again', () => {
    render(<MarshalLive code="ABC234" view={organiser({ phase: 'ended', results, roster })} refresh={refresh} />)
    expect(screen.getByRole('link', { name: 'Play again' })).toHaveAttribute('href', '/host/new')
  })

  it('shows no results while the game is still on', () => {
    render(<MarshalLive code="ABC234" view={organiser({ results, roster })} refresh={refresh} />)
    expect(screen.queryByText('Game over')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Play again' })).toBeNull()
  })
})

describe('MarshalLive: a rescue at Penjara (rules §9a)', () => {
  it('shows the marshal who is breaking them out, counting down', () => {
    render(<MarshalLive code="ABC234" view={marshal({ rescue: { by: 'r3', byName: 'Hafiz', endsAt: 107_000, joiners: [] } })} refresh={refresh} />)
    expect(screen.getByRole('status', { name: 'Rescue' })).toHaveTextContent('Hafiz is breaking you out · 7 s')
  })
  it('shows nothing with no rescue going', () => {
    render(<MarshalLive code="ABC234" view={marshal()} refresh={refresh} />)
    expect(screen.queryByText(/breaking you out/)).toBeNull()
  })
})
