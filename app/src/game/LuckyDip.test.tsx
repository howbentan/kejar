import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

import LuckyDip, { CLAIM_STAMP_MS, PICK_MS, REVEAL_HOLD_MS, SWEEP_MS } from './LuckyDip'

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
