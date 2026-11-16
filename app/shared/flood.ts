/**
 * Banjir Kilat, the flood (design 2026-11-16-banjir-kilat-design.md): once revealed at 10 minutes left, the dry land
 * is a circle round a random spot in the play area, and it shrinks in four steps at 8, 6, 4 and 2 minutes left, each
 * warned 60 s ahead, down to about a quarter of the area. A free runner in the water has 30 s to get out.
 * Everything here is worked out from the game alone (the spot from its secret deck seed), so nothing is stored.
 */
import { MINUTE_MS, toWall } from './clock.js'
import { revealed } from './endgame.js'
import { circlePolygon, distanceM, distanceToEdgeM, hash } from './geo.js'
import { inPlayArea, ringAreaHa } from './playArea.js'
import type { Arena, Game, LatLng } from './types.js'

/** When the water rises, in minutes left. */
export const FLOOD_LEFT_MIN = [8, 6, 4, 2] as const
/** How long before each rise the next waterline shows. */
export const FLOOD_WARN_MS = 60_000
/** How long a runner may stand in the water before it sends them to Penjara. */
export const FLOOD_GRACE_MS = 30_000
/** A fix counts as in the water only this far past the waterline, so GPS wobble on the line never counts. */
export const FLOOD_MARGIN_M = 10
/** The share of the play area still dry after the last rise. */
export const FLOOD_DRY_SHARE = 0.25

export interface FloodPlan {
  center: LatLng
  /** The starting radius: the whole play area is dry. */
  r0: number
  /** The radius after the last rise. */
  rf: number
}

/** A small seeded random source (mulberry32), so the same game always floods the same way. */
function rngFrom(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Where the dry land shrinks to, and how big it starts and ends. The spot is a random point in the play area,
 * preferring one far enough from the edge for the final circle to mostly fit; failing that, the one deepest inside.
 */
export function floodPlan(arena: Pick<Arena, 'boundary' | 'holes'>, seed: string): FloodPlan {
  const ring = arena.boundary
  const rf = Math.sqrt((FLOOD_DRY_SHARE * ringAreaHa(ring) * 10_000) / Math.PI)
  const lats = ring.map((p) => p.lat)
  const lngs = ring.map((p) => p.lng)
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const rng = rngFrom(`flood:${seed}`)
  let best: { p: LatLng; edge: number } | null = null
  for (let i = 0; i < 200; i++) {
    const p = { lat: s + rng() * (n - s), lng: w + rng() * (e - w) }
    if (!inPlayArea(p, arena)) continue
    const edge = distanceToEdgeM(p, ring)
    if (edge >= rf * 0.6) {
      best = { p, edge }
      break
    }
    if (!best || edge > best.edge) best = { p, edge }
  }
  const center = best?.p ?? ring[0]
  const r0 = Math.max(rf, ...ring.map((v) => distanceM(center, v)))
  return { center, r0, rf }
}

/** The dry radius after `step` rises (0 to 4). */
export function floodRadius(plan: FloodPlan, step: number): number {
  return plan.r0 - ((plan.r0 - plan.rf) * step) / FLOOD_LEFT_MIN.length
}

export const floodPlanOf = (game: Game): FloodPlan => floodPlan(game.arena, game.deck_seed ?? game.id)

/**
 * The four rises in wall time: each sits on the pause-free clock (like Bomba's pings) and is pushed later by every
 * pause before it. `warnAt` is when its waterline starts showing.
 */
export function floodSteps(game: Game, now?: number): { at: number; warnAt: number; radiusM: number }[] {
  const plan = floodPlanOf(game)
  const nominalEnd = Date.parse(game.started_at!) + (game.settings.hideMin + game.settings.lengthMin) * MINUTE_MS
  return FLOOD_LEFT_MIN.map((m, k) => {
    const t = nominalEnd - m * MINUTE_MS
    return { at: toWall(game, t, now), warnAt: toWall(game, t - FLOOD_WARN_MS, now), radiusM: floodRadius(plan, k + 1) }
  })
}

export interface FloodNow {
  center: LatLng
  /** The dry radius now. */
  radiusM: number
  /** How many rises have happened (0 to 4). */
  step: number
  /** The next rise, or null after the last. */
  next: { at: number; warnAt: number; radiusM: number } | null
  /** The next waterline is showing: its rise is less than 60 s away. */
  warning: boolean
}

/** The flood right now, or null when the game's endgame isn't a revealed Banjir Kilat. */
export function floodNow(game: Game, now: number): FloodNow | null {
  if (!revealed(game, 'banjir') || !game.started_at) return null
  const plan = floodPlanOf(game)
  const steps = floodSteps(game, now)
  const step = steps.filter((s) => now >= s.at).length
  const next = steps[step] ?? null
  return { center: plan.center, radiusM: floodRadius(plan, step), step, next, warning: !!next && now >= next.warnAt }
}

/** In the water: past the waterline by more than the margin, once the water has risen at least once. */
export function inWater(p: LatLng, game: Game, now: number): boolean {
  const f = floodNow(game, now)
  if (!f || f.step === 0) return false
  return distanceM(p, f.center) > f.radiusM + FLOOD_MARGIN_M
}

/** Time in the water since `since`, leaving out pauses (finished ones and an open one), so a pause freezes the 30 s. */
export function wetElapsed(game: Game, since: number, now: number): number {
  const pauses = game.pauses.map((p) => ({ from: Date.parse(p.from), to: Date.parse(p.to) }))
  if (game.paused_at) pauses.push({ from: Date.parse(game.paused_at), to: now })
  const paused = pauses.reduce((sum, p) => sum + Math.max(0, Math.min(p.to, now) - Math.max(p.from, since)), 0)
  return Math.max(0, now - since - paused)
}

/**
 * The part of `ring` inside the circle (Sutherland-Hodgman against a 64-sided circle, which is convex), for drawing
 * the dry land. A ring wholly inside comes back as it is. Flat projection, fine at park scale.
 */
export function clipToCircle(ring: LatLng[], center: LatLng, radiusM: number): LatLng[] {
  if (ring.every((v) => distanceM(center, v) <= radiusM)) return ring
  const k = Math.cos((center.lat * Math.PI) / 180)
  const xy = (p: LatLng) => ({ x: (p.lng - center.lng) * k, y: p.lat - center.lat })
  const back = (q: { x: number; y: number }): LatLng => ({ lat: q.y + center.lat, lng: q.x / k + center.lng })
  const clip = circlePolygon(center, radiusM, 64).map(xy)
  // circlePolygon goes clockwise from north; inside is to the right of each edge, i.e. the cross product is negative.
  const inside = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) <= 0
  const cross = (p: { x: number; y: number }, q: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
    const [dx, dy, ex, ey] = [q.x - p.x, q.y - p.y, b.x - a.x, b.y - a.y]
    const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / (dx * ey - dy * ex)
    return { x: p.x + t * dx, y: p.y + t * dy }
  }
  let out = ring.map(xy)
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    const input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j]
      const q = input[(j + 1) % input.length]
      const pin = inside(p, a, b)
      const qin = inside(q, a, b)
      if (pin) out.push(p)
      if (pin !== qin) out.push(cross(p, q, a, b))
    }
  }
  return out.map(back)
}
