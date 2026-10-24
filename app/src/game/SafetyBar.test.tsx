import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testView } from '../screens/testView'

const call = vi.hoisted(() => vi.fn())
const coords = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('./here', () => ({ currentCoords: coords }))

import SafetyBar from './SafetyBar'

const view = testView({
  reportable: [
    { id: 'c1', name: 'Ben' },
    { id: 'r2', name: 'Hafiz' },
  ],
})

beforeEach(() => {
  call.mockReset()
  call.mockResolvedValue({ ok: true })
  coords.mockReset()
  coords.mockResolvedValue({ lat: 3.1, lng: 101.2, accuracy_m: 9 })
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('SafetyBar', () => {
  it("SOS asks to confirm, then sends sos with the phone's coordinates and shows Marshals alerted", async () => {
    render(<SafetyBar code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'SOS' }))
    expect(call).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Send SOS' }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('sos', { code: 'ABC234', token: 't1', lat: 3.1, lng: 101.2, accuracy_m: 9 }),
    )
    expect(await screen.findByText('Marshals alerted')).toBeInTheDocument()
  })

  it('SOS still sends when location is unavailable', async () => {
    coords.mockResolvedValue({})
    render(<SafetyBar code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'SOS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send SOS' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('sos', { code: 'ABC234', token: 't1' }))
  })

  it('Report sends target, reason and note', async () => {
    render(<SafetyBar code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Reason: Catch dispute' }))
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'tag was already off' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('report', {
        code: 'ABC234',
        token: 't1',
        targetId: 'c1',
        reason: 'dispute',
        note: 'tag was already off',
        lat: 3.1,
        lng: 101.2,
        accuracy_m: 9,
      }),
    )
    expect(await screen.findByText('Report sent')).toBeInTheDocument()
  })

  it('Report Send is disabled until a player is picked', () => {
    render(<SafetyBar code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled()
  })

  it('SOS waits at most 1.5 s for a location fix', async () => {
    render(<SafetyBar code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'SOS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send SOS' }))
    await waitFor(() => expect(call).toHaveBeenCalled())
    expect(coords).toHaveBeenCalledWith(1_500)
  })

  it('tells the player when no marshal could be reached', async () => {
    call.mockResolvedValue({ ok: true, notified: 0 })
    render(<SafetyBar code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'SOS' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send SOS' }))
    expect(await screen.findByText('SOS saved, but no marshal has alerts on. Find a marshal or call for help.')).toBeInTheDocument()
  })
})
