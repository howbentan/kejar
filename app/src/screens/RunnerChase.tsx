import { useCallback, useEffect, useRef, useState } from 'react'
import type { BreakJudgement } from '../../shared/catch.js'
import { RESCUE_HOLD_MS, RESCUE_PING_MS } from '../../shared/penjara.js'
import { LUAR_GARISAN_WARN } from '../../shared/alerts.js'
import type { View } from '../../shared/views.js'
import { isBomohQr, isDatoQr, isHijauQr, isRingQr, stationFromQr } from '../../shared/ids.js'
import AlertsCard from '../game/AlertsCard'
import { call } from '../game/api'
import ChaseLayout from '../game/ChaseLayout'
import { currentCoords } from '../game/here'
import CheckinBanner from '../game/CheckinBanner'
import HijauTakeover, { type TapResult } from '../game/HijauTakeover'
import { dipFor } from '../game/LuckyDip'
import PowerUpHand, { claimMessage, stashMessage, type ClaimResult } from '../game/PowerUpHand'
import { loadSession } from '../game/session'
import { clock, useServerNow } from '../game/time'

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
}

/** What a Penjara scan answers: a rescue started or joined (rules §9a), or why not. */
type BreakResult = { ok: true; rescue: 'started' | 'joined'; endsAt: number } | Extract<BreakJudgement, { ok: false }> | { ok: false; reason: string }

/** Whole seconds left in the hold, rounding up so it never shows 0 early. */
export const secondsLeft = (endsAt: number, now: number) => Math.max(0, Math.ceil((endsAt - now) / 1000))

/** The rescuer's and joiners' lime ring, filling over the 10 s hold. */
function HoldRing({ endsAt, now }: { endsAt: number; now: number }) {
  const done = Math.min(1, Math.max(0, 1 - (endsAt - now) / RESCUE_HOLD_MS))
  const c = 2 * Math.PI * 22
  return (
    <div role="status" aria-label="Rescue hold" className="chase-warning" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="6" />
        <circle
          cx="26"
          cy="26"
          r="22"
          fill="none"
          stroke="var(--volt)"
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - done)}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <p style={{ fontWeight: 700 }}>{`Stay close · ${secondsLeft(endsAt, now)} s`}</p>
    </div>
  )
}

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

/** The rescuer's phone sends its location every RESCUE_PING_MS while holding: the server judges each fix. */
function useRescuePings(code: string, holding: boolean) {
  useLocationPings(code, holding, RESCUE_PING_MS)
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
  // While paused the hold is frozen: count from the server's moment, not the ticking clock.
  const rescue = view.rescue
  const inHold = !!rescue && !view.me.jailed && (rescue.by === view.me.id || !!rescue.joiners?.includes(view.me.id))
  const holdNow = view.paused ? view.now : now
  useRescuePings(code, !!rescue && rescue.by === view.me.id && !view.me.jailed && !view.paused)

  const describe = useCallback((s: { action: string }, text: string, r: unknown) => {
    if (s.action === 'jailbreak') {
      const b = r as BreakResult
      if (b.ok) return b.rescue === 'joined' ? 'You joined the rescue. Stay close!' : 'Rescue on! Stay close to Penjara for 10 s.'
      return BREAK_REJECTIONS[b.reason] ?? 'Nobody freed'
    }
    if (isDatoQr(text) || isBomohQr(text) || isRingQr(text) || isHijauQr(text)) return stashMessage(r as ClaimResult, 'runner')
    return claimMessage(r as ClaimResult, stationFromQr(text))
  }, [])
  const deckLeft = view.deckLeft
  const momentFor = useCallback(
    (s: { action: string }, text: string, r: unknown, done: () => void) => (s.action === 'claim' ? dipFor(text, r, deckLeft, done) : null),
    [deckLeft],
  )

  // Mak Kau Hijau: one tap of the big green button, sent with my token (the takeover retries a lost one).
  const tapGreen = useCallback(async (): Promise<TapResult> => {
    const token = loadSession(localStorage, code).token
    if (!token) return { ok: false, reason: 'no-token' }
    return call<TapResult>('touchGreen', { code, token })
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
                <p style={{ fontWeight: 700 }}>Location is off, so you'll miss check-ins and be sent to Penjara.</p>
                <p className="muted">Turn on location for this site in your browser settings.</p>
              </div>
            )}
            {inHold && <HoldRing endsAt={rescue.endsAt} now={holdNow} />}
            {view.me.role === 'runner' && <AlertsCard code={code} view={view} />}
            {banner && <CheckinBanner checkin={checkin} now={now} openedByPush={openedByPush} />}
          </>
        }
        slot={<PowerUpHand code={code} view={view} />}
        scanLabel="Scan"
        scanClass="scan-runner"
        describe={describe}
        momentFor={momentFor}
      />
    </>
  )
}
