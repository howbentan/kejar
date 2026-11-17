import { useEffect, useState } from 'react'
import { RESCUE_HOLD_MS, RESCUE_RESET_MS } from '../../../shared/penjara'
import type { View } from '../../../shared/views.js'
import { useServerNow } from '../time'

export type RescueNow = NonNullable<View['rescue']>

/**
 * The key's held time at `now`: what is banked, plus the run since the thumb went down. Never past the full hold:
 * between polls this only guesses (the server may already have counted the thumb as lifted), so it must not run on.
 */
export const heldAt = (r: Pick<RescueNow, 'heldMs' | 'holdSince'>, now: number) =>
  Math.min(RESCUE_HOLD_MS, r.heldMs + (r.holdSince === null ? 0 : Math.max(0, now - r.holdSince)))

/** Whole seconds of holding still to go, rounding up so it never shows 0 early. */
export const secondsToHold = (heldMs: number) => Math.max(0, Math.ceil((RESCUE_HOLD_MS - heldMs) / 1000))

/** Whole seconds until a let-go key resets; never 0 (the server ends it then). Unknown yet: the full 5 s. */
export const resetsIn = (resetAt: number | null, now: number) => Math.max(1, Math.ceil(((resetAt ?? now + RESCUE_RESET_MS) - now) / 1000))

/**
 * The server's clock for the rescue screens. `fast` redraws five times a second, so the key strains and each click
 * lands on time while it turns (the game's own clock only ticks once a second). Paused, the game holds still at the
 * server's moment.
 */
export function useRescueNow(viewNow: number, paused: boolean, fast: boolean): number {
  const ticking = useServerNow(viewNow)
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!fast || paused) return
    const id = window.setInterval(() => redraw((t) => t + 1), 200)
    return () => window.clearInterval(id)
  }, [fast, paused])
  return paused ? viewNow : ticking
}
