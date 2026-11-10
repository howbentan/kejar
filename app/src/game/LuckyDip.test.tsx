import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

import LuckyDip, { CLAIM_STAMP_MS, dipFor, FLIP_MS, LEGENDARY_HOLD_MS, PICK_MS, REVEAL_HOLD_MS, SPARKLES, SWEEP_MS } from './LuckyDip'
import { stashMessage } from './PowerUpHand'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  reduce.on = false
})

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

function dip(onDone = vi.fn()) {
  render(<LuckyDip kind="shield" station={3} deckLeft={7} onDone={onDone} />)
  return onDone
}

describe('LuckyDip', () => {
  it('stamps the claim first, then fans five face-down cards', () => {
    dip()
    expect(screen.getByText('CLAIMED · Station 3 ✓')).toBeInTheDocument()
    // The long claim stamp uses the small size, so it fits a 360 px phone.
    expect(screen.getByText('CLAIMED · Station 3 ✓')).toHaveClass('stamp-small')
    expect(screen.getByText('DECK · 7 LEFT')).toBeInTheDocument()
    expect(screen.queryAllByLabelText('Face-down card')).toHaveLength(0)
    wait(CLAIM_STAMP_MS)
    expect(screen.getAllByLabelText('Face-down card')).toHaveLength(5)
    expect(screen.getByText('Pick a card')).toBeInTheDocument()
  })

  it('tapping a card reveals the power-up, and only that one card is ever turned over', () => {
    dip()
    wait(CLAIM_STAMP_MS)
    fireEvent.click(screen.getByRole('button', { name: 'Pick card 2' }))
    expect(screen.getByText('Got Durian!')).toBeInTheDocument()
    expect(screen.getAllByText('Durian')).toHaveLength(1)
    // The revealed card is laid out big (not scaled up), so the marker can find its real edges.
    expect(screen.getByText('Durian').closest('.power-card')).toHaveClass('big')
    expect(screen.queryByText('Ponteng')).toBeNull()
  })

  it('with no tap, the spotlight picks one after the timer', () => {
    dip()
    wait(CLAIM_STAMP_MS)
    wait(PICK_MS)
    expect(screen.queryByText('Got Durian!')).toBeNull()
    wait(SWEEP_MS)
    expect(screen.getByText('Got Durian!')).toBeInTheDocument()
  })

  it('a flick upwards picks the card', () => {
    dip()
    wait(CLAIM_STAMP_MS)
    const card = screen.getByRole('button', { name: 'Pick card 4' })
    fireEvent.pointerDown(card, { clientY: 300 })
    fireEvent.pointerUp(card, { clientY: 250 })
    expect(screen.getByText('Got Durian!')).toBeInTheDocument()
  })

  it('the reveal celebrates: a shockwave, sparkles, and a loud marker', () => {
    const { container } = render(<LuckyDip kind="shield" station={3} deckLeft={7} onDone={() => {}} />)
    wait(CLAIM_STAMP_MS)
    fireEvent.click(screen.getByRole('button', { name: 'Pick card 2' }))
    expect(container.querySelector('.shock')).not.toBeNull()
    expect(container.querySelectorAll('.spark')).toHaveLength(SPARKLES)
    wait(FLIP_MS)
    // One loop, the stars, the burst and the arrow: four marks, each a sketchy double line.
    expect(container.querySelectorAll('svg.marker path')).toHaveLength(8)
  })

  it('finishes after the reveal', () => {
    const onDone = dip()
    wait(CLAIM_STAMP_MS)
    fireEvent.click(screen.getByRole('button', { name: 'Pick card 1' }))
    wait(REVEAL_HOLD_MS - 1)
    expect(onDone).not.toHaveBeenCalled()
    wait(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('works the same with reduced motion', () => {
    reduce.on = true
    const onDone = dip()
    wait(CLAIM_STAMP_MS)
    wait(PICK_MS)
    wait(SWEEP_MS)
    expect(screen.getByText('Got Durian!')).toBeInTheDocument()
    wait(REVEAL_HOLD_MS)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe("Dato Seri's reveal (motion design §7)", () => {
  it('a good stash scan skips the fan: one foil card, the yellow marker, then done', () => {
    const onDone = vi.fn()
    const { container } = render(<>{dipFor('KEJAR:DATO', { ok: true, kind: 'dato' }, 5, onDone)}</>)
    expect(screen.queryByText(/CLAIMED · Station/)).toBeNull()
    expect(screen.queryAllByLabelText('Face-down card')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Dato Seri.' })).toBeInTheDocument()
    expect(screen.getByText('Legendary. In Penjara, free yourself and up to two friends. Only one exists.')).toBeInTheDocument()
    expect(container.querySelector('.power-card.legendary')).not.toBeNull()
    wait(FLIP_MS)
    const paths = container.querySelectorAll('svg.marker path')
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) expect(p.getAttribute('stroke')).toBe('#FFD60A')
    wait(LEGENDARY_HOLD_MS)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('works with reduced motion too', () => {
    reduce.on = true
    const onDone = vi.fn()
    render(<>{dipFor('KEJAR:DATO', { ok: true, kind: 'dato' }, null, onDone)}</>)
    expect(screen.getByRole('heading', { name: 'Dato Seri.' })).toBeInTheDocument()
    wait(LEGENDARY_HOLD_MS)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('Bomoh has no dip or reveal, whichever QR it came from', () => {
    expect(dipFor('KEJAR:BOMOH:Pq7-abc', { ok: true, kind: 'bomoh' }, 5, () => {})).toBeNull()
    expect(dipFor('KEJAR:DATO:Pq7-abc', { ok: true, kind: 'bomoh' }, 5, () => {})).toBeNull()
  })

  it('a refused stash scan is a calm line with no moment', () => {
    expect(dipFor('KEJAR:DATO', { ok: false, reason: 'too-far' }, 5, () => {})).toBeNull()
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
})
