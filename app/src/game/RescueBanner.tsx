import type { View } from '../../shared/views.js'
import { RESCUE_HOLD_MS } from '../../shared/penjara.js'
import { useServerNow } from './time'

/**
 * `Hafiz is breaking you out · 7 s` (rules §9a): for jailed runners and the Penjara marshal while a rescue holds.
 * While paused the hold is frozen, so it counts from the server's moment instead of ticking.
 */
export default function RescueBanner({ view }: { view: View }) {
  const ticking = useServerNow(view.now)
  const rescue = view.rescue
  if (!rescue) return null
  const now = view.paused ? view.now : ticking
  // Task 6 replaces this banner; until then show the seconds of key still to hold.
  const held = rescue.heldMs + (rescue.holdSince ? Math.max(0, now - rescue.holdSince) : 0)
  const s = Math.max(0, Math.ceil((RESCUE_HOLD_MS - held) / 1000))
  return (
    <div role="status" aria-label="Rescue" className="pill pill-on" style={{ alignSelf: 'flex-start', borderColor: 'var(--volt)' }}>
      {`${rescue.byName ?? 'A Dikejar'} is breaking you out · ${s} s`}
    </div>
  )
}
