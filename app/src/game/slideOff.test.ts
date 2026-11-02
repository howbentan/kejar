import { beforeEach, describe, expect, it } from 'vitest'
import type { MapDot } from '../../shared/views.js'
import { SLIDE_MS, SlideTracker } from './slideOff'

const JAIL = { lat: 3.0, lng: 101.0 }
const AT = '2026-11-01T09:00:00.000Z'
const T = Date.parse(AT)

const dot = (over: Partial<MapDot> = {}): MapDot => ({ id: 'r1', kind: 'runner', lat: 3.01, lng: 101.02, at: AT, revealedBy: null, ...over })

beforeEach(() => localStorage.clear())

describe('SlideTracker', () => {
  it('passes an ordinary dot through untouched', () => {
    const tracker = new SlideTracker(localStorage)
    const { dots, active } = tracker.apply([dot({ caughtAt: undefined })], JAIL, T)
    expect(dots).toEqual([dot({ caughtAt: undefined })])
    expect(active).toBe(false)
  })

  it('starts a just-jailed dot sliding from its last known position', () => {
    const tracker = new SlideTracker(localStorage)
    const { dots, active } = tracker.apply([dot({ caughtAt: AT })], JAIL, T)
    expect(active).toBe(true)
    expect(dots).toEqual([expect.objectContaining({ id: 'r1', lat: 3.01, lng: 101.02 })])
  })

  it('moves the dot toward Penjara partway through the slide', () => {
    const tracker = new SlideTracker(localStorage)
    tracker.apply([dot({ caughtAt: AT })], JAIL, T)
    const { dots } = tracker.apply([dot({ caughtAt: AT })], JAIL, T + SLIDE_MS / 2)
    const d = dots[0]
    // Partway: strictly between the start and Penjara on both axes.
    expect(d.lat).toBeLessThan(3.01)
    expect(d.lat).toBeGreaterThan(JAIL.lat)
    expect(d.lng).toBeLessThan(101.02)
    expect(d.lng).toBeGreaterThan(JAIL.lng)
  })

  it('drops the dot for good once the slide finishes, even though the server keeps sending it', () => {
    const tracker = new SlideTracker(localStorage)
    tracker.apply([dot({ caughtAt: AT })], JAIL, T)
    const { dots, active } = tracker.apply([dot({ caughtAt: AT })], JAIL, T + SLIDE_MS + 1)
    expect(dots).toEqual([])
    expect(active).toBe(false)
    // A later poll, still within the server's window, must not restart or resurrect it.
    const again = tracker.apply([dot({ caughtAt: AT })], JAIL, T + SLIDE_MS + 5_000)
    expect(again.dots).toEqual([])
    expect(again.active).toBe(false)
  })

  it('a fresh tracker (e.g. after remounting the screen) does not replay a slide already played in this browser', () => {
    new SlideTracker(localStorage).apply([dot({ caughtAt: AT })], JAIL, T)
    const fresh = new SlideTracker(localStorage)
    const { dots, active } = fresh.apply([dot({ caughtAt: AT })], JAIL, T + 1_000)
    expect(dots).toEqual([])
    expect(active).toBe(false)
  })

  it('a runner whose jailing is undone mid-slide (dot stops carrying caughtAt) is drawn as an ordinary dot again', () => {
    const tracker = new SlideTracker(localStorage)
    tracker.apply([dot({ caughtAt: AT })], JAIL, T)
    const ordinary = dot({ caughtAt: undefined, kind: 'teammate' })
    const { dots } = tracker.apply([ordinary], JAIL, T + 200)
    expect(dots).toEqual([ordinary])
  })

  it('a runner re-jailed with a new caught_at but no intervening unjailed snapshot (undo-then-recatch between two polls) still gets a fresh slide, not the old slide continued', () => {
    const tracker = new SlideTracker(localStorage)
    // First jailing starts sliding; this tracked entry is never evicted (the id keeps appearing with
    // caughtAt on every call below), so the very next apply() finds it still present.
    tracker.apply([dot({ caughtAt: AT, lat: 3.01, lng: 101.02 })], JAIL, T)
    // Next poll: same id, but a brand-new caught_at (e.g. a marshal's undo and a fresh catch both landed
    // between two polls) — the client never sees an intervening unjailed snapshot for this id.
    const AT2 = new Date(T + 500).toISOString()
    const { dots, active } = tracker.apply([dot({ caughtAt: AT2, lat: 3.05, lng: 101.09 })], JAIL, T + 500)
    expect(active).toBe(true)
    // A fresh slide from the NEW last-known position — not the old slide's interpolated position.
    expect(dots).toEqual([expect.objectContaining({ lat: 3.05, lng: 101.09 })])
  })

  it('a runner jailed again later (after a free spell) gets a fresh slide, not stale state', () => {
    const tracker = new SlideTracker(localStorage)
    // First jailing plays all the way out.
    tracker.apply([dot({ caughtAt: AT })], JAIL, T)
    tracker.apply([dot({ caughtAt: AT })], JAIL, T + SLIDE_MS + 1)
    // Free in between: the dot drops out of the payload entirely (not jailed, so views.ts wouldn't send it).
    tracker.apply([], JAIL, T + 5_000)
    // Caught again, later, with a new caught_at — must slide again, from the new last-known position.
    const AT2 = new Date(T + 10_000).toISOString()
    const { dots, active } = tracker.apply([dot({ caughtAt: AT2, lat: 3.02, lng: 101.03 })], JAIL, T + 10_000)
    expect(active).toBe(true)
    expect(dots).toEqual([expect.objectContaining({ lat: 3.02, lng: 101.03 })])
  })
})
