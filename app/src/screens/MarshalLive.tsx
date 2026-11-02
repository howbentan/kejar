import type { View } from '../../shared/views.js'
import { call } from '../game/api'
import { credentials } from '../game/auth'
import GameMap from '../game/Map'
import MarshalTools from '../game/MarshalTools'
import PingRipple from '../game/PingRipple'
import SosTakeover from '../game/SosTakeover'
import { useServerNow } from '../game/time'
import { Screen } from '../game/ui'
import { GameClock } from '../game/ChaseLayout'
import { Feed } from './RunnerChase'

/** Everyone live, plus the safety tools: alerts, pause and removing players. */
export default function MarshalLive({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const now = useServerNow(view.now)
  const pins = view.alerts.flatMap((a) => (!a.handled && a.where ? [{ id: a.id, ...a.where }] : []))
  // The single most-recently-opened unhandled SOS (view.alerts is already open-newest-first). With two or more
  // open at once — rare, untested by this plan — sosPositions can't be matched to a specific alert by player id
  // (Alert carries no sender id), so senderPos below is deliberately null and the takeover's map section just
  // doesn't render; everything else about the takeover still works.
  const openSos = view.alerts.find((a) => a.kind === 'sos' && !a.handled)
  const myPos = view.dots.find((d) => d.kind === 'me')
  const senderPositions = Object.values(view.sosPositions)
  const senderPos = senderPositions.length === 1 ? senderPositions[0] : null

  return (
    <Screen eyebrow={view.phase === 'hiding' ? 'Marshal · hide phase' : 'Marshal · live'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <GameClock view={view} />
          {view.paused && <span className="pill pill-on">PAUSED</span>}
        </span>
        <span className="muted">
          {view.counts.runnersFree} free · {view.counts.runnersJailed} in Penjara · {view.counts.chasers} Kejar
        </span>
      </div>
      <PingRipple role="marshal" lastRevealAt={view.lastRevealAt} now={now} />
      <GameMap arena={view.arena} dots={view.dots} stations={view.stations} pins={pins} height={340} />
      <MarshalTools code={code} view={view} refresh={refresh} />
      <Feed view={view} />
      {openSos && (
        <SosTakeover
          alert={openSos}
          myPos={myPos ? { lat: myPos.lat, lng: myPos.lng } : null}
          senderPos={senderPos}
          onRespond={() => {
            call('respondToSos', { code, ...credentials(code), eventId: openSos.id }).then(refresh)
          }}
          onClose={(outcome) => {
            call('handleAlert', { code, ...credentials(code), eventId: openSos.id, outcome }).then(refresh)
          }}
        />
      )}
    </Screen>
  )
}
