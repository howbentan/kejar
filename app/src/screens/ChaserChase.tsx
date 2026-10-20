import { useCallback, useState } from 'react'
import type { CatchJudgement } from '../../shared/catch.js'
import { tagIdFromQr } from '../../shared/ids.js'
import type { View } from '../../shared/views.js'
import { call } from '../game/api'
import { currentCoords } from '../game/here'
import GameMap from '../game/Map'
import Scanner from '../game/Scanner'
import { loadSession } from '../game/session'
import { clock, useServerNow } from '../game/time'
import { ErrorText, Screen } from '../game/ui'
import { Feed, GameClock } from './RunnerChase'

const REJECTIONS: Record<string, string> = {
  'too-far': 'Too far — get within 50 m',
  'already-caught': 'Already caught',
  'unknown-tag': "That's not a Kejar tag",
  'not-chasing': 'You can only catch during the chase',
  'not-a-chaser': 'Only chasers can catch',
  'no-location': 'Turn on location to catch',
}

export function catchMessage(text: string, r: CatchJudgement): string {
  const tag = tagIdFromQr(text)
  const label = tag === null ? 'runner' : `#${String(tag).padStart(2, '0')}`
  if (r.ok) return r.flagged ? `Caught ${label} — flagged for marshal` : `Caught ${label} ✓`
  return REJECTIONS[r.reason] ?? 'Catch not recorded'
}

export default function ChaserChase({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const now = useServerNow(view.now)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const lastPing = view.feed.find((f) => f.text.startsWith('Ping'))

  const onScan = useCallback(
    async (text: string) => {
      setScanning(false)
      setError('')
      try {
        const here = await currentCoords()
        const r = await call<CatchJudgement>('catch', { code, token: loadSession(localStorage, code).token, tagQr: text, ...here })
        setResult(catchMessage(text, r))
        refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [code, refresh],
  )

  return (
    <Screen eyebrow="Chaser">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <GameClock view={view} />
        <span className="muted">{view.counts.runnersFree} runners free</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="card" style={{ flex: 1 }}>
          <p className="eyebrow">Last ping</p>
          <p className="mono" style={{ fontSize: 18 }}>
            {lastPing ? clock(now - Date.parse(lastPing.at)) + ' ago' : '—'}
          </p>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <p className="eyebrow">Next ping</p>
          <p className="mono" style={{ fontSize: 18, color: 'var(--volt)' }}>
            {view.nextRevealAt ? clock(view.nextRevealAt - now) : '—'}
          </p>
        </div>
      </div>
      <GameMap arena={view.arena} dots={view.dots} height={300} />
      {result && (
        <p role="status" style={{ fontWeight: 600 }}>
          {result}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      {scanning ? (
        <Scanner onResult={onScan} onCancel={() => setScanning(false)} />
      ) : (
        <button className="btn" onClick={() => setScanning(true)}>
          Scan ripped tag
        </button>
      )}
      <Feed view={view} />
    </Screen>
  )
}
