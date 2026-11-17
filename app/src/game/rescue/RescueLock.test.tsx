import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RescueLock from './RescueLock'
import PenjaraGate from './PenjaraGate'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

beforeEach(() => {
  reduce.on = false
})
afterEach(cleanup)

const svg = (c: HTMLElement) => c.querySelector('svg') as SVGSVGElement
const amp = (c: HTMLElement) => parseFloat((c.querySelector('.fl-shake') as SVGElement).style.getPropertyValue('--amp'))

describe('RescueLock', () => {
  it('shows 2 filled marks at 10 s', () => {
    const { container } = render(<RescueLock heldMs={10_000} mode="holding" />)
    expect(container.querySelectorAll('.fl-mark.on')).toHaveLength(2)
  })

  it('open carries the open class and fills every mark', () => {
    const { container } = render(<RescueLock heldMs={20_000} mode="open" />)
    expect(svg(container).classList.contains('open')).toBe(true)
    expect(container.querySelectorAll('.fl-mark.on')).toHaveLength(4)
  })

  it('shakes harder at 18 s than at 2 s', () => {
    const a = render(<RescueLock heldMs={2_000} mode="holding" />)
    const low = amp(a.container)
    cleanup()
    const b = render(<RescueLock heldMs={18_000} mode="holding" />)
    expect(amp(b.container)).toBeGreaterThan(low)
  })

  it('reduced motion: no shake variables and no burst', () => {
    reduce.on = true
    const { container } = render(<RescueLock heldMs={10_000} mode="holding" />)
    expect((container.querySelector('.fl-shake') as SVGElement).style.getPropertyValue('--amp')).toBe('')
    expect(container.querySelector('.fl-burst')).toBeNull()
  })

  it('a new click bursts when motion is allowed', () => {
    const { container } = render(<RescueLock heldMs={10_000} mode="holding" />)
    expect(container.querySelector('.fl-burst')).not.toBeNull()
  })

  it('snapped shows the broken key', () => {
    const { container } = render(<RescueLock heldMs={8_000} mode="snapped" />)
    expect(svg(container).classList.contains('snapped')).toBe(true)
    expect(container.querySelector('.fl-snap')).not.toBeNull()
  })
})

describe('PenjaraGate', () => {
  it.each(['open', 'locked', 'closed'] as const)('renders the %s state as a class', (state) => {
    const { container } = render(<PenjaraGate state={state} />)
    expect(svg(container).classList.contains(state)).toBe(true)
    expect(container.querySelectorAll('.pg-door-l, .pg-door-r')).toHaveLength(2)
  })
})
