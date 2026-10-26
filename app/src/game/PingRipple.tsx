import { useEffect } from 'react'
import type { Role } from '../../shared/types.js'

/** How long the "you've been pinged" moment stays on screen. */
const SHOW_MS = 8_000

const COPY: Record<Role, { title: string; sub: string }> = {
  runner: { title: "You've been pinged", sub: 'Kejar just saw where you were. Move!' },
  chaser: { title: 'Ping! Dikejar revealed', sub: 'Check the map — circles show where they were.' },
  marshal: { title: 'Ping sent', sub: 'Kejar can see dikejar’s last positions.' },
}

/** Full-width ripple card shown for a few seconds after each ping, with a buzz. */
export default function PingRipple({ role, lastRevealAt, now }: { role: Role | null; lastRevealAt: number | null; now: number }) {
  const active = lastRevealAt !== null && now >= lastRevealAt && now - lastRevealAt < SHOW_MS && role !== null

  useEffect(() => {
    if (active && 'vibrate' in navigator) navigator.vibrate?.([120, 60, 120])
    // Buzz once per ping, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lastRevealAt])

  if (!active) return null
  const copy = COPY[role]
  return (
    <div className="ping-ripple" role="status" aria-live="assertive">
      <div className="ping-rings" aria-hidden="true">
        <span />
        <span />
        <span />
        <i />
      </div>
      <div>
        <p className="ping-title">{copy.title}</p>
        <p className="ping-sub">{copy.sub}</p>
      </div>
    </div>
  )
}
