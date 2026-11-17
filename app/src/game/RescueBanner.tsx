import type { View } from '../../shared/views.js'
import { heldAt, resetsIn, secondsToHold } from './rescue/rescueTime'
import { useServerNow } from './time'

/**
 * The marshal's one-line rescue status (rules §9a): `Hafiz is breaking them out · 7 s` while the key is held, or
 * `Hafiz let go · resets in 3 s`. Runners in Penjara get the lock itself (RescueWatch). While paused the hold is
 * frozen, so it counts from the server's moment instead of ticking.
 */
export default function RescueBanner({ view }: { view: View }) {
  const ticking = useServerNow(view.now)
  const rescue = view.rescue
  if (!rescue) return null
  const now = view.paused ? view.now : ticking
  const name = rescue.byName ?? 'A Dikejar'
  const held = heldAt(rescue, now)
  const text =
    rescue.holdSince === null && held > 0 ? `${name} let go · resets in ${resetsIn(rescue.resetAt, now)} s` : `${name} is breaking them out · ${secondsToHold(held)} s`
  return (
    <div role="status" aria-label="Rescue" className="pill pill-on" style={{ alignSelf: 'flex-start', borderColor: 'var(--volt)' }}>
      {text}
    </div>
  )
}
