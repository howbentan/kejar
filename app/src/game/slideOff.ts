import type { LatLng } from '../../shared/types.js'
import type { MapDot } from '../../shared/views.js'
import { shouldPlay } from './moments.js'

/** How long a just-jailed runner's dot takes to slide to Penjara before it vanishes for good (Task 7). */
export const SLIDE_MS = 1_200

interface Tracked {
  /** Which jailing this is for — lets a runner jailed a second time later get a fresh slide. */
  caughtAt: string
  from: LatLng
  start: number
  finished: boolean
}

/**
 * Turns a just-jailed runner's dot (`caughtAt` set — see `MapDot`, within the server's slide-off window)
 * into a one-shot slide to Penjara: gated by `shouldPlay` so it plays exactly once per jailing, per browser,
 * then the dot is dropped for good even though the server keeps sending it for the rest of its window (so a
 * late poll, or a remount of the screen, never replays or restarts the slide). An ordinary dot (no
 * `caughtAt`) passes through untouched.
 */
export class SlideTracker {
  private tracked = new Map<string, Tracked>()
  private store: Storage

  constructor(store: Storage) {
    this.store = store
  }

  /**
   * Call with the latest `dots` (e.g. once per poll, and once per animation frame while `active`). Returns
   * what to actually draw, and whether a slide is still in progress — the caller keeps re-calling (with a
   * fresh `now`) while `active`, to animate the dot, and can stop once it isn't.
   */
  apply(dots: MapDot[], jail: LatLng, now: number): { dots: MapDot[]; active: boolean } {
    // Forget bookkeeping for anyone not currently mid-jailing-window, so a runner jailed again later (caught,
    // then auto-jailed, or vice versa) starts a fresh slide instead of reusing stale state.
    const presentIds = new Set(dots.filter((d) => d.caughtAt).map((d) => d.id))
    for (const id of [...this.tracked.keys()]) if (!presentIds.has(id)) this.tracked.delete(id)

    const out: MapDot[] = []
    let active = false
    for (const d of dots) {
      if (!d.caughtAt) {
        out.push(d)
        continue
      }
      let t = this.tracked.get(d.id)
      if (t && t.caughtAt !== d.caughtAt) {
        this.tracked.delete(d.id) // a new jailing of the same player: start over
        t = undefined
      }
      if (!t) {
        // Already played — an earlier poll in this browser, or an earlier visit to this screen — stays dropped.
        const finished = !shouldPlay(`auto-jailed-${d.id}`, d.caughtAt, now, this.store)
        t = { caughtAt: d.caughtAt, from: { lat: d.lat, lng: d.lng }, start: now, finished }
        this.tracked.set(d.id, t)
      }
      if (t.finished) continue
      const elapsed = now - t.start
      if (elapsed >= SLIDE_MS) {
        t.finished = true
        continue
      }
      active = true
      const eased = 1 - (1 - elapsed / SLIDE_MS) ** 2
      out.push({ ...d, lat: t.from.lat + (jail.lat - t.from.lat) * eased, lng: t.from.lng + (jail.lng - t.from.lng) * eased })
    }
    return { dots: out, active }
  }
}
