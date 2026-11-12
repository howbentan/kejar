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
  sealed: false,
  taken_at: null, offer: null, twin_of: null, spot: null,
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

  it.each([
    ['toyol', 'Toyol'],
    ['along', 'Ah Long'],
  ] as const)('a %s with nothing to steal says you keep it', async (kind, name) => {
    call.mockResolvedValue({ ok: false, reason: 'nothing-to-steal' })
    render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind }] })} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: `Use ${name}` }))
    expect(await screen.findByText(`Nothing to steal. You keep your ${name}.`)).toBeInTheDocument()
  })

  it.each([
    ['toyol', 'Toyol', 'Toyol stole a power-up!'],
    ['along', 'Ah Long', 'Ah Long came to collect!'],
  ] as const)('a %s that steals shows its used line and nothing else', async (kind, name, line) => {
    call.mockResolvedValue({ ok: true, kind })
    render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind }] })} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: `Use ${name}` }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(new RegExp(`^${line}$`))
    expect(screen.queryByText(/durian/i)).toBeNull()
  })

  it('a card Toyol or Ah Long already took says so', async () => {
    call.mockResolvedValue({ ok: false, reason: 'taken' })
    render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind: 'shield' }] })} />)
    fireEvent.click(screen.getByRole('button', { name: /durian/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Use Durian' }))
    expect(await screen.findByText('Your Durian was taken.')).toBeInTheDocument()
  })

  it('a held Dato Seri has no Use: it says to use it at Penjara', () => {
    render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind: 'dato' }] })} />)
    expect(screen.queryByRole('button', { name: /dato seri/i })).toBeNull()
    expect(screen.getByText('Use it at Penjara')).toBeInTheDocument()
    expect(screen.getByText('★ LEGENDARY')).toBeInTheDocument()
    expect(call).not.toHaveBeenCalled()
  })

  describe('new deck cards', () => {
    const cheese: PowerUp = { ...decoy, id: 'ch1', kind: 'cheese' }
    const chasers = [{ id: 'c1', name: 'Ben' }, { id: 'c2', name: 'Aini' }]

    it('using Cheese Ais opens the picker and sends the chosen chaser', async () => {
      call.mockResolvedValue({ ok: true, kind: 'cheese', name: 'Aini' })
      render(<PowerUpHand code="ABC234" view={testView({ hand: [cheese], freezeTargets: chasers })} />)
      fireEvent.click(screen.getByRole('button', { name: /cheese ais/i }))
      expect(call).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Aini' }))
      await waitFor(() => expect(call).toHaveBeenCalledWith('usePowerup', { code: 'ABC234', token: 't1', powerupId: 'ch1', targetId: 'c2' }))
      expect(await screen.findByText('Cheese Ais! Aini is frozen for 3 minutes.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('no targets: the picker says so and sends nothing', () => {
      render(<PowerUpHand code="ABC234" view={testView({ hand: [cheese], freezeTargets: [] })} />)
      fireEvent.click(screen.getByRole('button', { name: /cheese ais/i }))
      expect(screen.getByText('No Kejar to freeze right now.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(call).not.toHaveBeenCalled()
    })

    it('cancelling the picker sends nothing', () => {
      render(<PowerUpHand code="ABC234" view={testView({ hand: [cheese], freezeTargets: chasers })} />)
      fireEvent.click(screen.getByRole('button', { name: /cheese ais/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(call).not.toHaveBeenCalled()
    })

    it('a doubled card shows one card with a x2 badge', () => {
      const a: PowerUp = { ...decoy, id: 'a', kind: 'shield' }
      const b: PowerUp = { ...decoy, id: 'b', kind: 'shield', twin_of: 'a' }
      render(<PowerUpHand code="ABC234" view={testView({ hand: [a, b] })} />)
      expect(screen.getAllByRole('button', { name: /durian/i })).toHaveLength(1)
      expect(screen.getByText('×2')).toBeInTheDocument()
    })

    it('two separate cards of one kind are not doubled', () => {
      render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, id: 'a' }, { ...decoy, id: 'b' }] })} />)
      expect(screen.queryByText('×2')).toBeNull()
    })

    it('COMBO READY shows when comboReady', () => {
      render(<PowerUpHand code="ABC234" view={testView({ hand: [decoy], comboReady: true })} />)
      expect(screen.getByText('COMBO READY')).toBeInTheDocument()
    })

    it('COMBO READY shows in an empty slot too, and not otherwise', () => {
      const { rerender } = render(<PowerUpHand code="ABC234" view={testView({ comboReady: true })} />)
      expect(screen.getByText('COMBO READY')).toBeInTheDocument()
      rerender(<PowerUpHand code="ABC234" view={testView()} />)
      expect(screen.queryByText('COMBO READY')).toBeNull()
    })

    it('FROZEN · 2:14 shows while frozen, and the card cannot be used', () => {
      const v = testView({ hand: [decoy], frozenUntil: 100_000 + 134_000 })
      render(<PowerUpHand code="ABC234" view={v} />)
      expect(screen.getByText('FROZEN · 2:14')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /gostan/i })).toBeDisabled()
    })

    it('FROZEN shows in an empty slot', () => {
      render(<PowerUpHand code="ABC234" view={testView({ frozenUntil: 100_000 + 134_000 })} />)
      expect(screen.getByText('FROZEN · 2:14')).toBeInTheDocument()
    })

    it.each([
      [{ ok: false, reason: 'frozen', frozenForMs: 134_000 }, 'Brain freeze! Wait 2:14.'],
      [{ ok: false, reason: 'no-target' }, "That Kejar can't be frozen right now."],
      [{ ok: false, reason: 'effect-running' }, 'Wait for your last one to finish first.'],
      [{ ok: false, reason: 'combo-ready' }, 'You already have a combo ready.'],
      [{ ok: false, reason: 'no-location' }, "Can't find you yet. Try again in a moment."],
    ])('a refused use (%j) is plain words', async (reply, text) => {
      call.mockResolvedValue(reply)
      render(<PowerUpHand code="ABC234" view={testView({ hand: [decoy] })} />)
      fireEvent.click(screen.getByRole('button', { name: /gostan/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Use Gostan' }))
      expect(await screen.findByText(text)).toBeInTheDocument()
    })

    it('Tuch and Ga shows its used line', async () => {
      call.mockResolvedValue({ ok: true, kind: 'toll' })
      render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind: 'toll' }] })} />)
      fireEvent.click(screen.getByRole('button', { name: /tuch and ga/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Use Tuch and Ga' }))
      expect(await screen.findByText('Tuch and Ga! Toll gate up. Runners checking in near it get charged.')).toBeInTheDocument()
    })

    it('claim messages: a doubled claim, and a frozen chaser at a station', () => {
      expect(claimMessage({ ok: true, kind: 'shield', double: true })).toBe('Combo! Durian x2.')
      expect(claimMessage({ ok: false, reason: 'frozen', frozenForMs: 65_000 })).toBe('Brain freeze! Wait 1:05.')
    })
  })

  describe('Abang Grab', () => {
    const grab: PowerUp = { ...decoy, id: 'g1', kind: 'grab' }
    const openGrab = async () => {
      fireEvent.click(screen.getByRole('button', { name: /abang grab/i }))
      fireEvent.click(screen.getByRole('button', { name: 'Use Abang Grab' }))
      return screen.findByRole('dialog', { name: 'What should Abang Grab bring?' })
    }

    it('Use opens the chooser with the 3 offered cards face up; a pick delivers one', async () => {
      call.mockImplementation(async (action: string) =>
        action === 'usePowerup' ? { ok: true, kind: 'grab', offer: ['shield', 'cloak', 'decoy'] } : { ok: true, kind: 'cloak', powerupId: 'u5' },
      )
      render(<PowerUpHand code="ABC234" view={testView({ hand: [grab] })} />)
      const dialog = await openGrab()
      expect(call).toHaveBeenCalledWith('usePowerup', { code: 'ABC234', token: 't1', powerupId: 'g1' })
      expect(dialog).toHaveTextContent('Keep one. The other two go to the bottom of the deck.')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveClass('grab')
      for (const n of ['Durian', 'Ponteng', 'Gostan']) expect(screen.getByRole('button', { name: `Keep ${n}` })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Keep Ponteng' }))
      await waitFor(() => expect(call).toHaveBeenCalledWith('grabPick', { code: 'ABC234', token: 't1', powerupId: 'g1', choice: 1 }))
      expect(await screen.findByText('Abang Grab brought Ponteng!')).toBeInTheDocument()
      expect(screen.getByText('The other two went to the bottom of the deck.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Keep Durian' })).toBeNull()
    })

    it('a pick that arrives doubled says so', async () => {
      call.mockImplementation(async (action: string) =>
        action === 'usePowerup' ? { ok: true, kind: 'grab', offer: ['shield', 'cloak', 'decoy'] } : { ok: true, kind: 'cloak', powerupId: 'u5', double: true },
      )
      render(<PowerUpHand code="ABC234" view={testView({ hand: [grab] })} />)
      await openGrab()
      fireEvent.click(screen.getByRole('button', { name: 'Keep Ponteng' }))
      expect(await screen.findByText('Abang Grab brought Ponteng! Combo x2.')).toBeInTheDocument()
    })

    it('reopens by itself when the app comes back with an open offer', () => {
      render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...grab, offer: ['focus', 'flare', 'shield'] }] })} />)
      expect(screen.getByRole('dialog', { name: 'What should Abang Grab bring?' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Keep Pak Guard' })).toBeInTheDocument()
    })

    it.each([
      ['taken', 'Your Abang Grab was taken.'],
      ['bad-choice', 'Pick one of the three cards'],
      ['already-used', 'Already used'],
    ])('a refused pick (%s) is plain words', async (reason, text) => {
      call.mockImplementation(async (action: string) =>
        action === 'usePowerup' ? { ok: true, kind: 'grab', offer: ['shield', 'cloak', 'decoy'] } : { ok: false, reason },
      )
      render(<PowerUpHand code="ABC234" view={testView({ hand: [grab] })} />)
      await openGrab()
      fireEvent.click(screen.getByRole('button', { name: 'Keep Durian' }))
      expect(await screen.findByText(text)).toBeInTheDocument()
    })
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

  it('a card in the slot shows its sticker and READY', () => {
    render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind: 'shield' }] })} />)
    expect(screen.getByRole('img', { name: 'Durian' })).toBeInTheDocument()
    expect(screen.getByText('READY')).toBeInTheDocument()
  })

  it('the Dato Seri slot is legendary with a foil; every other kind gets a plain slot', () => {
    const { rerender } = render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind: 'dato' }] })} />)
    expect(screen.getByText('Dato Seri').closest('.slot')).toHaveClass('legendary')
    expect(screen.getByTestId('foil')).toBeInTheDocument()
    rerender(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind: 'shield' }] })} />)
    expect(screen.getByRole('button', { name: /durian/i })).not.toHaveClass('legendary')
    expect(screen.queryByTestId('foil')).toBeNull()
  })

  it('a running Durian counts down; other effects wait for the next ping', () => {
    const { rerender } = render(<PowerUpHand code="ABC234" view={testView({ activePowerUp: 'shield', activeEndsAt: 100_000 + 582_000 })} />)
    expect(screen.getByText('Durian')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE · 9:42 LEFT')).toBeInTheDocument()
    rerender(<PowerUpHand code="ABC234" view={testView({ activePowerUp: 'cloak', activeEndsAt: null })} />)
    expect(screen.getByText('Ponteng')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE · UNTIL THE NEXT PING')).toBeInTheDocument()
  })

  it("Mat Rempit waits out the team cooldown, and can't be used until then", () => {
    render(<PowerUpHand code="ABC234" view={testView({ hand: [{ ...decoy, kind: 'flare' }], flareReadyAt: 100_000 + 134_000 })} />)
    expect(screen.getByText('COOLDOWN · 2:14')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mat rempit/i })).toBeDisabled()
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
    expect(screen.getByText('No power-up. Find a station and scan it.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /scan/i })).toBeNull()
  })
})

describe('claimMessage', () => {
  it('names the station when the scan said which one', () => {
    expect(claimMessage({ ok: false, reason: 'too-far' }, 3)).toBe('Get closer. You need to be within 30 m of Station 3.')
    expect(claimMessage({ ok: false, reason: 'already-claimed' }, 3)).toBe("You've used Station 3 this game. Try another one.")
    expect(claimMessage({ ok: false, reason: 'locked', lockedForMs: 42_000 }, 3)).toBe('Station 3 is cooling down. Ready in 0:42.')
  })
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
    // The hidden stash (rules doc §9): a full slot, without naming what's in it.
    expect(claimMessage({ ok: false, reason: 'hand-full' })).toBe('Use or lose your power-up first')
  })
})
