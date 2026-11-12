import { describe, expect, it } from 'vitest'
import { pose, STRIDE, wholeStride } from './stride'

describe('pose', () => {
  it('stands in the logo pose at rest', () => {
    expect(pose(0, 0, Infinity)).toEqual({ legL: 0, legR: 0, lift: 0, tilt: 0, sx: 1, sy: 1, spin: 0 })
    expect(pose(3, 0, Infinity)).toMatchObject({ legL: 0, legR: 0, lift: 0 })
  })

  it('swings the legs fully apart, crossing, half way through a stride', () => {
    const p = pose(0.5, 1, Infinity)
    expect(p.legL).toBeCloseTo(STRIDE.LEG_L)
    expect(p.legR).toBeCloseTo(STRIDE.LEG_R)
  })

  it('bobs and leans while running', () => {
    const p = pose(0.25, 1, Infinity)
    expect(p.lift).toBeCloseTo(-STRIDE.BOB)
    expect(p.tilt).toBeCloseTo(STRIDE.LEAN)
  })

  it('at the top of a jump: lifted, legs tucked, tilted back', () => {
    const p = pose(0.5, 1, STRIDE.JUMP_MS / 2)
    expect(p.lift).toBeCloseTo(-STRIDE.JUMP_LIFT)
    expect(p.legL).toBeCloseTo(STRIDE.TUCK_L)
    expect(p.legR).toBeCloseTo(STRIDE.TUCK_R)
    expect(p.tilt).toBeLessThan(0)
  })

  it('squashes as it lands, then is back to normal', () => {
    const landing = pose(0, 0, STRIDE.JUMP_MS + (STRIDE.JUMP_MS * STRIDE.SQUASH) / 2)
    expect(landing.sy).toBeLessThan(1)
    expect(landing.sx).toBeGreaterThan(1)
    expect(pose(0, 0, STRIDE.JUMP_MS * 2)).toMatchObject({ sx: 1, sy: 1, lift: 0 })
  })
})

describe('wholeStride', () => {
  it('ends a run on a whole stride after the current phase', () => {
    expect(wholeStride(0, 100, 50, 0)).toBe(2)
    expect(wholeStride(2.4, 100, 50, 0)).toBe(4)
  })

  it('always takes at least one stride', () => {
    expect(wholeStride(1, 1, 50, 0)).toBe(2)
  })

  it('adds extra strides for a sprint', () => {
    expect(wholeStride(0, 100, 50, 3)).toBe(5)
  })
})

describe('backflip', () => {
  it('half way through: high up, upside down, legs tucked', () => {
    const p = pose(0, 0, Infinity, STRIDE.FLIP_MS / 2)
    expect(p.lift).toBeCloseTo(-STRIDE.JUMP_LIFT * 1.1)
    expect(p.spin).toBeCloseTo(-180)
    expect(p.legL).toBeCloseTo(STRIDE.TUCK_L)
    expect(p.legR).toBeCloseTo(STRIDE.TUCK_R)
  })

  it('a full turn by the end, then back to normal', () => {
    expect(pose(0, 0, Infinity, STRIDE.FLIP_MS * 0.999).spin).toBeLessThan(-350)
    expect(pose(0, 0, Infinity, STRIDE.FLIP_MS * 2)).toMatchObject({ spin: 0, lift: 0 })
  })

  it('no flip, no spin', () => expect(pose(0.3, 1, Infinity).spin).toBe(0))
})

describe('backflip from a jump', () => {
  it('starts at the height the jump had reached, with no drop', () => {
    expect(pose(0, 0, Infinity, 0, 1).lift).toBeCloseTo(-STRIDE.JUMP_LIFT)
    expect(pose(0, 0, Infinity, STRIDE.FLIP_MS * 0.05, 1).lift).toBeLessThan(-STRIDE.JUMP_LIFT * 0.9)
  })
})

