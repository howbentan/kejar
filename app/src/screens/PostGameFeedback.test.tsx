import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testView } from './testView'

const call = vi.hoisted(() => vi.fn())
const coords = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('../game/here', () => ({ currentCoords: coords }))

import PostGameFeedback from './PostGameFeedback'

const HERE = { lat: 3.1, lng: 101.2, accuracy_m: 9 }

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
  coords.mockResolvedValue(HERE)
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('PostGameFeedback', () => {
  it('shows How fun was it? and a Report a player link', () => {
    render(<PostGameFeedback code="ABC234" view={view} />)
    expect(screen.getByText('How fun was it?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Report a player' })).toBeInTheDocument()
  })

  it('submitting a rating stores it per player per game', async () => {
    render(<PostGameFeedback code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Thanks!')
    expect(call).toHaveBeenCalledWith('rate', { code: 'ABC234', token: 't1', rating: 4, note: '' })
  })

  it('sends the trimmed "what would you change" note along with the rating', async () => {
    render(<PostGameFeedback code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.change(screen.getByLabelText('What would you change? (optional)'), { target: { value: '  more time  ' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Thanks!')
    expect(call).toHaveBeenCalledWith('rate', { code: 'ABC234', token: 't1', rating: 2, note: 'more time' })
  })

  it('the rating Send button is disabled until a number is picked', () => {
    render(<PostGameFeedback code="ABC234" view={view} />)
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled()
  })

  it('shows an error and stays open when the rating fails to send', async () => {
    call.mockRejectedValue(new Error('offline'))
    render(<PostGameFeedback code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(await screen.findByText('offline')).toBeInTheDocument()
    expect(screen.queryByText('Thanks!')).toBeNull()
  })

  it('Report a player reveals the form; sending it calls report with the reason and coordinates', async () => {
    render(<PostGameFeedback code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a player' }))
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Reason: Catch dispute' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await screen.findByText('Report sent')
    expect(call).toHaveBeenCalledWith('report', { code: 'ABC234', token: 't1', targetId: 'c1', reason: 'dispute', note: '', ...HERE })
  })

  it('the report Send button is disabled until a player is picked', () => {
    render(<PostGameFeedback code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a player' }))
    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'c1' } })
    expect(screen.getByRole('button', { name: 'Send report' })).not.toBeDisabled()
  })

  it('Cancel on the report form hides it again without sending', () => {
    render(<PostGameFeedback code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a player' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(call).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Report a player' })).toBeInTheDocument()
  })

  it('rating and reporting are independent: sending one leaves the other untouched', async () => {
    render(<PostGameFeedback code="ABC234" view={view} />)
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await screen.findByText('Thanks!')
    expect(screen.getByRole('button', { name: 'Report a player' })).toBeInTheDocument()
  })
})
