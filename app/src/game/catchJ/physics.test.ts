import { describe, expect, it } from 'vitest'
import { ART } from '../stickerArt'
import { canCatch, caught, geometry, pickSticker, relaunch, stageGeometry, startState, step, TOY, type ToyState } from './physics'

const g = geometry(290, 430, 150)
const at = (over: Partial<ToyState>): ToyState => ({ ...startState(g), ...over })

describe('geometry', () => {
  it('centres a 240px logo on a 290px stage and maps the j box', () => {
    expect(g.scale).toBe(1)
    expect(g.home.x).toBeCloseTo(25 + 190 * (240 / 900))
    expect(g.home.y).toBeCloseTo(150 + 12 * (240 / 900))
    expect(g.jw).toBeCloseTo((516 - 190) * (240 / 900))
    expect(g.jh).toBeCloseTo((531 - 12) * (240 / 900))
    expect(g.bounds).toEqual({ w: 290, h: 430 })
  })

  it('stageGeometry centres the logo vertically in the play area', () => {
    const logoH = 240 * (543 / 900)
    expect(stageGeometry(290, 430)).toEqual(geometry(290, 430, (430 - logoH) / 2))
  })

  it('scales with stage width', () => {
    const big = geometry(580, 860, 300)
    expect(big.scale).toBe(2)
    expect(big.jw).toBeCloseTo(g.jw * 2)
  })
})

describe('step', () => {
  it('moves and spins', () => {
    const s = startState(g)
    const { s: n } = step(s, 16, g)
    expect(n.x).toBeCloseTo(s.x + s.vx)
    expect(n.y).toBeCloseTo(s.y + s.vy)
    expect(n.rot).toBeCloseTo(s.rot + s.spin)
  })

  it('bounces off the right wall and flips spin', () => {
    const s = at({ x: g.bounds.w - g.jw - 0.5, vx: 2, spin: 3 })
    const { s: n } = step(s, 16, g)
    expect(n.vx).toBeLessThan(0)
    expect(n.spin).toBe(-3)
    expect(n.x).toBeLessThanOrEqual(g.bounds.w - g.jw)
  })

  it('clamps a j that starts outside shrunken bounds', () => {
    const { s: n } = step(at({ x: 1000, y: 1000 }), 16, g)
    expect(n.x).toBeLessThanOrEqual(g.bounds.w - g.jw)
    expect(n.y).toBeLessThanOrEqual(g.bounds.h - g.jh)
  })

  it('caps dt at 40ms', () => {
    const s = at({ x: 100, y: 100 })
    expect(step(s, 60_000, g).s.x).toBeCloseTo(step(s, 40, g).s.x)
  })

  it('does not move during a beat and counts it down', () => {
    const s = at({ beatLeft: 500 })
    const { s: n } = step(s, 100, g)
    expect(n.beatLeft).toBe(400)
    expect(n.x).toBe(s.x)
    expect(n.y).toBe(s.y)
  })

  it('self-catches when gliding through home', () => {
    let s = at({ x: g.home.x - 4, y: g.home.y, vx: 2, vy: 0 })
    let hit = false
    for (let i = 0; i < 2 && !hit; i++) {
      const r = step(s, 16, g)
      s = r.s
      hit = r.selfCatch
    }
    expect(hit).toBe(true)
  })
})

describe('catching', () => {
  it('can catch within 14px but not at 15px, and never during a beat', () => {
    expect(canCatch(at({ x: g.home.x + 14, y: g.home.y }), g)).toBe(true)
    expect(canCatch(at({ x: g.home.x + 15, y: g.home.y }), g)).toBe(false)
    expect(canCatch(at({ x: g.home.x, y: g.home.y, beatLeft: 10 }), g)).toBe(false)
  })

  it('snaps home upright with a 500ms beat', () => {
    const n = caught(at({ x: g.home.x + 5, y: g.home.y - 3, rot: 77 }), g)
    expect([n.x, n.y, n.rot, n.beatLeft]).toEqual([g.home.x, g.home.y, 0, TOY.BEAT_MS])
  })

  it('relaunch speeds up by 7% and caps at 4.2', () => {
    const r = () => 0.3
    const n = relaunch(at({ vx: 2, vy: 0 }), g, r)
    expect(Math.hypot(n.vx, n.vy)).toBeCloseTo(2 * 1.07)
    const fast = relaunch(at({ vx: 4.1, vy: 0 }), g, r)
    expect(Math.hypot(fast.vx, fast.vy)).toBeCloseTo(4.2)
  })
})

describe('pickSticker', () => {
  const kinds = Object.keys(ART)

  it('never repeats the previous sticker', () => {
    let prev = pickSticker(null, Math.random)
    for (let i = 0; i < 200; i++) {
      const next = pickSticker(prev, Math.random)
      expect(next).not.toBe(prev)
      expect(kinds).toContain(next)
      prev = next
    }
  })

  it('still moves on when rand is stuck', () => {
    expect(pickSticker(kinds[0] as never, () => 0)).not.toBe(kinds[0])
  })
})
