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
    fireEvent.click(screen.getByRole('button', { name: /decoy/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Use Decoy' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('usePowerup', { code: 'ABC234', token: 't1', powerupId: 'u1' }))
    expect(await screen.findByText('Decoy set for the next ping')).toBeInTheDocument()
  })

  it('shows when a shield is up', () => {
    render(<PowerUpHand code="ABC234" view={testView({ shieldActive: true })} />)
    expect(screen.getByText('Shield active')).toBeInTheDocument()
  })

  it('offers a station scan button', () => {
    render(<PowerUpHand code="ABC234" view={testView()} />)
    expect(screen.getByRole('button', { name: /scan station/i })).toBeInTheDocument()
  })
})

describe('claimMessage', () => {
  it('maps each claim result to plain words', () => {
    expect(claimMessage({ ok: true, kind: 'decoy' })).toBe('Got DECOY ✓')
    expect(claimMessage({ ok: false, reason: 'too-far' })).toBe('Get within 30 m of the station')
    expect(claimMessage({ ok: false, reason: 'already-claimed' })).toBe("You've already used this station")
    expect(claimMessage({ ok: false, reason: 'locked', lockedForMs: 40_000 })).toBe('Station recharging — 0:40')
    expect(claimMessage({ ok: false, reason: 'hand-full' })).toBe('Your hand is full (3)')
    expect(claimMessage({ ok: false, reason: 'unknown-station' })).toBe("That's not a station code")
  })
})
