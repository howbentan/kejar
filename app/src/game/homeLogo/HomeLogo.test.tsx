import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

// The letter images: tests decide when they have loaded (by default, at once).
const letters = vi.hoisted(() => ({ ready: () => Promise.resolve() }))
vi.mock('./letters', async (orig) => ({ ...(await orig<typeof import('./letters')>()), lettersReady: () => letters.ready() }))

import HomeLogo from './HomeLogo'
import { stageGeometry } from './geometry'

const g = stageGeometry(290, 430)
let frames: FrameRequestCallback[] = []
let clock = 1000

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

const x = () => Number(/translateX\(([-\d.]+)px\)/.exec(screen.getByTestId('hl-j').style.transform)?.[1])
const legL = () => (screen.getByTestId('hl-j').querySelector('.leg.l') as SVGElement).style.transform
const lift = () => Number(/translateY\(([-\d.]+)px\)/.exec((screen.getByTestId('hl-j').querySelector('.run') as SVGElement).style.transform)?.[1])

beforeEach(() => {
  reduce.on = false
  letters.ready = () => Promise.resolve()
  frames = []
  clock = 1000
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

describe('HomeLogo', () => {
  it('renders the logo and the j', () => {
    render(<HomeLogo mode="home" />)
    expect(screen.getByRole('img', { name: 'kejar.' })).toBeInTheDocument()
    expect(screen.getByTestId('hl-j')).toBeInTheDocument()
  })

  it('runs on the spot at home', () => {
    render(<HomeLogo mode="home" />)
    advance(300)
    expect(legL()).not.toBe('rotate(0deg)')
    expect(x()).toBe(0)
  })

  it('jumps on a tap, and a second tap in the air does nothing', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    render(<HomeLogo mode="home" />)
    advance(100)
    fireEvent.pointerDown(screen.getByTestId('hl'))
    advance(230)
    expect(lift()).toBeLessThan(-100)
    fireEvent.pointerDown(screen.getByTestId('hl'))
    expect(vibrate).toHaveBeenCalledTimes(1)
    advance(400)
    expect(lift()).toBeGreaterThan(-40)
  })

  it('with reduced motion it stands still and a tap does nothing', () => {
    reduce.on = true
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    render(<HomeLogo mode="home" />)
    advance(300)
    expect(legL()).toBe('rotate(0deg)')
    fireEvent.pointerDown(screen.getByTestId('hl'))
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('opening runs in from off the left edge and lands in its gap on a whole stride', async () => {
    const onArrived = vi.fn()
    render(<HomeLogo mode="opening" onArrived={onArrived} />)
    await act(async () => {}) // the letters report ready
    advance(16)
    expect(x()).toBeLessThan(-g.home.x)
    advance(1200)
    expect(x()).toBe(0)
    expect(legL()).toBe('rotate(0deg)')
    expect(onArrived).toHaveBeenCalledTimes(1)
  })

  it('opening waits off screen until the letters have loaded, then runs in', async () => {
    let loaded = () => {}
    letters.ready = () => new Promise<void>((r) => (loaded = r))
    const onArrived = vi.fn()
    render(<HomeLogo mode="opening" onArrived={onArrived} />)
    advance(600)
    expect(x()).toBeLessThan(-g.home.x)
    await act(async () => loaded())
    advance(1200)
    expect(x()).toBe(0)
    expect(onArrived).toHaveBeenCalledTimes(1)
  })

  it('leaving sprints off the right edge, then says so', () => {
    const onLeft = vi.fn()
    render(<HomeLogo mode="leaving" onLeft={onLeft} />)
    advance(900)
    expect(x()).toBeGreaterThan(g.stage.w - g.home.x)
    expect(onLeft).toHaveBeenCalledTimes(1)
  })

  it('without motion, opening and leaving finish at once', () => {
    reduce.on = true
    const onArrived = vi.fn()
    const onLeft = vi.fn()
    const { rerender } = render(<HomeLogo mode="opening" onArrived={onArrived} />)
    expect(onArrived).toHaveBeenCalledTimes(1)
    rerender(<HomeLogo mode="leaving" onLeft={onLeft} />)
    expect(onLeft).toHaveBeenCalledTimes(1)
  })

  it('the opening and the run-off still finish if no frames ever arrive, so the buttons always show', () => {
    // Only timeouts are faked: animation frames stay with the stub above and never run here.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const onArrived = vi.fn()
      const onLeft = vi.fn()
      const { rerender } = render(<HomeLogo mode="opening" onArrived={onArrived} />)
      act(() => void vi.advanceTimersByTime(3300))
      expect(onArrived).toHaveBeenCalledTimes(1)
      expect(x()).toBe(0)
      rerender(<HomeLogo mode="leaving" onLeft={onLeft} />)
      act(() => void vi.advanceTimersByTime(1600))
      expect(onLeft).toHaveBeenCalledTimes(1)
      advance(1200)
      expect(onArrived).toHaveBeenCalledTimes(1)
      expect(onLeft).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a caption under the logo', () => {
    render(<HomeLogo mode="loading" caption="LOADING GAME ABC234" />)
    expect(screen.getByText('LOADING GAME ABC234')).toBeInTheDocument()
  })

  it('inverted draws it in black, for the lime opening screen', () => {
    render(<HomeLogo mode="opening" inverted />)
    expect(screen.getByTestId('hl')).toHaveClass('inverted')
  })
})
