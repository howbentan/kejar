import type { View } from '../../shared/views.js'
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
  const s = Math.max(0, Math.ceil((rescue.endsAt - now) / 1000))
  return (
    <div role="status" aria-label="Rescue" className="pill pill-on" style={{ alignSelf: 'flex-start', borderColor: 'var(--volt)', color: 'var(--volt)' }}>
      {`${rescue.byName} is breaking you out · ${s} s`}
    </div>
  )
}
