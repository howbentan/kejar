import { useCallback, useEffect, useRef, useState } from 'react'
import type { View } from '../../shared/views.js'
import AlertsCard from '../game/AlertsCard'
import HowToPlayLink from '../game/HowToPlayLink'
import Marker from '../game/Marker'
import PenjaraArrival from '../game/PenjaraArrival'
import PenjaraReel, { useReelHold } from '../game/PenjaraReel'
import PenjaraTicket from '../game/PenjaraTicket'
import RescueBanner from '../game/RescueBanner'
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
const lineFor = (id: string, lines = MISSED_LINES) => lines[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % lines.length]

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
function Settle({ code, view, onSettled }: { code: string; view: View; onSettled?: () => void }) {
  return view.settle ? <SettlePanel code={code} meId={view.me.id} settle={view.settle} onSettled={onSettled} /> : null
}

/** The auto-jailed variants: missed check-ins, Mak Kau Hijau's missed tap, or Super Ring's bail revoked. */
type AutoReason = 'missed-checkins' | 'hijau' | 'bail-revoked'

const HIJAU_LINES = ['Should have touched green, bossku.', 'Hijau where, bro?', 'Mak kau hijau no joke one.']
const REVOKED_LINES = ['Should have stayed home, boss.', 'Out of the circle, bro.']

const AUTO: Record<AutoReason, { plate: string; title: string; lines: string[] }> = {
  'missed-checkins': { plate: '2× MISSED', title: 'Missed two check-ins', lines: MISSED_LINES },
  hijau: { plate: 'MAK KAU HIJAU', title: 'Mak kau hijau got you', lines: HIJAU_LINES },
  'bail-revoked': { plate: 'BAIL REVOKED', title: 'Bail revoked. To Penjara', lines: REVOKED_LINES },
}

/**
 * Sent to Penjara without a catch: says why, and points to a marshal for a phone fault. Missed check-ins also show
 * the check-ins it was judged on; Mak Kau Hijau and a revoked house arrest have none to show.
 */
function AutoJailed({ code, view, reason = 'missed-checkins' }: { code: string; view: View; reason?: AutoReason }) {
  const copy = AUTO[reason]
  const [playing, setPlaying] = useState(() => shouldPlay('auto', view.me.caught_at, view.now, sessionStorage))
  const [distanceM, setDistanceM] = useState<number | null>(null)
  const [localSettled, setLocalSettled] = useState(false)
  const holding = useReelHold()
  useEffect(() => {
    if (playing) navigator.vibrate?.([300, 100, 300])
  }, [playing])
  if (playing) return <PenjaraArrival plate={<div className="stamp stamp-plate">{copy.plate}</div>} onDone={() => setPlaying(false)} />

  // Not jailed any more but GameScreen is still showing this screen: Settle just freed them (self-scanned or
  // one of the up to 2 others picked alongside the holder), and the SETTLE stamp is why it's still up.
  const settled = localSettled || !view.me.jailed
  // Used their escape and still inside. Not once freed (by Settle or the reel), even for the beat the screen stays up.
  const outForGood = view.me.freed_once && view.me.jailed
  const lastOk = view.jailCheckins?.filter((c) => c.ok).at(-1) ?? null
  // Opens the SOS sheet with Something else picked: a marshal can undo an auto-jail for a phone fault (§5b).
  const tellMarshal = () => window.dispatchEvent(new CustomEvent('kejar:sos', { detail: { reason: 'other' } }))
  return (
    <Screen eyebrow="PENJARA · AUTO">
      <h1 className="jail-title">
        {outForGood ? (
          "That's the game for you."
        ) : reason === 'missed-checkins' ? (
          <>
            Missed two <span style={{ whiteSpace: 'nowrap' }}>
              check-ins<span style={{ color: 'var(--volt)' }}>.</span>
            </span>
          </>
        ) : (
          <>
            {copy.title}
            <span style={{ color: 'var(--volt)' }}>.</span>
          </>
        )}
      </h1>
      <p className="muted">
        {outForGood ? 'You were already freed once, so you stay in Penjara until the end. Watch the chase from here.' : lineFor(view.me.id, copy.lines)}
      </p>
      {reason === 'missed-checkins' && view.jailCheckins && view.jailCheckins.length > 0 && <CheckinRow checkins={view.jailCheckins} />}
      {view.me.jailed && !view.me.freed_once && <RescueBanner view={view} />}
      <PenjaraTicket
        playerId={view.me.id}
        variant={{ kind: 'auto', lastSeenMs: lastOk?.at ?? null }}
        distanceM={distanceM}
        outForGood={outForGood}
        settled={settled}
      />
      <Settle code={code} view={view} onSettled={() => setLocalSettled(true)} />
      {outForGood ? (
        // Out for good: the map from the start, and the (all black) reel once they reach Penjara.
        <WalkThenWatch code={code} view={view} spectate />
      ) : view.me.jailed || holding ? (
        <>
          <p className="muted">A free runner can still break you out, but only once.</p>
          <WalkThenWatch code={code} view={view} onDistance={setDistanceM} />
        </>
      ) : null}
      <button type="button" className="sos-link" style={{ alignSelf: 'flex-start' }} onClick={tellMarshal}>
        Phone died or no buzz? Tell a marshal →
      </button>
      <HowToPlayLink code={code} view={view} />
      <AlertsCard code={code} view={view} />
      <Feed view={view} />
    </Screen>
  )
}

