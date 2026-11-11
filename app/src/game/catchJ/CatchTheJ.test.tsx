import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

import CatchTheJ from './CatchTheJ'
import { stageGeometry } from './physics'

const g = stageGeometry(290, 430)
let frames: FrameRequestCallback[] = []
let clock = 0

/** Run animation frames 16ms apart until `ms` have passed. */
function advance(ms: number) {
  act(() => {
    for (let t = 0; t < ms; t += 16) {
      clock += 16
      const run = frames
      frames = []
      run.forEach((f) => f(clock))
    }
  })
}

const jPos = () => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) rotate\(([-\d.]+)deg\)/.exec(screen.getByTestId('toy-j').style.transform)
  return m ? m.slice(1).map(Number) : null
}

beforeEach(() => {
  reduce.on = false
  frames = []
  clock = 0
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (frames.push(f), frames.length))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 290, height: 430, top: 0, left: 0, right: 290, bottom: 430, x: 0, y: 0, toJSON: () => ({}) })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const home = { x: g.home.x, y: g.home.y, vx: 0, vy: 0 }

describe('CatchTheJ', () => {
  it('renders the logo letters and the j', () => {
    render(<CatchTheJ />)
    expect(screen.getByRole('img', { name: 'kejar.' })).toBeInTheDocument()
    expect(screen.getByTestId('toy-j')).toBeInTheDocument()
  })

  it('moves and spins the j on each frame', () => {
    render(<CatchTheJ />)
    advance(16)
    const a = jPos()!
    advance(160)
    const b = jPos()!
    expect(b[0]).not.toBe(a[0])
    expect(b[2]).not.toBe(a[2])
  })

  it('a tap with the j at home catches and shows a sticker', () => {
    render(<CatchTheJ testStart={home} />)
    fireEvent.pointerDown(screen.getByTestId('toy'))
    expect(screen.getByTestId('toy-sticker')).toBeInTheDocument()
    expect(screen.getByTestId('toy-j')).toHaveClass('hide')
  })

  it('the j comes back after 500ms', () => {
    render(<CatchTheJ testStart={home} />)
    fireEvent.pointerDown(screen.getByTestId('toy'))
    advance(520)
    expect(screen.queryByTestId('toy-sticker')).toBeNull()
    expect(screen.getByTestId('toy-j')).not.toHaveClass('hide')
  })

  it('a tap 15px from home does nothing', () => {
    render(<CatchTheJ testStart={{ ...home, x: g.home.x + 15 }} />)
    fireEvent.pointerDown(screen.getByTestId('toy'))
    expect(screen.queryByTestId('toy-sticker')).toBeNull()
  })

  it('tapping again during the beat shows no second sticker', () => {
    render(<CatchTheJ testStart={home} />)
    fireEvent.pointerDown(screen.getByTestId('toy'))
    const kind = screen.getByTestId('toy-sticker').dataset.kind
    advance(100)
    fireEvent.pointerDown(screen.getByTestId('toy'))
    expect(screen.getAllByTestId('toy-sticker')).toHaveLength(1)
    expect(screen.getByTestId('toy-sticker').dataset.kind).toBe(kind)
  })

  it('two catches in a row never show the same sticker', () => {
    const { rerender } = render(<CatchTheJ rand={() => 0} testStart={home} />)
    fireEvent.pointerDown(screen.getByTestId('toy'))
    const first = screen.getByTestId('toy-sticker').dataset.kind
    advance(520)
    rerender(<CatchTheJ rand={() => 0} testStart={{ ...home }} />)
    fireEvent.pointerDown(screen.getByTestId('toy'))
    expect(screen.getByTestId('toy-sticker').dataset.kind).not.toBe(first)
  })

  it('reduced motion leaves the j home and upright, and taps do nothing', () => {
    reduce.on = true
    render(<CatchTheJ />)
    advance(200)
    const [x, y, rot] = jPos()!
    expect(x).toBeCloseTo(g.home.x)
    expect(y).toBeCloseTo(g.home.y)
    expect(rot).toBe(0)
    fireEvent.pointerDown(screen.getByTestId('toy'))
    expect(screen.queryByTestId('toy-sticker')).toBeNull()
  })

  it('paused does not move the j', () => {
    render(<CatchTheJ paused />)
    advance(16)
    const a = jPos()
    advance(200)
    expect(jPos()).toEqual(a)
  })
})
