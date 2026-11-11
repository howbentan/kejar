import { useCallback, useEffect } from 'react'
import type { CatchJudgement } from '../../shared/catch.js'
import { isBomohQr, isDatoQr, stationFromQr, tagIdFromQr } from '../../shared/ids.js'
import { LUAR_GARISAN_WARN } from '../../shared/alerts.js'
import type { View } from '../../shared/views.js'
import CatchMoment from '../game/CatchMoment'
import ChaseLayout from '../game/ChaseLayout'
import { dipFor } from '../game/LuckyDip'
import PowerUpHand, { claimMessage, stashMessage, type ClaimResult } from '../game/PowerUpHand'
import { clock, useServerNow } from '../game/time'
import { useWakeLock } from '../game/useWakeLock'

const REJECTIONS: Record<string, string> = {
  'too-far': 'Too far. Get within 50 m.',
  implausible: "Can't confirm that one. Get closer and try again.",
  'already-caught': 'Already caught',
  'unknown-tag': "That's not a Kejar tag",
  'not-chasing': 'You can only catch during the chase',
  'not-a-chaser': 'Only chasers can catch',
  'no-location': 'Turn on location to catch',
  shielded: "Durian! You can't catch {name} again this game. Hand the tag back.",
  'durian-locked': "Durian! You can't catch {name} again this game.",
  'durian-head-start': 'Durian! {name} gets a 15 s head start.',
  paused: 'Game is paused',
  disqualified: "You're Luar Garisan lah, so that catch doesn't count.",
  'already-out': 'Aiyo, that runner is already out of this round.',
}

export function catchMessage(text: string, r: CatchJudgement): string {
  const tag = tagIdFromQr(text)
  const label = tag === null ? 'runner' : `#${String(tag).padStart(2, '0')}`
  if (r.ok) return r.flagged ? `Caught ${label} . Flagged for a marshal.` : `Caught ${label} ✓`
  return (REJECTIONS[r.reason] ?? 'Catch not recorded').replace('{name}', () => r.name ?? label)
}

/** "Next ping 1:42 · last 3:18 ago", or whichever half is known. */
function pingChip(view: View, now: number): string | null {
  const next = view.nextRevealAt === null ? null : `Next ping ${clock(Math.max(0, view.nextRevealAt - now))}`
  // Time since counts up, so round down (clock() rounds up, for countdowns).
  const last = view.lastRevealAt === null ? null : `last ${clock(Math.max(0, Math.floor((now - view.lastRevealAt) / 1000) * 1000))} ago`
  if (next && last) return `${next} · ${last}`
  return next ?? (last && `Last ping ${last.slice(5)}`)
}

export default function ChaserChase({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const now = useServerNow(view.now)
  useWakeLock(view.phase === 'hiding' || view.phase === 'chasing')
  const chip = pingChip(view, now)
  // A rescue starting at Penjara (rules §9a): one buzz per rescue, on top of the ticker's lime line.
  const rescueBy = view.rescue?.by ?? null
  useEffect(() => {
    if (rescueBy) navigator.vibrate?.([200, 100, 200])
  }, [rescueBy])

  const describe = useCallback(
    (s: { action: string }, text: string, r: unknown) =>
      s.action === 'catch'
        ? catchMessage(text, r as CatchJudgement)
        : isDatoQr(text) || isBomohQr(text)
          ? stashMessage(r as ClaimResult, 'chaser')
          : claimMessage(r as ClaimResult, stationFromQr(text)),
    [],
  )

  const deckLeft = view.deckLeft
  const momentFor = useCallback(
    (s: { action: string }, text: string, r: unknown, done: () => void) => {
      if (s.action === 'claim') return dipFor(text, r, deckLeft, done)
      const c = r as CatchJudgement
      return c.ok ? <CatchMoment label={c.label ?? ''} onDone={done} /> : null
    },
    [deckLeft],
  )

  return (
    <ChaseLayout
      code={code}
      view={view}
      side="chaser"
      title={`KEJAR · ${view.me.name.toUpperCase()}`}
      chips={
        <>
          {chip && <span className="chip mono">{chip}</span>}
          {/* From a scheduled alert until that ping reveals (checkins design §5.4); it says what, never how long. */}
          {view.snapshotted && <span className="chip snap">SNAPSHOT TAKEN</span>}
        </>
      }
      overlay={
        view.me.disqualified_at ? (
          <div role="alert" className="chase-warning">
            <p style={{ fontWeight: 700 }}>Luar Garisan: your catches don't count this round, boss.</p>
          </div>
        ) : view.outWarned ? (
          <div role="alert" className="chase-warning">
            <p style={{ fontWeight: 700 }}>{LUAR_GARISAN_WARN}</p>
          </div>
        ) : undefined
      }
      slot={<PowerUpHand code={code} view={view} />}
      scanLabel="Scan tag"
      scanClass="scan-chaser"
      describe={describe}
      momentFor={momentFor}
      onScanned={refresh}
    />
  )
}
