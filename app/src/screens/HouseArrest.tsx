import { ARREST_MS, ARREST_RADIUS_M } from '../../shared/arrest.js'
import type { View } from '../../shared/views.js'
import GameMap from '../game/Map'
import { clock, useServerNow } from '../game/time'
import { Screen } from '../game/ui'
import { useWakeLock } from '../game/useWakeLock'
import { Feed, useLocationPings } from './RunnerChase'

/**
 * How often a phone under house arrest sends a fresh fix. The release check wants one from the last 20 s, and a still
 * phone's position watch may say nothing, so this asks every few seconds (and once straight away, which starts a
 * waiting house arrest).
 */
export const ARREST_PING_MS = 5_000

/**
 * Super Ring's house arrest (new power-ups §6.2), in place of the chase screen while `view.arrest` is set: the 26 m
 * circle and my dot, the countdown (held still while paused), and a reminder to keep Kejar open. While it waits for a
 * fresh fix (after an auto-jail or Mak Kau Hijau) it asks them to open Kejar, with the seconds left. `released` is
 * the moment after it ends free: `Free! Super Ring is spent.` (bail revoked goes to the normal Penjara screen).
 */
export default function HouseArrest({ code, view, released = false }: { code: string; view: View; released?: boolean }) {
  const ticking = useServerNow(view.now)
  const now = view.paused ? view.now : ticking
  const arrest = released ? null : view.arrest
  // The server only moves on when an open phone polls, and the release check needs fresh fixes: keep the screen on.
  useWakeLock(!!arrest)
  useLocationPings(code, !!arrest && !view.paused, ARREST_PING_MS, true)

  if (!arrest) {
    return (
      <Screen eyebrow="SUPER RING">
        <h1 className="jail-title">
          Free! Super Ring is spent<span className="arrest-stop">.</span>
        </h1>
        <p className="muted">Back to the chase.</p>
      </Screen>
    )
  }

  if (arrest.endsAt === null) {
    // No deadline to show (shouldn't happen while waiting): leave the seconds out rather than read `0 s`.
    const left = arrest.openBy === null ? null : Math.max(0, Math.ceil((arrest.openBy - now) / 1000))
    return (
      <Screen eyebrow="HOUSE ARREST">
        <h1 className="jail-title">Open Kejar to start house arrest</h1>
        {left !== null && (
          <div className="arrest-count" style={{ fontSize: 48 }}>
            {`${left} s`}
          </div>
        )}
        <p className="muted">{`Finding you. Your ${ARREST_RADIUS_M} m circle starts where you stand.`}</p>
        <p className="muted">Keep Kejar open.</p>
        <GameMap arena={view.arena} dots={view.dots} height={220} />
        <Feed view={view} />
      </Screen>
    )
  }

  return (
    <Screen eyebrow="HOUSE ARREST">
      <div className="arrest-count" role="timer">
        {clock(Math.max(0, arrest.endsAt - now))}
      </div>
      <h1 className="jail-title" style={{ fontSize: 22 }}>
        {`House arrest: stay within ${ARREST_RADIUS_M} m for ${clock(ARREST_MS)}.`}
      </h1>
      <GameMap
        arena={view.arena}
        dots={view.dots}
        height={260}
        circle={arrest.center ? { ...arrest.center, radiusM: ARREST_RADIUS_M } : null}
      />
      <span className="arrest-chip">{`${ARREST_RADIUS_M} M · STAY INSIDE`}</span>
      <p className="muted">Keep Kejar open.</p>
      <Feed view={view} />
    </Screen>
  )
}
