import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneId } from '../../../shared/howToPlay.js'
import Scene from './index'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

const IDS: SceneId[] = [
  'runner-free', 'checkin', 'miss-two', 'tag-ripped', 'break-out', 'runner-powerups', 'sos',
  'chaser-start', 'ping-circles', 'rip-scan', 'snapshot', 'stop-rescue', 'chaser-powerups',
]
const root = (c: HTMLElement) => c.querySelector('svg.kd-doodle') as SVGSVGElement

beforeEach(() => {
  reduce.on = false
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('doodle scenes', () => {
  it.each(IDS)('%s renders an svg with paths', (id) => {
    const { container } = render(<Scene id={id} />)
    expect(root(container)).toBeTruthy()
    expect(root(container).querySelectorAll('path, circle, rect').length).toBeGreaterThan(3)
  })

  it('puts the boil filter on the root svg, not an inner group', () => {
    const { container } = render(<Scene id="runner-free" />)
    const svg = root(container)
    const ref = svg.getAttribute('filter')
    expect(ref).toMatch(/^url\(#boil-/)
    expect(svg.querySelector('filter feTurbulence')).toBeTruthy()
    expect(svg.querySelector('filter feDisplacementMap')).toBeTruthy()
    expect(svg.querySelectorAll('g[filter]').length).toBe(0)
    expect(svg.querySelector(`filter#${ref!.slice(5, -1)}`)).toBeTruthy()
  })

  it('gives every drawn stroke a faint, offset twin', () => {
    const { container } = render(<Scene id="checkin" />)
    const shapes = [...root(container).querySelectorAll('.kd-s')]
    const ghosts = shapes.filter((s) => s.classList.contains('kd-ghost'))
    const mains = shapes.filter((s) => !s.classList.contains('kd-ghost') && !s.classList.contains('kd-fill'))
    expect(ghosts.length).toBe(mains.length)
    expect(ghosts.length).toBeGreaterThan(0)
    for (const g of ghosts) expect(g.getAttribute('transform')).toMatch(/translate\(-?[\d.]+ -?[\d.]+\)/)
    // fills (the vest, the SOS bar) are not doubled
    const { container: c2 } = render(<Scene id="chaser-start" />)
    expect(root(c2).querySelectorAll('.kd-fill:not(.kd-ghost)').length).toBeGreaterThan(0)
    expect(root(c2).querySelectorAll('.kd-fill.kd-ghost').length).toBe(0)
  })

  it('dresses Dikejar in a white armband and Kejar in a lime vest', () => {
    const runner = render(<Scene id="runner-free" />)
    expect(root(runner.container).querySelectorAll('.kd-band').length).toBeGreaterThan(0)
    expect(root(runner.container).querySelectorAll('path.kd-fill').length).toBe(0)
    cleanup()
    const chaser = render(<Scene id="chaser-start" />)
    expect(root(chaser.container).querySelectorAll('path.kd-fill').length).toBeGreaterThan(0)
    expect(root(chaser.container).querySelectorAll('.kd-band').length).toBe(0)
  })

  it('draws on and re-seeds the boil every 140 ms', () => {
    const { container } = render(<Scene id="runner-free" />)
    expect(container.querySelectorAll('.kd-draw').length).toBeGreaterThan(0)
    const turb = container.querySelector('feTurbulence')!
    expect(turb.getAttribute('seed')).toBe('1')
    act(() => { vi.advanceTimersByTime(140) })
    expect(turb.getAttribute('seed')).toBe('2')
    act(() => { vi.advanceTimersByTime(140) })
    expect(turb.getAttribute('seed')).toBe('3')
    act(() => { vi.advanceTimersByTime(140) })
    expect(turb.getAttribute('seed')).toBe('1')
  })

  it('with reduced motion: fully drawn, no draw-on class, no interval at all', () => {
    reduce.on = true
    const spy = vi.spyOn(globalThis, 'setInterval')
    const { container } = render(<Scene id="runner-free" />)
    expect(spy).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.kd-draw, .kd-fade, .kd-pop').length).toBe(0)
    expect(container.querySelectorAll('.kd-s').length).toBeGreaterThan(3)
    spy.mockRestore()
  })

  it('draws one sticker per kind on a power-up scene', () => {
    const { container } = render(<Scene id="runner-powerups" stickers={['decoy', 'shield', 'cloak']} />)
    const got = [...container.querySelectorAll('[data-sticker]')].map((e) => e.getAttribute('data-sticker'))
    expect(got).toEqual(['decoy', 'shield', 'cloak'])
  })

  it('never names Dato Seri or Bomoh in what it renders', () => {
    const { container } = render(<Scene id="chaser-powerups" stickers={['flare', 'focus']} />)
    expect(container.innerHTML.toLowerCase()).not.toMatch(/dato|bomoh/)
  })

  it('clears its interval on unmount', () => {
    const { unmount } = render(<Scene id="sos" />)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
