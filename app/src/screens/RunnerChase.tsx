import { useCallback, useEffect, useRef, useState } from 'react'
import type { BreakJudgement } from '../../shared/catch.js'
import type { View } from '../../shared/views.js'
import { isDatoQr, stationFromQr } from '../../shared/ids.js'
import ChaseLayout from '../game/ChaseLayout'
import CheckinBanner from '../game/CheckinBanner'
import { dipFor } from '../game/LuckyDip'
import PowerUpHand, { claimMessage, stashMessage, type ClaimResult } from '../game/PowerUpHand'
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

  const describe = useCallback((s: { action: string }, text: string, r: unknown) => {
    if (s.action === 'jailbreak') {
      const b = r as BreakJudgement
      return b.ok ? `Freed ${b.freedIds.length} Dikejar ✓` : (BREAK_REJECTIONS[b.reason] ?? 'Nobody freed')
    }
    if (isDatoQr(text)) return stashMessage(r as ClaimResult)
    return claimMessage(r as ClaimResult, stationFromQr(text))
  }, [])
  const deckLeft = view.deckLeft
  const momentFor = useCallback(
    (s: { action: string }, text: string, r: unknown, done: () => void) => (s.action === 'claim' ? dipFor(text, r, deckLeft, done) : null),
    [deckLeft],
  )

  return (
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
          {locationOff && (
            <div role="alert" className="chase-warning">
              <p style={{ fontWeight: 700 }}>Location is off, so you'll miss check-ins and be sent to Penjara.</p>
              <p className="muted">Turn on location for this site in your browser settings.</p>
            </div>
          )}
          {banner && <CheckinBanner checkin={checkin} now={now} openedByPush={openedByPush} />}
        </>
      }
      slot={<PowerUpHand code={code} view={view} />}
      scanLabel="Scan"
      scanClass="scan-runner"
      describe={describe}
      momentFor={momentFor}
    />
  )
}
