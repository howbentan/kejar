/**
 * The running j's body (design: the logo's j as a little runner). Angles in degrees, distances in the j's own
 * 326 x 519 drawing units. `phase` counts strides: whole numbers are the logo's own pose, 0.5 is legs fully apart.
 */
export const STRIDE = {
  /** Strides a second when running on the spot. */
  CADENCE: 1 / 0.38,
  LEG_L: -58,
  LEG_R: 50,
  BOB: 20,
  LEAN: 5,
  JUMP_MS: 460,
  JUMP_LIFT: 150,
  TUCK_L: -38,
  TUCK_R: 34,
  /** The landing squash, as a fraction of the jump's length. */
  SQUASH: 0.22,
} as const

export interface Pose {
  legL: number
  legR: number
  lift: number
  tilt: number
  sx: number
  sy: number
}

const z = (v: number) => v + 0 // no -0, so a resting pose reads as plain zeros

/** Where every part sits: `lean` 0..1 is how hard it is running; `sinceJump` is ms since a tap (Infinity: none). */
export function pose(phase: number, lean: number, sinceJump: number): Pose {
  const c = (1 - Math.cos(phase * 2 * Math.PI)) / 2
  const bob = Math.abs(Math.sin(phase * 2 * Math.PI)) * lean
  const j = sinceJump / STRIDE.JUMP_MS
  const air = j >= 0 && j < 1 ? Math.sin(Math.PI * j) : 0
  const squash = j >= 1 && j < 1 + STRIDE.SQUASH ? Math.sin((Math.PI * (j - 1)) / STRIDE.SQUASH) : 0
  return {
    legL: z(STRIDE.LEG_L * c * (1 - air) + STRIDE.TUCK_L * air),
    legR: z(STRIDE.LEG_R * c * (1 - air) + STRIDE.TUCK_R * air),
    lift: z(-STRIDE.BOB * bob * (1 - air) - STRIDE.JUMP_LIFT * air),
    tilt: z(STRIDE.LEAN * lean - 10 * air),
    sx: 1 + 0.06 * squash,
    sy: 1 - 0.1 * squash,
  }
}

/** The phase a run should end on: a whole stride, so it always stops in the logo's pose. */
export function wholeStride(phase: number, distance: number, strideLength: number, extraStrides: number): number {
  return Math.floor(phase) + Math.max(1, Math.round(distance / strideLength + extraStrides))
}
