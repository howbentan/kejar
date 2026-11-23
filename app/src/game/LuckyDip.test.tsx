import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

import LuckyDip, { CLAIM_STAMP_MS, dipFor, FLIP_MS, PICK_MS, REVEAL_HOLD_MS, SPARKLES } from './LuckyDip'
import { stashMessage } from './PowerUpHand'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  reduce.on = false
})

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
/** Lets the pick's answer come back. */
const settle = () => act(async () => {})

const BACKS = ['common', 'rare', 'epic', 'common', 'rare'] as const

function dip(kind: string = 'shield', onDone = vi.fn()) {
  const onPick = vi.fn(async () => ({ kind: kind as never }))
  const utils = render(<LuckyDip deal={{ id: 'u1', backs: [...BACKS] }} station={3} deckLeft={7} onPick={onPick} onDone={onDone} />)
  return { onDone, onPick, ...utils }
}

describe('LuckyDip', () => {
  it('stamps the claim first, then fans five face-down cards in their rarity colours', () => {
    dip()
    expect(screen.getByText('CLAIMED · Station 3 ✓')).toBeInTheDocument()
    expect(screen.getByText('CLAIMED · Station 3 ✓')).toHaveClass('stamp-small')
    expect(screen.getByText('DECK · 7 LEFT')).toBeInTheDocument()
    expect(screen.queryAllByLabelText(/face-down/i)).toHaveLength(0)
    wait(CLAIM_STAMP_MS)
    const backs = screen.getAllByLabelText(/face-down/i)
    expect(backs).toHaveLength(5)
    expect(backs.map((b) => [...b.classList].find((c) => c.startsWith('r-')))).toEqual(['r-common', 'r-rare', 'r-epic', 'r-common', 'r-rare'])
    expect(screen.getByText('Pick a card')).toBeInTheDocument()
  })

  it('tapping a card asks the server for that card, then reveals it', async () => {
    const { onPick } = dip()
    wait(CLAIM_STAMP_MS)
    fireEvent.click(screen.getByRole('button', { name: 'Pick card 2' }))
    expect(onPick).toHaveBeenCalledWith(1)
    await settle()
    expect(screen.getByText('Got Durian!')).toBeInTheDocument()
    expect(screen.getByText('Durian').closest('.power-card')).toHaveClass('big')
  })

  it('with no tap, the deck picks one after 10 s, says so, and there is no spotlight', async () => {
    const { onPick, container } = dip()
    wait(CLAIM_STAMP_MS)
    expect(PICK_MS).toBe(10_000)
    wait(PICK_MS)
    expect(onPick).toHaveBeenCalledTimes(1)
    await settle()
    expect(screen.getByText('Got Durian!')).toBeInTheDocument()
    expect(screen.getByText('too slow, the deck picked for you')).toBeInTheDocument()
    expect(container.querySelector('.dip-spotlight')).toBeNull()
  })

  it('a Sike shows the empty card, and says the scan is used', async () => {
    dip('sike')
    wait(CLAIM_STAMP_MS)
    fireEvent.click(screen.getByRole('button', { name: 'Pick card 3' }))
    await settle()
    expect(screen.getByText('Sike!')).toBeInTheDocument()
    expect(screen.getByText('your scan is used, station locks 60s')).toBeInTheDocument()
    expect(document.querySelector('.power-card.sike')).not.toBeNull()
  })

  it('a flick upwards picks the card', async () => {
    const { onPick } = dip()
    wait(CLAIM_STAMP_MS)
    const card = screen.getByRole('button', { name: 'Pick card 4' })
    fireEvent.pointerDown(card, { clientY: 300 })
    fireEvent.pointerUp(card, { clientY: 250 })
    expect(onPick).toHaveBeenCalledWith(3)
    await settle()
    expect(screen.getByText('Got Durian!')).toBeInTheDocument()
  })

  it('the reveal celebrates: a shockwave, sparkles, and a loud marker', async () => {
    const { container } = dip()
    wait(CLAIM_STAMP_MS)
    fireEvent.click(screen.getByRole('button', { name: 'Pick card 2' }))
    await settle()
    expect(container.querySelector('.shock')).not.toBeNull()
    expect(container.querySelectorAll('.spark')).toHaveLength(SPARKLES)
    wait(FLIP_MS)
    expect(container.querySelectorAll('svg.marker path')).toHaveLength(8)
  })

  it('finishes after the reveal', async () => {
    const { onDone } = dip()
    wait(CLAIM_STAMP_MS)
    fireEvent.click(screen.getByRole('button', { name: 'Pick card 1' }))
    await settle()
    wait(REVEAL_HOLD_MS - 1)
    expect(onDone).not.toHaveBeenCalled()
    wait(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('works the same with reduced motion', async () => {
    reduce.on = true
    const { onDone } = dip()
    wait(CLAIM_STAMP_MS)
    wait(PICK_MS)
    await settle()
    expect(screen.getByText('Got Durian!')).toBeInTheDocument()
    wait(REVEAL_HOLD_MS)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('Legendary claims and their lines', () => {
  it('a legendary only gets its moment from a slip: off any other QR there is no dip', () => {
    for (const kind of ['dato', 'ring', 'bomoh', 'hijau'] as const) expect(dipFor('KEJAR:STATION:1', { ok: true, kind }, 5, () => {})).toBeNull()
  })

  it('a refused slip scan is a calm line with no moment', () => {
    expect(dipFor('KEJAR:SLIP:x', { ok: false, reason: 'too-far' }, 5, () => {})).toBeNull()
  })

  it("refusals never say what it is or call it a station", () => {
    const cases = [
      ['too-far', 'Get closer.'],
      ['no-stash', 'Nothing here.'],
      ['cannot-claim', 'Nothing here.'],
      ['not-chasing', 'Nothing here.'],
      ['hand-full', 'Use or lose your power-up first'],
      ['paused', 'Game is paused'],
      // A disqualified player's scan must not hint that the card is a power-up.
      ['disqualified', 'Nothing here.'],
    ] as const
    for (const [reason, text] of cases) {
      const line = stashMessage({ ok: false, reason } as never)
      expect(line).toBe(text)
      expect(line).not.toMatch(/station|dato|legend/i)
    }
  })

  it('a frozen chaser scanning the stash is told how long to wait', () => {
    expect(stashMessage({ ok: false, reason: 'frozen', frozenForMs: 134_000 } as never)).toBe('Brain freeze! Wait 2:14.')
  })

  it('the private claim lines for Super Ring and Mak Kau Hijau', () => {
    expect(stashMessage({ ok: true, kind: 'ring' })).toBe("Super Ring! Next time you'd go to Penjara, it's house arrest instead.")
    expect(stashMessage({ ok: true, kind: 'hijau' })).toBe('Mak kau hijau! Dikejar have 20 s.')
  })
})
