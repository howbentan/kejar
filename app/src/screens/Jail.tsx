import { useCallback, useState } from 'react'
import type { BreakJudgement } from '../../shared/catch.js'
import type { View } from '../../shared/views.js'
import { call } from '../game/api'
import { currentCoords } from '../game/here'
import GameMap from '../game/Map'
import Scanner from '../game/Scanner'
import { loadSession } from '../game/session'
import { ErrorText, Screen } from '../game/ui'
import { Feed } from './RunnerChase'

const BREAK_REJECTIONS: Record<string, string> = {
  'too-far-from-jail': 'Get within 30 m of the jail',
  'nobody-to-free': 'Nobody to free',
  'not-a-free-runner': 'Only free runners can break people out',
  'not-chasing': 'Jailbreaks only work during the chase',
  paused: 'Game is paused',
}

/** "Break them out" for free runners: scan the jail code to free everyone jailed (once each). */
export function BreakOut({ code, view }: { code: string; view: View }) {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  const onScan = useCallback(
    async (qr: string) => {
      setScanning(false)
      setError('')
      try {
        const here = await currentCoords()
        const r = await call<BreakJudgement>('jailbreak', { code, token: loadSession(localStorage, code).token, qr, ...here })
        setResult(r.ok ? `Freed ${r.freedIds.length} runner${r.freedIds.length === 1 ? '' : 's'} ✓` : BREAK_REJECTIONS[r.reason])
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [code],
  )

  if (view.me.role !== 'runner' || view.me.jailed || view.counts.runnersJailed === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {result && (
        <p role="status" style={{ fontWeight: 600 }}>
          {result}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      {scanning ? (
        <Scanner onResult={onScan} onCancel={() => setScanning(false)} />
      ) : (
        <button className="btn btn-ghost" onClick={() => setScanning(true)}>
          Break them out ({view.counts.runnersJailed} in jail)
        </button>
      )}
    </div>
  )
}

export default function Jail({ view }: { code: string; view: View }) {
  return (
    <Screen eyebrow="In jail">
      <p className="eyebrow">{view.caughtBy ? `Caught by ${view.caughtBy}` : 'Caught'}</p>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.05 }}>
        Walk to jail.
        <br />
        <span className="muted" style={{ fontSize: 22 }}>
          A marshal will give your tag back.
        </span>
      </h1>
      <p className="muted">
        {view.me.freed_once
          ? 'You’ve already been broken out once, so you stay in jail this time.'
          : 'A free runner can still break you out — once.'}
      </p>
      <GameMap arena={view.arena} dots={view.dots} height={240} />
      <p className="eyebrow" style={{ textAlign: 'center' }}>
        {`Spectator view · ${view.settings.spectatorDelayMin} min delayed`}
      </p>
      <Feed view={view} />
    </Screen>
  )
}
