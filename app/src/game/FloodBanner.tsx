import type { View } from '../../shared/views.js'
import { useServerNow } from './time'

/**
 * Banjir Kilat (design 2026-11-16): a runner standing in the water sees how long they have to get back onto dry land
 * before it sends them to Penjara. While paused the count is frozen, so it reads from the server's moment instead.
 */
export default function FloodBanner({ view }: { view: View }) {
  const ticking = useServerNow(view.now)
  if (!view.wetUntil) return null
  const now = view.paused ? view.now : ticking
  const s = Math.max(0, Math.ceil((view.wetUntil - now) / 1000))
  return (
    <div role="alert" aria-label="In the water" className="flood-banner">
      {`Banjir! Get to dry land · ${s} s`}
    </div>
  )
}
