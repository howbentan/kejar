import { useCallback, useEffect, useRef, useState } from 'react'
import type { View } from '../../shared/views.js'
import Marker from '../game/Marker'
import PenjaraArrival from '../game/PenjaraArrival'
import SettlePanel from '../game/SettlePanel'
import Stamp from '../game/Stamp'
import { WalkGuide } from '../game/WalkGuide'
import { shouldPlay } from '../game/moments'
import GameMap from '../game/Map'
import { wallClock } from '../game/time'
import { Screen } from '../game/ui'
import { Feed } from './RunnerChase'

// Gentler than the catch lines: an auto-jail may not be the runner's fault (motion design §5a).
const MISSED_LINES = ['Your phone went ponteng, bro.', 'Signal hilang, bossku?', 'Kena check in lah, boss.', 'Phone in your pocket too deep.']
const lineFor = (id: string) => MISSED_LINES[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % MISSED_LINES.length]

/** The check-ins it was judged on, as clock times; the marker strikes out the misses (motion design §5a). */
function CheckinRow({ checkins }: { checkins: { at: number; ok: boolean }[] }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const missed = checkins.flatMap((c, i) => (c.ok ? [] : [i]))
  return (
    <div className="checkin-row">
      {checkins.map((c, i) => (
        <span key={c.at} ref={(el) => void (refs.current[i] = el)} className={c.ok ? 'ok' : ''}>
          {c.ok ? `${wallClock(c.at)} ✓` : wallClock(c.at)}
        </span>
      ))}
      {missed.length > 0 && <Marker marks={missed.map((i) => ({ shape: 'strike' as const, target: { get current() { return refs.current[i] } } }))} delayMs={300} />}
    </div>
  )
}

/** Dato Seri's holder in Penjara: Settle sits here, on the Penjara screen, where the Penjara code gets scanned. */
function Settle({ code, view }: { code: string; view: View }) {
  return view.settle ? <SettlePanel code={code} settle={view.settle} /> : null
}

/** Sent to Penjara for missing two check-ins in a row: says why, and points to a marshal for a phone fault. */
function AutoJailed({ code, view }: { code: string; view: View }) {
  const [playing, setPlaying] = useState(() => shouldPlay('auto', view.me.caught_at, view.now, sessionStorage))
  useEffect(() => {
    if (playing) navigator.vibrate?.([300, 100, 300])
  }, [playing])
  if (playing) return <PenjaraArrival plate={<div className="stamp stamp-plate">2× MISSED</div>} onDone={() => setPlaying(false)} />

  const outForGood = view.me.freed_once
  // Opens the SOS sheet with Something else picked: a marshal can undo an auto-jail for a phone fault (§5b).
  const tellMarshal = () => window.dispatchEvent(new CustomEvent('kejar:sos', { detail: { reason: 'other' } }))
  return (
    <Screen eyebrow="PENJARA · AUTO">
      <h1 className="jail-title">
        {outForGood ? (
          "That's the game for you."
        ) : (
          <>
            Missed two <span style={{ whiteSpace: 'nowrap' }}>
              check-ins<span style={{ color: 'var(--volt)' }}>.</span>
            </span>
          </>
        )}
      </h1>
      <p className="muted">
        {outForGood ? 'You were already freed once, so you stay in Penjara until the end. Watch the chase from here.' : lineFor(view.me.id)}
      </p>
      {view.jailCheckins && view.jailCheckins.length > 0 && <CheckinRow checkins={view.jailCheckins} />}
      <Settle code={code} view={view} />
      {outForGood ? (
        <>
          <GameMap arena={view.arena} dots={view.dots} height={240} />
          <p className="eyebrow" style={{ textAlign: 'center' }}>
            {`Spectator view · ${view.settings.spectatorDelayMin} min delayed`}
          </p>
        </>
      ) : (
        <>
          <p className="muted">A free runner can still break you out — once.</p>
          <WalkThenWatch view={view} />
        </>
      )}
      <button type="button" className="sos-link" style={{ alignSelf: 'flex-start' }} onClick={tellMarshal}>
        Phone died or no buzz? Tell a marshal →
      </button>
      <Feed view={view} />
    </Screen>
  )
}

// Owner's choice of lines for being caught (motion design §5).
const CAUGHT_LINES = ['Masuk penjara, bossku!', 'Lepak kat Penjara dulu, bro.', 'Habis la, boss.', 'Hailat bro.', 'Skill issue.']
const pick = (lines: string[], id: string) => lines[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % lines.length]

/** The walk to Penjara, then today's spectator view once there (or straight away with no GPS). */
function WalkThenWatch({ view }: { view: View }) {
  const [arrived, setArrived] = useState(false)
  const [lost, setLost] = useState(false)
  const onArrived = useCallback(() => setArrived(true), [])
  const onLost = useCallback(() => setLost(true), [])
  return (
    <>
      {!arrived && <WalkGuide jail={view.arena.jail} arena={view.arena} onArrived={onArrived} onLost={onLost} />}
      {/* No GPS fix (none, denied, or none in 10 s): the spectator view, with the Penjara pin on it. */}
      {arrived || lost || !navigator.geolocation ? (
        <>
          <GameMap arena={view.arena} dots={view.dots} height={240} />
          <p className="eyebrow" style={{ textAlign: 'center' }}>
            {`Spectator view · ${view.settings.spectatorDelayMin} min delayed`}
          </p>
        </>
      ) : null}
    </>
  )
}

/** Caught by a chaser (motion design §5): the bars and the plated stamp, then who got you and the walk. */
function Caught({ code, view }: { code: string; view: View }) {
  const [playing, setPlaying] = useState(() => shouldPlay('caught', view.me.caught_at, view.now, sessionStorage))
  const name = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (playing) navigator.vibrate?.([100, 50, 300])
  }, [playing])

  if (playing) return <PenjaraArrival plate={<Stamp text="dikejar!" plate />} onDone={() => setPlaying(false)} />
  return (
    <Screen eyebrow="PENJARA">
      <h1 className="jail-title">
        {view.caughtBy ? (
          <>
            <span ref={name}>{view.caughtBy}</span> got you<span style={{ color: 'var(--volt)' }}>.</span>
            <Marker marks={[{ shape: 'underline', target: name }]} delayMs={200} />
          </>
        ) : (
          <>
            Caught<span style={{ color: 'var(--volt)' }}>.</span>
          </>
        )}
      </h1>
      <p className="muted">{pick(CAUGHT_LINES, view.me.id)}</p>
      <p className="muted">
        {view.me.freed_once
          ? 'You’ve already been broken out once, so you stay in Penjara this time.'
          : 'A free runner can still break you out — once. A marshal will give your tag back.'}
      </p>
      <Settle code={code} view={view} />
      <WalkThenWatch view={view} />
      <Feed view={view} />
    </Screen>
  )
}

export default function Jail({ code, view }: { code: string; view: View }) {
  if (view.jailReason === 'missed-checkins') return <AutoJailed code={code} view={view} />
  return <Caught code={code} view={view} />
}
