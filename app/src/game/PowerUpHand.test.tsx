import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PowerUp } from '../../shared/types.js'
import { testView } from '../screens/testView'

const call = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('./Scanner', () => ({ default: () => null }))

import PowerUpHand, { claimMessage } from './PowerUpHand'

const decoy: PowerUp = {
  id: 'u1',
  game_id: 'g1',
  player_id: 'r1',
  kind: 'decoy',
  station: 1,
  claimed_at: '',
  used_at: null,
  consumed_at: null,
}

beforeEach(() => {
  call.mockReset()
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('PowerUpHand', () => {
  it('shows a card per power-up in hand and uses it after confirming', async () => {
    call.mockResolvedValue({ ok: true, kind: 'decoy' })
    render(<PowerUpHand code="ABC234" view={testView({ hand: [decoy] })} />)
    fireEvent.click(screen.getByRole('button', { name: /gostan/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Use Gostan' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('usePowerup', { code: 'ABC234', token: 't1', powerupId: 'u1' }))
    expect(await screen.findByText('Gostan set for your next ping')).toBeInTheDocument()
  })

  it('shows the Malaysian name and plain-English effect of each card', () => {
    const card = (kind: PowerUp['kind']) => ({ ...decoy, id: kind, kind })
    render(<PowerUpHand code="ABC234" view={testView({ hand: [card('shield'), card('cloak'), card('flare'), card('focus')] })} />)
    expect(screen.getByText('Durian')).toBeInTheDocument()
    expect(screen.getByText('Blocks the next catch, up to 10 min')).toBeInTheDocument()
    expect(screen.getByText('Ponteng')).toBeInTheDocument()
    expect(screen.getByText('You skip the next ping')).toBeInTheDocument()
    expect(screen.getByText('Mat Rempit')).toBeInTheDocument()
    expect(screen.getByText('Extra ping in 30 s')).toBeInTheDocument()
    expect(screen.getByText('Pak Guard')).toBeInTheDocument()
    expect(screen.getByText('Dikejar within 75 m show exactly')).toBeInTheDocument()
  })

  it('shows a power-up that is still working', () => {
    render(<PowerUpHand code="ABC234" view={testView({ activePowerUp: 'shield' })} />)
    expect(screen.getByText('Durian is working')).toBeInTheDocument()
  })

  it('shows how many cards are left in the deck', () => {
    render(<PowerUpHand code="ABC234" view={testView({ deckLeft: 4 })} />)
    expect(screen.getByText('DECK · 4 LEFT')).toBeInTheDocument()
  })

  it('says when Mat Rempit is ready if another is on its way', async () => {
    call.mockResolvedValue({ ok: false, reason: 'flare-pending', readyInMs: 210_000 })
    render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind: 'flare' }] })} />)
    fireEvent.click(screen.getByRole('button', { name: /mat rempit/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Use Mat Rempit' }))
    expect(await screen.findByText('Another Mat Rempit is already on its way. Ready again in 3:30.')).toBeInTheDocument()
  })

  it('explains a refused Mat Rempit', async () => {
    call.mockResolvedValue({ ok: false, reason: 'flare-cooldown', readyInMs: 133_000 })
    render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind: 'flare' }] })} />)
    fireEvent.click(screen.getByRole('button', { name: /mat rempit/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Use Mat Rempit' }))
    expect(await screen.findByText('Mat Rempit is ready again in 2:13.')).toBeInTheDocument()
  })

  it('is the slot only: an empty slot says so, and there is no scan button of its own', () => {
    render(<PowerUpHand code="ABC234" view={testView()} />)
    expect(screen.getByText(/empty slot/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /scan/i })).toBeNull()
  })
})

describe('claimMessage', () => {
  it('maps each claim result to plain words', () => {
    expect(claimMessage({ ok: true, kind: 'decoy' })).toBe('Got Gostan ✓')
    expect(claimMessage({ ok: false, reason: 'too-far' })).toBe('Get within 30 m of the station.')
    expect(claimMessage({ ok: false, reason: 'already-claimed' })).toBe("You've used this station this game. Try another one.")
    expect(claimMessage({ ok: false, reason: 'locked', lockedForMs: 40_000 })).toBe('This station is cooling down. Ready in 0:40.')
    expect(claimMessage({ ok: false, reason: 'hand-full', busyKind: 'shield', busyRunning: false })).toBe(
      'Your slot is full. Use your Durian first, then come back.',
    )
    expect(claimMessage({ ok: false, reason: 'hand-full', busyKind: 'shield', busyRunning: true })).toBe(
      "Your Durian is still working. Come back when it's done.",
    )
    expect(claimMessage({ ok: false, reason: 'unknown-station' })).toBe("That's not a station code")
  })
})
