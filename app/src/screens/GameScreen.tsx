import { useEffect } from 'react'
import { loadSession } from '../game/session'
import { ErrorText, Screen } from '../game/ui'
import { useGameState, type LocationMode } from '../game/useGameState'
import ChaserChase from './ChaserChase'
import Hide from './Hide'
import Jail from './Jail'
import Lobby from './Lobby'
import MarshalLive from './MarshalLive'
import Results from './Results'
import RunnerChase from './RunnerChase'
import type { View } from '../../shared/views.js'

function locationMode(view: View | null): LocationMode {
  if (!view || view.phase === 'lobby' || view.phase === 'ended' || view.me.id === 'host') return 'never'
  if (view.me.role === 'chaser' || view.me.role === 'marshal') return 'always'
  return view.me.jailed ? 'never' : 'when-open'
}

export default function GameScreen({ code }: { code: string }) {
  const session = loadSession(localStorage, code)
  const signedIn = !!(session.token || session.hostKey)
  useEffect(() => {
    if (!signedIn) window.location.assign(`/join/${code}`)
  }, [signedIn, code])

  const { view: current, error, refresh } = useGameState(code, { sendLocation: locationMode })
  const hostInLobby = current?.phase === 'lobby' && current.me.id === 'host'
  useEffect(() => {
    if (hostInLobby) window.location.assign(`/host/${code}`)
  }, [hostInLobby, code])

  if (!current) {
    return (
      <Screen eyebrow={`kejar. · game ${code}`}>
        <p className="muted">Loading…</p>
        <ErrorText>{error}</ErrorText>
      </Screen>
    )
  }
  if (current.phase === 'ended') return <Results view={current} isHost={!!session.hostKey} />
  if (current.phase === 'lobby') return <Lobby code={code} view={current} refresh={refresh} />
  if (current.me.role === 'marshal') return <MarshalLive view={current} />
  if (current.phase === 'hiding') return <Hide view={current} />
  if (current.me.role === 'runner' && current.me.jailed) return <Jail code={code} view={current} />
  if (current.me.role === 'chaser') return <ChaserChase code={code} view={current} refresh={refresh} />
  return <RunnerChase code={code} view={current} />
}
