import { useState } from 'react'
import type { Alert } from '../../shared/alerts.js'
import { distanceM } from '../../shared/geo.js'
import type { Arena, LatLng } from '../../shared/types.js'
import GameMap from './Map'
import { useServerNow } from './time'

const OUTCOMES: { value: string; text: string }[] = [
  { value: 'sorted', text: 'Sorted, all good' },
  { value: 'first-aid', text: 'First aid given' },
  { value: 'left', text: 'Player left the game' },
  { value: 'false-alarm', text: 'False alarm' },
]

/** m:ss counted UP since `at`. `clock()` in time.ts counts down for countdowns; this is the opposite direction. */
function elapsedSince(at: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1_000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "Aina #07", and the reason once it's there, from the alert's own "SOS from X: reason" text (shared/alerts.ts). */
function parseSos(text: string): { sender: string; reason: string | null } {
  const m = /^SOS from ([^:]+?)(?::\s*(.+))?$/.exec(text)
  return { sender: m?.[1]?.trim() ?? 'them', reason: m?.[2]?.trim() ?? null }
}

/**
 * The marshal SOS takeover (motion design §6.5): hijacks whatever screen is open, full-screen lime ("needs you
 * now"), the moment any SOS is unhandled. The arrow-and-distance mini map follows WalkGuide.tsx's own
 * GameMap/route pattern; since this component takes no `Arena`, it draws a boundary-less one scoped to just
 * the two points involved, with the sender's spot drawn as a safety pin rather than borrowing the jail marker.
 */
export default function SosTakeover({
  alert,
  myPos,
  senderPos,
  onRespond,
  onClose,
}: {
  alert: Alert
  myPos: LatLng | null
  senderPos: LatLng | null
  onRespond: () => void
  onClose: (outcome: string) => void
}) {
  // No server-synced `now` is passed in (the brief's own prop signature has none); re-seeding the same
  // ticking-clock hook every render with the local clock still ticks once a second, just without the
  // phone-clock-skew correction that a real `view.now` would give it.
  const now = useServerNow(Date.now())
  const [outcome, setOutcome] = useState<string | null>(null)
  const { sender, reason } = parseSos(alert.text)
  const showMap = myPos !== null && senderPos !== null

  const arena: Arena | null = showMap && myPos && senderPos ? { id: 'sos', name: 'sos', boundary: [], jail: senderPos, start: myPos } : null

  return (
    <div className="sos-takeover" role="dialog" aria-label="SOS">
      <p className="eyebrow">{`MARSHALS · SOS · SENT ${elapsedSince(alert.at, now)}`}</p>
      <p className="sos-takeover-big">sos</p>
      <p className="sos-takeover-sender">{sender}</p>

      <div className="sos-takeover-panel">
        <p>{reason ?? `Waiting for ${sender} to say…`}</p>
      </div>

      {arena && myPos && senderPos && (
        <div className="sos-takeover-map">
          <GameMap
            arena={arena}
            dots={[{ id: 'me', kind: 'me', lat: myPos.lat, lng: myPos.lng, at: new Date().toISOString() }]}
            pins={[{ id: alert.id, lat: senderPos.lat, lng: senderPos.lng }]}
            route={{ from: myPos, to: senderPos }}
            height={200}
          />
          <p className="sos-takeover-distance mono">{`${Math.round(distanceM(myPos, senderPos))} M`}</p>
        </div>
      )}

      <p className="sos-takeover-status">{alert.respondingName ? `${alert.respondingName} IS GOING` : "NOBODY'S GOING YET"}</p>

      <div className="sos-takeover-actions">
        <button type="button" className="btn" onClick={onRespond}>
          I'm going
        </button>
        {/* A peek, not a safety action: left as a no-op for now (builder's call per the brief). */}
        <button type="button" className="btn btn-ghost" onClick={() => {}}>
          See the map first
        </button>
      </div>

      <div className="sos-chips">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={outcome === o.value}
            className={outcome === o.value ? 'on' : ''}
            onClick={() => setOutcome(o.value)}
          >
            {o.text}
          </button>
        ))}
      </div>
      <button type="button" className="btn sos-takeover-close" disabled={!outcome} onClick={() => outcome && onClose(outcome)}>
        Close SOS
      </button>
    </div>
  )
}
