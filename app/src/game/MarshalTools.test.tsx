import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from '../../shared/alerts.js'
import { testView } from '../screens/testView'

const call = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ call, ApiError: class extends Error {} }))

import MarshalTools from './MarshalTools'

const alert = (id: string, kind: Alert['kind'], text: string, handled = false): Alert => ({
  id,
  at: new Date(100_000 - 60_000).toISOString(),
  kind,
  text,
  where: null,
  handled,
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
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ hostKey: 'h1' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('MarshalTools', () => {
  it('Pause calls pause with the organiser key and then refreshes', async () => {
    render(<MarshalTools code="ABC234" view={testView()} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause game' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('pause', { code: 'ABC234', hostKey: 'h1' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows Resume when paused', async () => {
    render(<MarshalTools code="ABC234" view={testView({ paused: true })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume game' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('resume', { code: 'ABC234', hostKey: 'h1' }))
  })

  it('Handled calls handleAlert with the event id', async () => {
    render(<MarshalTools code="ABC234" view={testView({ alerts: [alert('e1', 'sos', 'SOS from Aina #07')] })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Handled' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('handleAlert', { code: 'ABC234', hostKey: 'h1', eventId: 'e1' }))
  })

  it('Remove needs confirming before it calls removePlayer', async () => {
    render(<MarshalTools code="ABC234" view={testView({ roster })} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Aina' }))
    expect(call).not.toHaveBeenCalled()
    expect(screen.getByText('Remove Aina from the game?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('removePlayer', { code: 'ABC234', hostKey: 'h1', playerId: 'r1' }))
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

  it('buzzes when a new SOS arrives', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    const { rerender } = render(<MarshalTools code="ABC234" view={testView()} refresh={refresh} />)
    expect(vibrate).not.toHaveBeenCalled()
    rerender(<MarshalTools code="ABC234" view={testView({ alerts: [alert('e1', 'sos', 'SOS from Aina')] })} refresh={refresh} />)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})
