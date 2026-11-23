import { useCallback, useEffect, useRef, useState } from 'react'
import type { BreakJudgement } from '../../shared/catch.js'
import { RESCUE_RESET_MS } from '../../shared/penjara.js'
import { LUAR_GARISAN_WARN } from '../../shared/alerts.js'
import type { View } from '../../shared/views.js'
import { penjaraLockedLine } from '../../shared/hijau.js'
import { isSlipQr, stationFromQr } from '../../shared/ids.js'
import AlertsCard from '../game/AlertsCard'
import { call } from '../game/api'
import ChaseLayout from '../game/ChaseLayout'
import { currentCoords } from '../game/here'
import CheckinBanner from '../game/CheckinBanner'
import { EndgameStatus } from '../game/EndgameChip'
import HijauTakeover, { type TapResult } from '../game/HijauTakeover'
import { dipFor } from '../game/LuckyDip'
import RescueHold from '../game/rescue/RescueHold'
import PowerUpHand, { claimMessage, slipMessage, type SlipClaimResult, type ClaimResult } from '../game/PowerUpHand'
import { loadSession } from '../game/session'
import { clock, useServerNow } from '../game/time'

/** A green tap waits at most this long for a fix that's ready, so a last-second tap still lands in time. */
const TAP_FIX_WAIT_MS = 300

