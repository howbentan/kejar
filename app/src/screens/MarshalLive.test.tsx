import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from '../../shared/alerts.js'
import type { View } from '../../shared/views.js'
import { testView } from './testView'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
// jsdom has no matchMedia, which the marshal alerts card checks.
vi.mock('../spike/push', () => ({
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
