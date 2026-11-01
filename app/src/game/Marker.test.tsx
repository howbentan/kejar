import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

import Marker, { layoutBox, markPath, type Mark } from './Marker'

afterEach(() => {
  cleanup()
  reduce.on = false
})

const points = (d: string) => {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
  const out: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] })
  return out
}

function Marked({ marks }: { marks: Omit<Mark, 'target'>[] }) {
  const ref = useRef<HTMLSpanElement>(null)
  return (
    <div style={{ position: 'relative' }}>
      <span ref={ref}>Got Durian!</span>
      <Marker marks={marks.map((m) => ({ ...m, target: ref }))} />
    </div>
  )
}

describe('markPath', () => {
  it('a circle keeps 10 px of room around the words on every side', () => {
    const box = { x: 0, y: 0, w: 100, h: 20 }
    for (const p of points(markPath({ shape: 'circle' }, box))) {
      const inside = p.x > -10 && p.x < 110 && p.y > -10 && p.y < 30
      expect(inside, `${p.x},${p.y}`).toBe(false)
    }
  })

  it("a circle round a long title stays narrow enough for the phone (Got Mat Rempit!)", () => {
    const box = { x: 56, y: 0, w: 248, h: 40 }
    const xs = points(markPath({ shape: 'circle' }, box)).map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(248 + 70)
  })

  it('draws every shape as a path', () => {
    const box = { x: 10, y: 10, w: 80, h: 20 }
    for (const shape of ['circle', 'underline', 'star', 'arrow', 'x', 'tick', 'emphasis', 'strike'] as const) {
      expect(markPath({ shape }, box)).toMatch(/^M/)
    }
  })
})

describe('Marker', () => {
  it('draws each mark as a sketchy double line, hidden from screen readers', () => {
    const { container } = render(<Marked marks={[{ shape: 'circle' }, { shape: 'star' }]} />)
    const svg = container.querySelector('svg.marker')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelectorAll('path')).toHaveLength(4)
    expect(svg).toHaveAttribute('data-drawn', 'animated')
  })

  it("measures the target's settled place, not where an animation has it right now", () => {
    const parent = document.createElement('div')
    const fan = document.createElement('div')
    const card = document.createElement('div')
    const geo = (el: HTMLElement, g: Record<string, unknown>) =>
      Object.defineProperties(el, Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { get: () => v }])))
    geo(fan, { offsetParent: parent, offsetLeft: 0, offsetTop: 200 })
    geo(card, { offsetParent: fan, offsetLeft: 105, offsetTop: 10, offsetWidth: 150, offsetHeight: 234 })
    // Mid-flip on a slow phone the on-screen box is half the size; the marks must not follow it.
    card.getBoundingClientRect = () => ({ left: 140, top: 270, width: 75, height: 117 }) as DOMRect
    expect(layoutBox(card, parent)).toEqual({ x: 105, y: 210, w: 150, h: 234 })
  })

  it('with reduced motion, the marks appear already drawn', () => {
    reduce.on = true
    const { container } = render(<Marked marks={[{ shape: 'underline' }]} />)
    expect(container.querySelector('svg.marker')).toHaveAttribute('data-drawn', 'now')
  })
})
