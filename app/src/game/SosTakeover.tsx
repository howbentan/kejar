import { useRef, useState } from 'react'
import { SOS_OUTCOME_LABEL, type Alert, type SosOutcome } from '../../shared/alerts.js'
import { distanceM } from '../../shared/geo.js'
import type { Arena, LatLng } from '../../shared/types.js'
import GameMap from './Map'
import { useServerNow } from './time'
import { ErrorText } from './ui'

const OUTCOMES = (Object.keys(SOS_OUTCOME_LABEL) as SosOutcome[]).map((value) => ({ value, text: SOS_OUTCOME_LABEL[value] }))

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
 * now"), the moment any SOS is unhandled. A convenience overlay, not a lock: "See the map first" hands the
 * marshal back to their normal screen (`onDismiss`), from where the pinned SOS row brings it back. The
 * arrow-and-distance mini map follows WalkGuide.tsx's own GameMap/route pattern on the game's real arena,
 * framed to fit both the marshal and the sender, with the sender's spot drawn as a safety pin.
 *
 * Owns the busy and error state for its two server calls: a second tap while one is in flight does nothing,
 * and a failed call says so here (it covers the screen, so an error anywhere else wouldn't be seen).
 */
export default function SosTakeover({
  alert,
  arena,
  myPos,
  senderPos,
  onRespond,
  onClose,
  onDismiss,
}: {
  alert: Alert
  arena: Arena
  myPos: LatLng | null
  senderPos: LatLng | null
  onRespond: () => Promise<unknown>
  onClose: (outcome: SosOutcome) => Promise<unknown>
  onDismiss: () => void
}) {
  // No server-synced `now` is passed in (the brief's own prop signature has none); re-seeding the same
  // ticking-clock hook every render with the local clock still ticks once a second, just without the
  // phone-clock-skew correction that a real `view.now` would give it.
  const now = useServerNow(Date.now())
  const [outcome, setOutcome] = useState<SosOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A ref as well as state: two taps in the same frame both see `busy` false, but not this.
  const inFlight = useRef(false)
  const { sender, reason } = parseSos(alert.text)

  async function send(request: () => Promise<unknown>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await request()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div className="sos-takeover" role="dialog" aria-label="SOS">
      <p className="eyebrow">{`MARSHALS · SOS · SENT ${elapsedSince(alert.at, now)}`}</p>
      <p className="sos-takeover-big">sos</p>
      <p className="sos-takeover-sender">{sender}</p>

      <div className="sos-takeover-panel">
        <p>{reason ?? `Waiting for ${sender} to say…`}</p>
      </div>

      {myPos && senderPos && (
        <div className="sos-takeover-map">
          <GameMap
            arena={arena}
            dots={[{ id: 'me', kind: 'me', lat: myPos.lat, lng: myPos.lng, at: new Date().toISOString(), revealedBy: null }]}
            pins={[{ id: alert.id, lat: senderPos.lat, lng: senderPos.lng }]}
            route={{ from: myPos, to: senderPos }}
            fit={[myPos, senderPos]}
            height={200}
          />
          <p className="sos-takeover-distance mono">{`${Math.round(distanceM(myPos, senderPos))} M`}</p>
        </div>
      )}

      <p className="sos-takeover-status">{alert.respondingName ? `${alert.respondingName} IS GOING` : "NOBODY'S GOING YET"}</p>

      <div className="sos-takeover-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => send(onRespond)}>
          I'm going
        </button>
        {/* A peek, not a safety action: nothing goes to the server, the SOS stays open. */}
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
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
      <button
        type="button"
        className="btn sos-takeover-close"
        disabled={!outcome || busy}
        onClick={() => outcome && send(() => onClose(outcome))}
      >
        Close SOS
      </button>
      {error && (
        <div className="sos-takeover-panel">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  )
}
