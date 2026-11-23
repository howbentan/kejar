import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

import { dipFor } from './LuckyDip'
import TupperwareTakeover, { FLIP_AT_MS, TAKEOVER_MS } from './TupperwareTakeover'

const vibrate = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vibrate.mockReset()
  reduce.on = false
})

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const root = (c: HTMLElement) => c.querySelector('.to') as HTMLElement

describe('the Tupperware unlock', () => {
  it('a good slip scan opens the takeover, for every legendary, before any other moment', () => {
    for (const kind of ['dato', 'ring', 'hijau', 'bomoh'] as const) {
      const { container } = render(<>{dipFor('KEJAR:SLIP:x', { ok: true, kind, slip: true }, 5, () => {})}</>)
      expect(root(container)).toHaveClass(`leg-${kind}`)
      // Not Dato Seri's stash reveal, even for Dato Seri.
      expect(screen.queryByRole('heading', { name: 'Dato Seri.' })).toBeNull()
      cleanup()
    }
  })

  it('a refused slip scan has no moment', () => {
    expect(dipFor('KEJAR:SLIP:x', { ok: false, reason: 'wrong' }, 5, () => {})).toBeNull()
  })

  it('the box, the face-down card in its colour, then the flip to its front; Keep it for a held legendary', () => {
    const onDone = vi.fn()
    const { container } = render(<>{dipFor('KEJAR:SLIP:x', { ok: true, kind: 'ring', slip: true }, 5, onDone)}</>)
    expect(screen.getByText('TUPPERWARE OPENED')).toBeInTheDocument()
    expect(container.querySelector('.to-tub .tw-lid.open')).not.toBeNull()
    expect(screen.getByLabelText('Face-down card')).toHaveClass('big')
    expect(container.querySelector('.face-front .power-card.legendary.ring')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Keep it' })).toBeNull()
    expect(root(container)).not.toHaveClass('to-end')
    wait(TAKEOVER_MS)
    expect(root(container)).toHaveClass('to-end')
    expect(screen.queryByText('Tap to skip')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("It's working! for the legendaries that work on claim", () => {
    for (const kind of ['hijau', 'bomoh'] as const) {
      const onDone = vi.fn()
      render(<TupperwareTakeover kind={kind} onDone={onDone} />)
      wait(TAKEOVER_MS)
      expect(screen.queryByRole('button', { name: 'Keep it' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: "It's working!" }))
      expect(onDone).toHaveBeenCalledTimes(1)
      cleanup()
    }
    render(<TupperwareTakeover kind="dato" onDone={() => {}} />)
    wait(TAKEOVER_MS)
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
  })

  it('a tap anywhere before the end jumps straight to the end state', () => {
    const onDone = vi.fn()
    const { container } = render(<TupperwareTakeover kind="hijau" onDone={onDone} />)
    wait(500)
    fireEvent.click(root(container))
    expect(root(container)).toHaveClass('to-end')
    expect(screen.getByRole('button', { name: "It's working!" })).toBeInTheDocument()
    // Skipping isn't claiming the button: the player still taps it.
    expect(onDone).not.toHaveBeenCalled()
  })

  it('Tap to skip is a button too, for a keyboard', () => {
    const { container } = render(<TupperwareTakeover kind="dato" onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tap to skip' }))
    expect(root(container)).toHaveClass('to-end')
  })

  it('buzzes once, at the flip', () => {
    render(<TupperwareTakeover kind="bomoh" onDone={() => {}} />)
    wait(FLIP_AT_MS - 1)
    expect(vibrate).not.toHaveBeenCalled()
    wait(1)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith([400, 80, 400])
    wait(TAKEOVER_MS)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('a skip before the flip still buzzes once, as the front shows', () => {
    const { container } = render(<TupperwareTakeover kind="ring" onDone={() => {}} />)
    fireEvent.click(root(container))
    expect(vibrate).toHaveBeenCalledTimes(1)
    wait(TAKEOVER_MS)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('reduced motion: no shake or flip, the front and the button show at once', () => {
    reduce.on = true
    const { container } = render(<TupperwareTakeover kind="bomoh" onDone={() => {}} />)
    expect(root(container)).toHaveClass('to-end')
    expect(container.querySelector('.face-front .power-card.legendary.bomoh')).not.toBeNull()
    expect(screen.getByRole('button', { name: "It's working!" })).toBeInTheDocument()
  })
})