/** The full feed as a list, for screens without the dock (Penjara, the marshal). */
export function Feed({ view }: { view: View }) {
  if (view.feed.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p className="eyebrow">Feed</p>
      {view.feed.slice(0, 6).map((f, i) => (
        <p key={i} style={{ fontSize: 13 }}>
          <span className="mono muted" style={{ marginRight: 8 }}>
            {new Date(f.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {f.text}
          {f.means && <span style={{ color: 'var(--volt)' }}>{` → ${f.means}`}</span>}
        </p>
      ))}
    </div>
  )
}

const BREAK_REJECTIONS: Record<string, string> = {
  'too-far-from-jail': 'Get within 30 m of Penjara',
  'nobody-to-free': 'Nobody to free',
  'not-a-free-runner': 'Only free Dikejar can break people out',
  'not-chasing': 'Jailbreaks only work during the chase',
  paused: 'Game is paused',
  disqualified: "You're Luar Garisan, so you can't free anyone this round.",
  'try-again': 'Scan Penjara again',
  'penjara-closed': 'Penjara is closed (PKP)',
}

/**
 * What a Penjara scan answers (rules §9a): the rescue is claimed (or, for its own rescuer, resumed), someone else has
 * it, or why not.
 */
type BreakResult =
  | { ok: true; rescue: 'started' | 'resumed' }
  | { ok: false; reason: 'rescue-taken'; byName: string }
  | Extract<BreakJudgement, { ok: false }>
  | { ok: false; reason: string }

/**
 * While `active`, this phone asks for a fresh fix every `everyMs` and sends it, even when it's standing still (a still
 * phone's position watch may report nothing). With `now`, the first one goes straight away.
 */
export function useLocationPings(code: string, active: boolean, everyMs: number, now = false) {
  useEffect(() => {
    if (!active) return
    const token = loadSession(localStorage, code).token
    if (!token) return
    const ping = () =>
      void currentCoords(everyMs).then((c) => {
        if (typeof c.lat !== 'number' || typeof c.lng !== 'number') return
        return call('location', { code, token, ...c }).catch(() => undefined)
      })
    if (now) ping()
    const id = setInterval(ping, everyMs)
    return () => clearInterval(id)
  }, [code, active, everyMs, now])
}

const tagOf = (view: View) => (view.me.tag_id ? `#${String(view.me.tag_id).padStart(2, '0')}` : view.me.name.toUpperCase())

/** Opened from the check-in push (`?checkin=1`)? Read it once, then tidy the URL. */
function useOpenedByPush(): boolean {
  const [flag] = useState(() => new URLSearchParams(window.location.search).get('checkin') === '1')
  useEffect(() => {
    if (!flag) return
    const url = new URL(window.location.href)
    url.searchParams.delete('checkin')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }, [flag])
  return flag
}

export default function RunnerChase({ code, view, locationOff = false }: { code: string; view: View; locationOff?: boolean }) {
  const now = useServerNow(view.now)
  const opened = useOpenedByPush()
  const checkin = view.checkin
  // The push explains its own ping only: remember which one, so later early periods go back to the chip.
  const pushedFor = useRef<number | null>(null)
  if (opened && pushedFor.current === null && checkin) pushedFor.current = checkin.alertAt
  const openedByPush = opened && checkin?.alertAt === pushedFor.current
  const banner = !!checkin && (checkin.state !== 'early' || openedByPush)
  // My rescue (rules §9a). A scan that claims one opens the HOLD screen at once, before the next poll brings it: the
  // 5 s to press runs from the scan. That stand-in lasts until a view made after the scan says how it really stands.
  const [claimedAt, setClaimedAt] = useState<number | null>(null)
  const claimed =
    claimedAt !== null && view.now <= claimedAt && now < claimedAt + RESCUE_RESET_MS
      ? { by: view.me.id, byName: view.me.name, heldMs: 0, holdSince: null, resetAt: claimedAt + RESCUE_RESET_MS }
      : null
  const myRescue = view.me.jailed ? null : view.rescue?.by === view.me.id ? view.rescue : view.rescue ? null : claimed
  // The server's time right now, read fresh at the answer (the ticking clock can be a second behind): a view made
  // just before the scan must not count as one made after it.
  const viewAt = useRef({ server: view.now, local: 0 })
  useEffect(() => {
    viewAt.current = { server: view.now, local: Date.now() }
  }, [view.now])
  const onScanned = useCallback((s: { action: string }, _text: string, r: unknown) => {
    if (s.action === 'jailbreak' && (r as BreakResult).ok) setClaimedAt(viewAt.current.server + Date.now() - viewAt.current.local)
  }, [])

  const describe = useCallback((s: { action: string }, text: string, r: unknown) => {
    if (s.action === 'jailbreak') {
      const b = r as BreakResult
      // Claimed or resumed: the rescue screen opens over everything, so no line under it.
      if (b.ok) return ''
      if (b.reason === 'rescue-taken') return `${('byName' in b && b.byName) || 'Another Dikejar'} is already breaking them out.`
      if (b.reason === 'penjara-locked' && 'lockedMs' in b) return penjaraLockedLine(b.lockedMs)
      return BREAK_REJECTIONS[b.reason] ?? 'Nobody freed'
    }
    if (isSlipQr(text)) return slipMessage(r as SlipClaimResult)
    return claimMessage(r as ClaimResult, stationFromQr(text))
  }, [])
  const deckLeft = view.deckLeft
  const momentFor = useCallback(
    (s: { action: string }, text: string, r: unknown, done: () => void) => (s.action === 'claim' ? dipFor(text, r, deckLeft, done, code) : null),
    [deckLeft, code],
  )

  // Mak Kau Hijau: one tap of the green pill, sent with my token and where I am (the Kejar see the spot). The tap
  // never waits on GPS: it takes whatever fix is ready within TAP_FIX_WAIT_MS, else none, and the server uses my
  // last stored fix. The takeover retries a lost tap.
  const tapGreen = useCallback(async (): Promise<TapResult> => {
    const token = loadSession(localStorage, code).token
    if (!token) return { ok: false, reason: 'no-token' }
    const here = await Promise.race([
      currentCoords(TAP_FIX_WAIT_MS),
      new Promise<Record<string, never>>((resolve) => window.setTimeout(() => resolve({}), TAP_FIX_WAIT_MS)),
    ])
    return call<TapResult>('touchGreen', { code, token, ...here })
  }, [code])

  return (
    <>
      <HijauTakeover view={view} onTap={tapGreen} />
      <ChaseLayout
        code={code}
        view={view}
        side="runner"
        title={`DIKEJAR ${tagOf(view)}`}
        chips={
          <>
            <EndgameStatus view={view} />
            {checkin && !banner && (
              <span className="chip">{`Check in in ${clock(Math.max(0, checkin.alertAt - now))}`}</span>
            )}
            {view.chaserNearby && (
              <span className="chip warn">
                <i />
                Kejar within 100 m
              </span>
            )}
          </>
        }
        overlay={
          <>
            {view.outWarned && (
              <div role="alert" className="chase-warning">
                <p style={{ fontWeight: 700 }}>{LUAR_GARISAN_WARN}</p>
              </div>
            )}
            {locationOff && (
              <div role="alert" className="chase-warning">
                <p style={{ fontWeight: 700 }}>Location is off. You'll miss check-ins.</p>
                <p className="muted">Turn it on in your browser settings.</p>
              </div>
            )}
            {view.me.role === 'runner' && <AlertsCard code={code} view={view} />}
            {banner && <CheckinBanner checkin={checkin} now={now} openedByPush={openedByPush} />}
          </>
        }
        slot={<PowerUpHand code={code} view={view} />}
        scanLabel="Scan"
        scanClass="scan-runner"
        describe={describe}
        momentFor={momentFor}
        onScanned={onScanned}
      />
      {/* My rescue covers the chase: the rescuer's job is the key, and the screen has to stay open for it (it sends the
          rescue's fixes and heartbeat itself). */}
      {myRescue && <RescueHold code={code} rescue={myRescue} viewNow={view.now} paused={view.paused} />}
    </>
  )
}
