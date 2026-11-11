import { useCallback, useState } from 'react'
import { tagIdFromQr } from '../../shared/ids.js'
import type { View } from '../../shared/views.js'
import AlertsCard from '../game/AlertsCard'
import HowToPlay from '../game/HowToPlay'
import { call } from '../game/api'
import { loadSession } from '../game/session'
import Scanner from '../game/Scanner'
import SetupMap from '../game/SetupMap'
import WalkPark from './WalkPark'
import { ErrorText, ModeBadge, Screen, tagText } from '../game/ui'

const ROLE_COPY = {
  runner: 'You’re a Dikejar. Hide when the game starts.',
  chaser: 'You’re a Kejar. Stay put while Dikejar hide.',
  marshal: 'You’re a Marshal. Keep everyone safe.',
}

export default function Lobby({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [walking, setWalking] = useState(false)
  const [story, setStory] = useState<boolean | null>(null) // null: follow the organiser's briefing; true/false: the player chose
  const role = view.me.role

  const link = useCallback(
    async (tagId: number | null) => {
      setScanning(false)
      if (tagId === null) return setError('That’s not a Kejar tag')
      try {
        await call('linkTag', { code, token: loadSession(localStorage, code).token, tagId })
        setError('')
        refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [code, refresh],
  )
  const onScan = useCallback((text: string) => void link(tagIdFromQr(text)), [link])

  const token = loadSession(localStorage, code).token
  const side = role === 'runner' || role === 'chaser' ? role : null
  const briefing = view.briefing && 'open' in view.briefing ? view.briefing : null
  const showStory = side !== null && (story ?? briefing?.open === true)
  const tell = (action: 'briefOpened' | 'briefReady') => {
    if (!token) return
    void call(action, { code, token }).then(refresh, () => {})
  }
  if (walking && role === 'marshal' && token) {
    return <WalkPark code={code} view={view} credentials={{ token }} refresh={refresh} onBack={() => setWalking(false)} />
  }

  if (showStory && side) {
    return (
      <HowToPlay
        side={side}
        mode={view.settings.mode}
        snapshot={view.settings.chaserSnapshot === true}
        onClose={() => setStory(false)}
        onOpened={() => tell('briefOpened')}
        onReady={() => tell('briefReady')}
      />
    )
  }

  return (
    <Screen eyebrow={`kejar. · game ${code}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>Hi {view.me.name}</h1>
        <ModeBadge mode={view.settings.mode} />
      </div>
      <p className="muted">{role ? ROLE_COPY[role] : 'Waiting for the organiser to give you a role…'}</p>
      {/* Marshals are the helper: the hidden card is the organiser's alone (rules doc §9b), so no panel here. */}
      {role === 'marshal' && <SetupMap view={view} />}
      {role === 'marshal' && token && (
        <button type="button" className="btn btn-ghost" onClick={() => setWalking(true)}>
          Walk the park
        </button>
      )}

      {role === 'runner' && (
        <div className="card">
          <p className="eyebrow">Your tag</p>
          <p className="mono" style={{ fontSize: 28, fontWeight: 600 }}>
            {tagText(view.me.tag_id)}
          </p>
          {!scanning && (
            <button className="btn" style={{ marginTop: 10 }} onClick={() => setScanning(true)}>
              {view.me.tag_id === null ? 'Scan your tag' : 'Scan a different tag'}
            </button>
          )}
        </div>
      )}
      {scanning && (
        <Scanner
          onResult={onScan}
          onCancel={() => setScanning(false)}
          numberFallback={{ label: 'Or type the tag number', onNumber: (n) => void link(n) }}
        />
      )}
      {side && (
        <button type="button" className="btn btn-ghost" onClick={() => setStory(true)}>
          How to play
        </button>
      )}
      <ErrorText>{error}</ErrorText>
      <AlertsCard code={code} view={view} onDone={refresh} />
      <p className="muted">Waiting for the organiser to start the game…</p>
    </Screen>
  )
}
