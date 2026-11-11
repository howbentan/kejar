import { ART, type StickerKind } from '../stickerArt'

/**
 * Catch the j: the home screen toy (design 2026-11-12). The j from the logo bounces and spins like the old
 * DVD logo; a tap while it lines up with its gap snaps it home. Pure functions, no DOM: the component calls
 * `step` once a frame. Sizes are at a 290px stage and scale with `Geometry.scale`; speeds are px per 16ms frame.
 */
export const TOY = {
  STAGE: 290,
  LOGO_W: 240,
  CATCH_PX: 14,
  SELF_PX: 3,
  START: 1.6,
  SPEEDUP: 1.07,
  MAX: 4.2,
  BEAT_MS: 500,
  STICKER: 84,
  J_BOX: { x0: 190, y0: 12, x1: 516, y1: 531 },
  FRAME: { w: 900, h: 543 },
} as const

export interface Geometry {
  scale: number
  jw: number
  jh: number
  home: { x: number; y: number }
  bounds: { w: number; h: number }
}

export interface ToyState {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  beatLeft: number
}

/** Where things sit for a stage `stageW` wide, a play area `playH` tall and the logo's top edge at `logoTop`. */
export function geometry(stageW: number, playH: number, logoTop: number): Geometry {
  const scale = stageW / TOY.STAGE
  const logoW = TOY.LOGO_W * scale
  const k = logoW / TOY.FRAME.w
  const { x0, y0, x1, y1 } = TOY.J_BOX
  return {
    scale,
    jw: (x1 - x0) * k,
    jh: (y1 - y0) * k,
    home: { x: (stageW - logoW) / 2 + x0 * k, y: logoTop + y0 * k },
    bounds: { w: stageW, h: playH },
  }
}

export function startState(g: Geometry): ToyState {
  return { x: 30 * g.scale, y: 40 * g.scale, vx: TOY.START * g.scale, vy: TOY.START * 0.8 * g.scale, rot: 0, spin: 2.4, beatLeft: 0 }
}

const distHome = (s: ToyState, g: Geometry) => Math.hypot(s.x - g.home.x, s.y - g.home.y)

/** One frame. During a catch beat nothing moves; otherwise move, spin, bounce off the play area's edges. */
export function step(s: ToyState, dtMs: number, g: Geometry): { s: ToyState; selfCatch: boolean } {
  if (s.beatLeft > 0) return { s: { ...s, beatLeft: Math.max(0, s.beatLeft - dtMs) }, selfCatch: false }
  const f = Math.min(40, Math.max(0, dtMs)) / 16
  const before = distHome(s, g)
  const n = { ...s, x: s.x + s.vx * f, y: s.y + s.vy * f, rot: s.rot + s.spin * f }
  const maxX = Math.max(0, g.bounds.w - g.jw)
  const maxY = Math.max(0, g.bounds.h - g.jh)
  let bounced = false
  if (n.x <= 0) [n.x, n.vx, bounced] = [0, Math.abs(n.vx), true]
  else if (n.x >= maxX) [n.x, n.vx, bounced] = [maxX, -Math.abs(n.vx), true]
  if (n.y <= 0) [n.y, n.vy, bounced] = [0, Math.abs(n.vy), true]
  else if (n.y >= maxY) [n.y, n.vy, bounced] = [maxY, -Math.abs(n.vy), true]
  if (bounced) n.spin = -n.spin
  const near = TOY.SELF_PX * g.scale
  return { s: n, selfCatch: before >= near && distHome(n, g) < near }
}

export function canCatch(s: ToyState, g: Geometry): boolean {
  return s.beatLeft <= 0 && distHome(s, g) <= TOY.CATCH_PX * g.scale
}

export function caught(s: ToyState, g: Geometry): ToyState {
  return { ...s, x: g.home.x, y: g.home.y, rot: 0, beatLeft: TOY.BEAT_MS }
}

/** Off again after a catch: a little faster, a new diagonal-ish direction, a new spin. */
export function relaunch(s: ToyState, g: Geometry, rand: () => number): ToyState {
  const sp = Math.min(TOY.MAX * g.scale, Math.hypot(s.vx, s.vy) * TOY.SPEEDUP)
  const a = (rand() * 0.6 + 0.2) * (Math.PI / 2) + Math.floor(rand() * 4) * (Math.PI / 2)
  const spin = (rand() < 0.5 ? -1 : 1) * (1.8 + (sp / g.scale) * 0.7)
  return { ...s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, spin, beatLeft: 0 }
}

const KINDS = Object.keys(ART) as StickerKind[]

/** A random power-up drawing, never the same as the last one. */
export function pickSticker(prev: StickerKind | null, rand: () => number): StickerKind {
  for (let i = 0; i < 5; i++) {
    const k = KINDS[Math.min(KINDS.length - 1, Math.floor(rand() * KINDS.length))]
    if (k !== prev) return k
  }
  return KINDS[(KINDS.indexOf(prev as StickerKind) + 1) % KINDS.length]
}
