import { count, type View } from '../../shared/views.js'
import { ALERT_LEAD_MS } from '../../shared/clock.js'
import GameMap from '../game/Map'
import PingRipple from '../game/PingRipple'
import PowerUpHand from '../game/PowerUpHand'
import { clock, useServerNow } from '../game/time'
import { Screen } from '../game/ui'
import { BreakOut } from './Jail'

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
        </p>
      ))}
    </div>
  )
}

export function GameClock({ view }: { view: View }) {
  const ticking = useServerNow(view.now)
  // While paused the server holds the time left still, so don't tick between polls.
  const now = view.paused ? view.now : ticking
  return <span className="mono">{clock((view.endsAt ?? now) - now)}</span>
}

export default function RunnerChase({ code, view }: { code: string; view: View }) {
  const now = useServerNow(view.now)
  const toReveal = view.nextRevealAt === null ? null : view.nextRevealAt - now
  const checkInNow = toReveal !== null && toReveal <= ALERT_LEAD_MS

  return (
    <Screen eyebrow={`Runner · ${view.me.tag_id ? `#${String(view.me.tag_id).padStart(2, '0')}` : view.me.name}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <GameClock view={view} />
        <span className="muted">{count(view.counts.runnersFree, 'runner')} free</span>
      </div>
      <PingRipple role={view.me.role} lastRevealAt={view.lastRevealAt} now={now} />

      {checkInNow ? (
        <div style={{ background: 'var(--volt)', color: 'var(--black)', borderRadius: 20, padding: 18, textAlign: 'center' }}>
          <p style={{ font: '600 11px var(--mono)', letterSpacing: '0.18em' }}>PING INCOMING — CHECK IN</p>
          <p className="mono" style={{ fontSize: 48, fontWeight: 500 }}>
            {clock(toReveal)}
          </p>
          <p style={{ fontSize: 12, fontWeight: 500 }}>Keep this page open until the ping</p>
        </div>
      ) : (
        toReveal !== null && (
          <p className="muted">
            Next check-in in <span className="mono">{clock(toReveal - ALERT_LEAD_MS)}</span>
          </p>
        )
      )}

      {view.chaserNearby && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--volt)', boxShadow: '0 0 8px var(--volt)' }} />
          <span style={{ fontWeight: 600 }}>Chaser within 100 m</span>
        </div>
      )}

      <GameMap arena={view.arena} dots={view.dots} stations={view.stations} height={260} />
      <PowerUpHand code={code} view={view} />
      <BreakOut code={code} view={view} />
      <Feed view={view} />
    </Screen>
  )
}
