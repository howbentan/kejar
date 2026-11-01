import { useCallback } from 'react'
import type { CatchJudgement } from '../../shared/catch.js'
import { stationFromQr, tagIdFromQr } from '../../shared/ids.js'
import type { View } from '../../shared/views.js'
import CatchMoment from '../game/CatchMoment'
import ChaseLayout from '../game/ChaseLayout'
import { dipFor } from '../game/LuckyDip'
import PingRipple from '../game/PingRipple'
import PowerUpHand, { claimMessage, type ClaimResult } from '../game/PowerUpHand'
import { clock, useServerNow } from '../game/time'

const REJECTIONS: Record<string, string> = {
  'too-far': 'Too far — get within 50 m',
  'already-caught': 'Already caught',
  'unknown-tag': "That's not a Kejar tag",
  'not-chasing': 'You can only catch during the chase',
  'not-a-chaser': 'Only chasers can catch',
  'no-location': 'Turn on location to catch',
  shielded: "Durian! That catch doesn't count. Hand the tag back.",
  paused: 'Game is paused',
}

export function catchMessage(text: string, r: CatchJudgement): string {
  const tag = tagIdFromQr(text)
  const label = tag === null ? 'runner' : `#${String(tag).padStart(2, '0')}`
  if (r.ok) return r.flagged ? `Caught ${label} — flagged for marshal` : `Caught ${label} ✓`
  return REJECTIONS[r.reason] ?? 'Catch not recorded'
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
  const chip = pingChip(view, now)

  const describe = useCallback(
    (s: { action: string }, text: string, r: unknown) =>
      s.action === 'catch' ? catchMessage(text, r as CatchJudgement) : claimMessage(r as ClaimResult, stationFromQr(text)),
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
      chips={chip && <span className="chip mono">{chip}</span>}
      overlay={<PingRipple role="chaser" lastRevealAt={view.lastRevealAt} now={now} />}
      slot={<PowerUpHand code={code} view={view} />}
      scanLabel="Scan tag"
      scanClass="scan-chaser"
      describe={describe}
      momentFor={momentFor}
      onScanned={refresh}
    />
  )
}
