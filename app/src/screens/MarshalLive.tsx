import { useState } from 'react'
import type { View } from '../../shared/views.js'
import { call } from '../game/api'
import { credentials } from '../game/auth'
import GameMap from '../game/Map'
import MarshalTools from '../game/MarshalTools'
import PingRipple from '../game/PingRipple'
import RescueBanner from '../game/RescueBanner'
import SosTakeover from '../game/SosTakeover'
import { useServerNow } from '../game/time'
import { useWakeLock } from '../game/useWakeLock'
import { Screen } from '../game/ui'
import { GameClock } from '../game/ChaseLayout'
import { Feed } from './RunnerChase'
import { PlayAgain, ResultsSummary } from './Results'

/**
 * Everyone live, plus the safety tools: alerts, pause and removing players. Marshals and the organiser stay
 * here after the whistle too (so the After game inbox is still in reach), with the results summary on top.
 */
export default function MarshalLive({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const now = useServerNow(view.now)
  useWakeLock(view.phase === 'hiding' || view.phase === 'chasing')
  // SOS takeovers this marshal stepped out of with "See the map first"; the pinned SOS row brings one back.
  // Alert ids are event ids, never reused, so a closed SOS's id staying in here is harmless.
  const [dismissed, setDismissed] = useState<string[]>([])
  const pins = view.alerts.flatMap((a) => (!a.handled && a.where ? [{ id: a.id, ...a.where }] : []))
  // The most-recently-opened unhandled SOS this marshal hasn't stepped out of (view.alerts is already
  // open-newest-first). With two or more open at once — rare, untested by this plan — sosPositions can't be
  // matched to a specific alert by player id (Alert carries no sender id), so senderPos below is deliberately
  // null and the takeover's map section just doesn't render; everything else about the takeover still works.
  const openSos = view.alerts.find((a) => a.kind === 'sos' && !a.handled && !dismissed.includes(a.id))
  const myPos = view.dots.find((d) => d.kind === 'me')
  const senderPositions = Object.values(view.sosPositions)
  const senderPos = senderPositions.length === 1 ? senderPositions[0] : null
  const ended = view.phase === 'ended'

  return (
    <Screen eyebrow={view.phase === 'hiding' ? 'Marshal · hide phase' : 'Marshal · live'}>
      {ended && (
        <>
          <ResultsSummary view={view} />
          {view.me.id === 'host' && <PlayAgain />}
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <GameClock view={view} />
          {view.paused && <span className="pill pill-on">PAUSED</span>}
        </span>
        <span className="muted">
          {view.counts.runnersFree} free · {view.counts.runnersJailed} in Penjara ·{' '}
          {view.counts.runnersLuarGarisan > 0 && `${view.counts.runnersLuarGarisan} Luar Garisan · `}
          {view.counts.chasers} Kejar
        </span>
      </div>
      <RescueBanner view={view} />
      <PingRipple role="marshal" lastRevealAt={view.lastRevealAt} now={now} />
      <GameMap arena={view.arena} dots={view.dots} stations={view.stations} pins={pins} height={340} />
      <MarshalTools
        code={code}
        view={view}
        refresh={refresh}
        onOpenSos={(id) => setDismissed((ids) => ids.filter((d) => d !== id))}
      />
      <Feed view={view} />
      {openSos && (
        <SosTakeover
          // One instance per alert: a new SOS starts with no outcome chosen and nothing in flight.
          key={openSos.id}
          alert={openSos}
          arena={view.arena}
          myPos={myPos ? { lat: myPos.lat, lng: myPos.lng } : null}
          senderPos={senderPos}
          onRespond={() => call('respondToSos', { code, ...credentials(code), eventId: openSos.id }).then(refresh)}
          onClose={(outcome) => call('handleAlert', { code, ...credentials(code), eventId: openSos.id, outcome }).then(refresh)}
          onDismiss={() => setDismissed((ids) => [...ids, openSos.id])}
        />
      )}
    </Screen>
  )
}
