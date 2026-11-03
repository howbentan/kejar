import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from '../../shared/alerts.js'
import { testView } from '../screens/testView'

const call = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ call, ApiError: class extends Error {} }))
const subscribe = vi.hoisted(() => vi.fn())
vi.mock('../spike/push', () => ({
  subscribe,
  pushSupport: () => 'ok',
  currentPushEnv: () => ({}),
  NotificationsDeniedError: class extends Error {},
}))

import MarshalTools from './MarshalTools'

const alert = (id: string, kind: Alert['kind'], text: string, handled = false, targetId: string | null = null): Alert => ({
  id,
  at: new Date(100_000 - 60_000).toISOString(),
  kind,
  text,
  where: null,
  targetId,
  handled,
  respondingName: null,
  outcome: null,
  closedByName: null,
})

const roster = [
  { id: 'r1', name: 'Aina', role: 'runner' as const, tag_id: 7, jailed: false },
  { id: 'c1', name: 'Ben', role: 'chaser' as const, tag_id: null, jailed: false },
]

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

describe('MarshalTools', () => {
  it('Pause calls pause with the organiser key and then refreshes', async () => {
    render(<MarshalTools code="ABC234" view={testView()} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause game' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('pause', { code: 'ABC234', organiserToken: 'h1' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows Resume when paused', async () => {
    render(<MarshalTools code="ABC234" view={testView({ paused: true })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume game' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('resume', { code: 'ABC234', organiserToken: 'h1' }))
  })

  it('Handled calls handleAlert with the event id', async () => {
    render(<MarshalTools code="ABC234" view={testView({ alerts: [alert('e1', 'outside', 'Aina #07 left the play area')] })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Handled' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('handleAlert', { code: 'ABC234', organiserToken: 'h1', eventId: 'e1' }))
  })

  it('an open SOS has no Handled button (only the takeover closes it, with an outcome); Open SOS brings the takeover back', () => {
    const onOpenSos = vi.fn()
    const view = testView({ alerts: [alert('e1', 'sos', 'SOS from Aina #07'), alert('e2', 'outside', 'Aina #07 left the play area')] })
    render(<MarshalTools code="ABC234" view={view} refresh={refresh} onOpenSos={onOpenSos} />)
    const [sosRow, outsideRow] = screen.getAllByRole('listitem')
    expect(within(sosRow).queryByRole('button', { name: 'Handled' })).toBeNull()
    expect(within(outsideRow).getByRole('button', { name: 'Handled' })).toBeInTheDocument()
    fireEvent.click(within(sosRow).getByRole('button', { name: 'Open SOS' }))
    expect(onOpenSos).toHaveBeenCalledWith('e1')
    expect(call).not.toHaveBeenCalled()
  })

  it('a closed SOS has no Open SOS button', () => {
    render(<MarshalTools code="ABC234" view={testView({ alerts: [alert('e1', 'sos', 'SOS from Aina #07', true)] })} refresh={refresh} onOpenSos={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Open SOS' })).toBeNull()
  })

  it('an open auto-jail alert offers Phone problem: undo and It stands', async () => {
    const a = alert('e5', 'auto-jail', 'Hafiz #03 missed 2 check-ins — sent to Penjara', false, 'r2')
    render(<MarshalTools code="ABC234" view={testView({ alerts: [a] })} refresh={refresh} />)
    expect(screen.queryByRole('button', { name: 'Handled' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Phone problem: undo' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('undoAutoJail', { code: 'ABC234', organiserToken: 'h1', eventId: 'e5' }))
    fireEvent.click(screen.getByRole('button', { name: 'It stands' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('handleAlert', { code: 'ABC234', organiserToken: 'h1', eventId: 'e5' }))
  })

  it('a handled auto-jail alert has no buttons', () => {
    const a = alert('e5', 'auto-jail', 'Hafiz #03 missed 2 check-ins — sent to Penjara', true, 'r2')
    render(<MarshalTools code="ABC234" view={testView({ alerts: [a] })} refresh={refresh} />)
    expect(screen.queryByRole('button', { name: 'Phone problem: undo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'It stands' })).toBeNull()
  })

  it('shows who caught a jailed runner and when, not just "in Penjara"', () => {
    const caughtRoster = [
      { id: 'r1', name: 'Aina', role: 'runner' as const, tag_id: 7, jailed: true, caught_by: 'Ben', caught_at: new Date(100_000 - 120_000).toISOString() },
    ]
    render(<MarshalTools code="ABC234" view={testView({ roster: caughtRoster })} refresh={refresh} />)
    expect(screen.getByText('PENJARA')).toBeInTheDocument()
    expect(screen.getByText('caught by Ben · 2 min ago')).toBeInTheDocument()
  })

  it('shows auto-jail distinctly from a chaser catch, with no caught-by name', () => {
    const autoRoster = [{ id: 'r1', name: 'Aina', role: 'runner' as const, tag_id: 7, jailed: true, caught_by: null }]
    render(<MarshalTools code="ABC234" view={testView({ roster: autoRoster })} refresh={refresh} />)
    expect(screen.getByText('PENJARA · AUTO')).toBeInTheDocument()
    expect(screen.getByText('2 missed check-ins')).toBeInTheDocument()
    expect(screen.queryByText(/caught by/)).toBeNull()
  })

  it('flags a jailed runner who has already used their one escape', () => {
    const freedRoster = [{ id: 'r1', name: 'Aina', role: 'runner' as const, tag_id: 7, jailed: true, caught_by: 'Ben', freed_once: true }]
    render(<MarshalTools code="ABC234" view={testView({ roster: freedRoster })} refresh={refresh} />)
    expect(screen.getByText('Already escaped once')).toBeInTheDocument()
  })

  it('shows nothing in the status column for a free player', () => {
    render(<MarshalTools code="ABC234" view={testView({ roster })} refresh={refresh} />)
    expect(screen.queryByText('PENJARA')).toBeNull()
    expect(screen.queryByText('PENJARA · AUTO')).toBeNull()
  })

  it('Remove needs confirming before it calls removePlayer', async () => {
    render(<MarshalTools code="ABC234" view={testView({ roster })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Aina' }))
    expect(call).not.toHaveBeenCalled()
    expect(screen.getByText('Remove Aina from the game?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('removePlayer', { code: 'ABC234', organiserToken: 'h1', playerId: 'r1' }))
  })

  it('open alerts come before handled ones, and handled ones have no button', () => {
    const view = testView({
      alerts: [alert('e1', 'outside', 'Aina #07 left the play area'), alert('e0', 'sos', 'SOS from Ben', true)],
    })
    render(<MarshalTools code="ABC234" view={view} refresh={refresh} />)
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toContain('Aina #07 left the play area')
    expect(rows[1]).toContain('SOS from Ben')
    expect(screen.getAllByRole('button', { name: 'Handled' })).toHaveLength(1)
  })

  it('a closed alert says who closed it, after the outcome', () => {
    const closedSos = { ...alert('e1', 'sos', 'SOS from Aina #07', true), outcome: 'first-aid', closedByName: 'Siti' }
    const closedOutside = { ...alert('e2', 'outside', 'Aina #07 left the play area', true), closedByName: 'Owner' }
    render(<MarshalTools code="ABC234" view={testView({ alerts: [closedSos, closedOutside] })} refresh={refresh} />)
    expect(screen.getByText('first-aid · closed by Siti')).toBeInTheDocument()
    expect(screen.getByText('closed by Owner')).toBeInTheDocument()
  })

  it('buzzes when a new SOS arrives', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    const { rerender } = render(<MarshalTools code="ABC234" view={testView()} refresh={refresh} />)
    expect(vibrate).not.toHaveBeenCalled()
    rerender(<MarshalTools code="ABC234" view={testView({ alerts: [alert('e1', 'sos', 'SOS from Aina')] })} refresh={refresh} />)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('pins open SOS alerts atop the Live tab, lime, with who is going', () => {
    const sos = alert('e1', 'sos', 'SOS from Aina #07')
    const outsideAlert = alert('e2', 'outside', 'Aina #07 left the play area')
    render(<MarshalTools code="ABC234" view={testView({ alerts: [sos, outsideAlert] })} refresh={refresh} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent(/sos/i)
    expect(rows[0]).toHaveTextContent(/nobody's going yet/i)
    expect(rows[0].className).toContain('alert-sos')
  })

  it("shows who's responding to an open SOS, same copy as the SOS takeover", () => {
    const sos = { ...alert('e1', 'sos', 'SOS from Aina #07'), respondingName: 'Hafiz' }
    render(<MarshalTools code="ABC234" view={testView({ alerts: [sos] })} refresh={refresh} />)
    expect(screen.getByText("Hafiz IS GOING")).toBeInTheDocument()
  })

  it('groups other open alerts under a Needs a look heading', () => {
    const outsideAlert = alert('e2', 'outside', 'Aina #07 left the play area')
    render(<MarshalTools code="ABC234" view={testView({ alerts: [outsideAlert] })} refresh={refresh} />)
    expect(screen.getByText(/needs a look/i)).toBeInTheDocument()
  })

  it('closed alerts fade under a Closed heading with their outcome', () => {
    const closedSos = { ...alert('e1', 'sos', 'SOS from Aina #07', true), outcome: 'sorted' }
    render(<MarshalTools code="ABC234" view={testView({ alerts: [closedSos] })} refresh={refresh} />)
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('sorted')).toBeInTheDocument()
    const row = screen.getByRole('listitem')
    expect(row.className).toContain('alert-handled')
  })

  it('switches to an After game tab with its own tabpanel', () => {
    render(<MarshalTools code="ABC234" view={testView()} refresh={refresh} />)
    expect(screen.getByRole('tab', { name: /live/i })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: /after game/i }))
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /after game/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('says there are no reports yet when the After game tab is empty', () => {
    render(<MarshalTools code="ABC234" view={testView()} refresh={refresh} />)
    fireEvent.click(screen.getByRole('tab', { name: /after game/i }))
    expect(screen.getByText('No reports yet.')).toBeInTheDocument()
  })

  it('shows post-game ratings and reports in the After game tab', () => {
    const view = testView({
      ratings: [{ id: 'rt1', at: new Date(100_000 - 60_000).toISOString(), name: 'Aina #07', rating: 4, note: 'fun!' }],
      reports: [
        { id: 'rp1', at: new Date(100_000 - 30_000).toISOString(), name: 'Aina #07', targetName: 'Ben', reason: 'dispute', note: 'after the fact' },
      ],
    })
    render(<MarshalTools code="ABC234" view={view} refresh={refresh} />)
    fireEvent.click(screen.getByRole('tab', { name: /after game/i }))
    expect(screen.getByText('How fun was it?')).toBeInTheDocument()
    expect(screen.getByText('4/5 · 1 min ago')).toBeInTheDocument()
    expect(screen.getByText('Aina #07: fun!')).toBeInTheDocument()
    expect(screen.getByText('Catch dispute · now')).toBeInTheDocument()
    expect(screen.getByText('Aina #07 reported Ben: after the fact')).toBeInTheDocument()
  })

  it('offers SOS alerts on this phone until they are on', async () => {
    subscribe.mockResolvedValue({ endpoint: 'https://push/x' })
    const { rerender } = render(<MarshalTools code="ABC234" view={testView()} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get SOS alerts on this phone' }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('subscribe', { code: 'ABC234', organiserToken: 'h1', subscription: { endpoint: 'https://push/x' } }),
    )
    const base = testView()
    rerender(<MarshalTools code="ABC234" view={testView({ me: { ...base.me, push: { endpoint: 'https://push/x' } } })} refresh={refresh} />)
    expect(screen.queryByRole('button', { name: 'Get SOS alerts on this phone' })).toBeNull()
  })
})
