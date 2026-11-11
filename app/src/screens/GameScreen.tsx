import { useEffect, useRef, useState, type ReactNode } from 'react'
import { loadOrganiserSession } from '../game/organiserSession'
import HowToPlay from '../game/HowToPlay'
import { call } from '../game/api'
import { shouldPlay } from '../game/moments'
import { loadSession } from '../game/session'
import SosIcon from '../game/SosIcon'
import { ErrorText, Screen } from '../game/ui'
import { useGameState, type LocationMode } from '../game/useGameState'
import ChaserChase from './ChaserChase'
import Hide from './Hide'
import { useReelHold } from '../game/PenjaraReel'
import Jail from './Jail'
import Lobby from './Lobby'
import LuarGarisan from './LuarGarisan'
import MarshalLive from './MarshalLive'
import Paused from './Paused'
import Removed from './Removed'
import Results from './Results'
import RunnerChase from './RunnerChase'
import type { View } from '../../shared/views.js'

// A disqualified (Luar Garisan) runner deliberately keeps sending location while the app is open: it only feeds
// the marshals' safety map and SOS, and nothing about the round depends on it.
function locationMode(view: View | null): LocationMode {
  if (!view || view.phase === 'lobby' || view.phase === 'ended' || view.me.id === 'host' || view.me.removed_at) return 'never'
  if (view.me.role === 'chaser' || view.me.role === 'marshal') return 'always'
  return view.me.jailed ? 'never' : 'when-open'
}

/**
 * How long the Penjara screen stays up after Settle frees this player, so the ticket's SETTLE stamp (design doc
 * §6) actually gets seen, instead of the next 3s poll yanking `jailed: false` straight to RunnerChase.
 */
const FREED_MOMENT_MS = 2_500

export default function GameScreen({ code }: { code: string }) {
  const session = loadSession(localStorage, code)
  const signedIn = !!(session.token || loadOrganiserSession(localStorage))
  useEffect(() => {
    if (!signedIn) window.location.assign(`/join/${code}`)
  }, [signedIn, code])

  const { view: current, error, refresh, locationOff } = useGameState(code, { sendLocation: locationMode })
  const hostInLobby = current?.phase === 'lobby' && current.me.id === 'host'
  useEffect(() => {
    if (hostInLobby) window.location.assign(`/host/${code}`)
  }, [hostInLobby, code])

  // Settle freed this player -- themself by scanning, or one of the up to 2 others picked alongside them --
  // either way their own poll is what tells them. Hold the Penjara screen a beat longer so they actually see it.
  // Computed during render (React's "adjusting state when a prop changes" pattern), not in a useEffect: an
  // effect-driven update runs after commit, so there would be one real render in between with jailed: false
  // and showingFreed still false -- Jail would actually unmount for that render, losing its own state (the
  // lastReason ref in Jail.tsx that remembers whether this was a catch or an auto-jail) before the effect had
  // a chance to bring it back.
  const [showingFreed, setShowingFreed] = useState(false)
  const [story, setStory] = useState(false)
  // The Penjara reel's pull may free this runner before its scroll has stopped: keep Penjara up until the result is read.
  const reelHold = useReelHold()
  const playedFreedAt = useRef<string | null>(null)
  const freedAt = current?.me.freed_at ?? null
  if (current && freedAt && freedAt !== playedFreedAt.current) {
    playedFreedAt.current = freedAt
    if (shouldPlay('freed', freedAt, current.now, sessionStorage)) setShowingFreed(true)
  }
  useEffect(() => {
    if (!showingFreed) return
    const t = window.setTimeout(() => setShowingFreed(false), FREED_MOMENT_MS)
    return () => window.clearTimeout(t)
  }, [showingFreed])

  if (!current) {
    return (
      <Screen eyebrow={`kejar. · game ${code}`}>
        <p className="muted">Loading…</p>
        <ErrorText>{error}</ErrorText>
      </Screen>
    )
  }
  if (current.me.removed_at) return <Removed />
  if (current.phase === 'lobby') return <Lobby code={code} view={current} refresh={refresh} />
  if (current.me.role === 'marshal') return <MarshalLive code={code} view={current} refresh={refresh} />
  if (current.phase === 'ended') return <Results code={code} view={current} isHost={current.me.id === 'host'} />

  // Runners and chasers: their screen, with the Help and SOS icon in the same corner on every one.
  let screen: ReactNode
  if (current.paused) screen = <Paused view={current} />
  else if (current.me.role === 'runner' && current.me.disqualified_at) screen = <LuarGarisan view={current} />
  else if (current.phase === 'hiding') screen = <Hide code={code} view={current} />
  else if (current.me.role === 'runner' && (current.me.jailed || showingFreed || reelHold)) screen = <Jail code={code} view={current} />
  else if (current.me.role === 'chaser') screen = <ChaserChase code={code} view={current} refresh={refresh} />
  else screen = <RunnerChase code={code} view={current} locationOff={locationOff} />
  const side = current.me.role === 'runner' || current.me.role === 'chaser' ? current.me.role : null
  return (
    <>
      {screen}
      <SosIcon code={code} view={current} />
      {side && (
        <button
          type="button"
          onClick={() => setStory(true)}
          style={{ all: 'unset', cursor: 'pointer', position: 'fixed', left: 14, bottom: 8, zIndex: 20, fontSize: 11, opacity: 0.55, textDecoration: 'underline' }}
        >
          How to play
        </button>
      )}
      {side && story && (
        <HowToPlay
          side={side}
          mode={current.settings.mode}
          snapshot={current.settings.chaserSnapshot === true}
          onClose={() => setStory(false)}
          onReady={() => {
            if (session.token) void call('briefReady', { code, token: session.token }).then(refresh, () => {})
          }}
        />
      )}
    </>
  )
}
