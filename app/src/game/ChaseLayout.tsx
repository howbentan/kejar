import { useCallback, useState, type ReactNode } from 'react'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { currentCoords } from './here'
import GameMap from './Map'
import Scanner from './Scanner'
import { scanTarget, type ScanTarget } from './scan'
import { loadSession } from './session'
import Ticker from './Ticker'
import { clock, useServerNow } from './time'

export function GameClock({ view }: { view: View }) {
  const ticking = useServerNow(view.now)
  // While paused the server holds the time left still, so don't tick between polls.
  const now = view.paused ? view.now : ticking
  return <span className="mono">{clock((view.endsAt ?? now) - now)}</span>
}

type Scanned = Exclude<ScanTarget, { error: string }>

/**
 * The one-screen chase (motion design §8.1): a 44 px top bar, the status row (chips on the left; the SOS
 * icon sits on its right, drawn by GameScreen), the map filling the middle, and the dock with the slot, one
 * Scan button and the ticker. Nothing scrolls.
 */
export default function ChaseLayout(props: {
  code: string
  view: View
  title: string
  chips: ReactNode
  /** Banners and warnings that drop over the top of the map, below the status row. */
  overlay?: ReactNode
  slot: ReactNode
  scanLabel: string
  scanClass: string
  side: 'runner' | 'chaser'
  /** Turns a call's result into the line shown above the dock. */
  describe: (s: Scanned, text: string, result: unknown) => string
  onScanned?: () => void
}) {
  const { code, view, side, describe, onScanned } = props
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState('')

  const onScan = useCallback(
    async (text: string) => {
      setScanning(false)
      const target = scanTarget(text, side)
      if ('error' in target) return setResult(target.error)
      try {
        const here = await currentCoords()
        const r = await call(target.action, { code, token: loadSession(localStorage, code).token, ...target.body, ...here })
        setResult(describe(target, text, r))
        onScanned?.()
      } catch (e) {
        setResult(e instanceof Error ? e.message : String(e))
      }
    },
    [code, side, describe, onScanned],
  )

  return (
    <main className="chase">
      <header className="chase-top">
        <span className="chase-who">{props.title}</span>
        <span className="chase-clock">
          <GameClock view={view} />
        </span>
        <span className="chase-count">{`${view.counts.runnersFree} free`}</span>
      </header>
      <div className="chase-map">
        <GameMap arena={view.arena} dots={view.dots} stations={view.stations} height="100%" />
        <div className="chase-over">
          <div className="chase-chips">{props.chips}</div>
          {props.overlay}
        </div>
      </div>
      <footer className="dock">
        {result && (
          <div className="dock-pop">
            <button type="button" className="dock-pop-text" onClick={() => setResult('')}>
              <span role="status">{result}</span>
            </button>
          </div>
        )}
        <div className="dock-row">
          {props.slot}
          <button type="button" className={`scan ${props.scanClass}`} onClick={() => setScanning(true)}>
            {props.scanLabel}
          </button>
        </div>
        <Ticker feed={view.feed} />
      </footer>
      {scanning && (
        <div className="scan-overlay">
          <Scanner onResult={onScan} onCancel={() => setScanning(false)} />
        </div>
      )}
    </main>
  )
}