// Owner's choice of lines for being caught (motion design §5).
const CAUGHT_LINES = ['Masuk penjara, bossku!', 'Lepak kat Penjara dulu, bro.', 'Habis la, boss.', 'Hailat bro.', 'Skill issue.']
const pick = (lines: string[], id: string) => lines[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % lines.length]

/** The walk to Penjara, then today's spectator view once there (or straight away with no GPS). */
function WalkThenWatch({
  code,
  view,
  onDistance,
  spectate = false,
}: {
  code: string
  view: View
  onDistance?: (m: number | null) => void
  /** Show the spectator view from the start (the walk guide still runs, so the reel knows when they arrive). */
  spectate?: boolean
}) {
  const [arrived, setArrived] = useState(false)
  // The reel, once at Penjara and while jailed this stay. A free pull frees them at once, so the last reel is kept
  // (and Penjara held up by the game screen) until its result has been read.
  const holding = useReelHold()
  const lastReel = useRef(view.reel)
  if (view.reel) lastReel.current = view.reel
  const reel = view.me.jailed || holding ? lastReel.current : null
  const [lost, setLost] = useState(false)
  const onArrived = useCallback(() => setArrived(true), [])
  const onLost = useCallback(() => setLost(true), [])
  return (
    <>
      {!arrived && <WalkGuide jail={view.arena.jail} arena={spectate ? undefined : view.arena} onArrived={onArrived} onLost={onLost} onDistance={onDistance} />}
      {arrived && reel && <PenjaraReel code={code} freedOnce={view.me.freed_once} reel={reel} />}
      {/* No GPS fix (none, denied, or none in 10 s): the spectator view, with the Penjara pin on it. */}
      {arrived || lost || spectate || !navigator.geolocation ? (
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
  const [distanceM, setDistanceM] = useState<number | null>(null)
  const [localSettled, setLocalSettled] = useState(false)
  const holding = useReelHold()
  const name = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (playing) navigator.vibrate?.([100, 50, 300])
  }, [playing])

  if (playing) return <PenjaraArrival plate={<Stamp text="dikejar!" plate />} onDone={() => setPlaying(false)} />
  // Not jailed any more but GameScreen is still showing this screen: Settle just freed them (self-scanned or
  // one of the up to 2 others picked alongside the holder), and the SETTLE stamp is why it's still up.
  const settled = localSettled || !view.me.jailed
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
        {view.me.freed_once && view.me.jailed
          ? 'You’ve already been broken out once, so you stay in Penjara this time.'
          : 'A free runner can still break you out, but only once. A marshal will give your tag back.'}
      </p>
      {view.me.jailed && !view.me.freed_once && <RescueBanner view={view} />}
      <PenjaraTicket
        playerId={view.me.id}
        variant={{ kind: 'catch', caughtBy: view.caughtBy ?? 'a chaser', caughtAtMs: view.me.caught_at ? Date.parse(view.me.caught_at) : null }}
        distanceM={distanceM}
        outForGood={view.me.freed_once && view.me.jailed}
        settled={settled}
      />
      <Settle code={code} view={view} onSettled={() => setLocalSettled(true)} />
      {(view.me.jailed || holding) && <WalkThenWatch code={code} view={view} onDistance={setDistanceM} />}
      <HowToPlayLink code={code} view={view} />
      <AlertsCard code={code} view={view} />
      <Feed view={view} />
    </Screen>
  )
}

export default function Jail({ code, view }: { code: string; view: View }) {
  // `jailReason` goes null the instant `jailed` flips false (views.ts), so once Settle frees this player,
  // relying on it live would misroute every freed player to Caught -- remember which one they actually were.
  const lastReason = useRef<View['jailReason']>(view.jailReason)
  if (view.jailReason) lastReason.current = view.jailReason
  const reason = view.me.jailed ? view.jailReason : lastReason.current
  if (reason === 'missed-checkins' || reason === 'hijau' || reason === 'bail-revoked') return <AutoJailed code={code} view={view} reason={reason} />
  return <Caught code={code} view={view} />
}
