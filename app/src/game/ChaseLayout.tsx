import { useCallback, useState, type ReactNode } from 'react'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { currentCoords } from './here'
import GameMap from './Map'
import FloodBanner from './FloodBanner'
import HowToPlayLink from './HowToPlayLink'
import { stationQr, tagQr } from '../../shared/ids.js'
import { rippleOrigin } from './ripple'
import Scanner from './Scanner'
import SideQuest from './SideQuest'
import { scanTarget, type ScanTarget } from './scan'
import { loadSession } from './session'
import Ticker from './Ticker'
import { clock, useServerNow } from './time'
import { Busy } from './Runner'

export function GameClock({ view }: { view: View }) {
  const ticking = useServerNow(view.now)
  // While paused the server holds the time left still, so don't tick between polls.
  const now = view.paused ? view.now : ticking
  // '5 minutes left' (rules §2.7): lime for the rest of the game, on the chase top bar and the marshal's clock alike.
  return <span className={view.fiveLeft ? 'mono clock-lime' : 'mono'}>{clock((view.endsAt ?? now) - now)}</span>
}

/** Remembered per game so a closed side quest stays closed after a reload. Storage may be blocked: then it just reopens. */
const closedKey = (code: string) => `sidequest-closed:${code}`
function wasClosed(code: string): boolean {
  try {
    return localStorage.getItem(closedKey(code)) === '1'
  } catch {
    return false
  }
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
  /** A full-screen moment for a good scan (the catch stamp, the lucky dip), or null for just the line. */
  momentFor?: (s: Scanned, text: string, result: unknown, done: () => void) => ReactNode | null
  onScanned?: () => void
}) {
  const { code, view, side, describe, momentFor, onScanned } = props
  // The scanner's hint: the usual one, or the side quest's while the player is looking for the slip.
  const [scanning, setScanning] = useState<{ hint?: string } | null>(null)
  const [questClosed, setQuestClosed] = useState(() => wasClosed(code))
  // Found hides the card for now only: after a reload it shows again while the side quest is on.
  const [questAside, setQuestAside] = useState(false)
  const questHidden = questClosed || questAside
  const [result, setResult] = useState('')
  const [moment, setMoment] = useState<ReactNode | null>(null)
  // A scan still on its way: no second scan until it answers (a slow claim mustn't let another through).
  const [busy, setBusy] = useState(false)

  const onScan = useCallback(
    async (text: string) => {
      setScanning(null)
      const target = scanTarget(text, side)
      if ('error' in target) return setResult(target.error)
      setBusy(true)
      try {
        const here = await currentCoords()
        const r = await call(target.action, { code, token: loadSession(localStorage, code).token, ...target.body, ...here })
        setResult(describe(target, text, r))
        const m = momentFor?.(target, text, r, () => setMoment(null))
        if (m) setMoment(m)
        onScanned?.()
      } catch (e) {
        setResult(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [code, side, describe, momentFor, onScanned],
  )

  const openScanner = (hint?: string) => setScanning({ hint })
  const closeQuest = () => {
    setQuestClosed(true)
    try {
      localStorage.setItem(closedKey(code), '1')
    } catch {
      // Private mode: it reopens next load, which is harmless.
    }
  }

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
        <GameMap
          arena={view.arena}
          dots={view.dots}
          stations={view.stations}
          height="100%"
          snapshot={view.chaserSnapshot}
          tollGates={view.tollGates}
          flood={view.endgame?.flood ?? null}
          ripple={view.lastRevealAt ? { at: view.lastRevealAt, origin: rippleOrigin(view.dots, view.arena) } : null}
        />
        <div className="chase-over">
          <FloodBanner view={view} />
          <div className="chase-chips">
            {props.chips}
            {view.sideQuest && questHidden && (
              <button type="button" className="chip chip-quest" onClick={() => { setQuestClosed(false); setQuestAside(false) }}>
                Side quest
              </button>
            )}
            <HowToPlayLink code={code} view={view} />
          </div>
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
          <button type="button" className={`scan ${props.scanClass}`} disabled={!!moment || busy} aria-busy={busy || undefined} onClick={() => openScanner()}>
            <Busy busy={busy} label="Checking" height={props.scanClass === 'scan-runner' ? 18 : 24} stack={props.scanClass === 'scan-runner'}>{props.scanLabel}</Busy>
          </button>
        </div>
        <Ticker feed={view.feed} />
      </footer>
      {moment}
      {view.sideQuest && !questHidden && (
        <SideQuest
          onClose={closeQuest}
          onFound={() => {
            setQuestAside(true)
            openScanner('Scan the slip inside')
          }}
        />
      )}
      {scanning && (
        <div className="scan-overlay">
          <Scanner
            onResult={onScan}
            onCancel={() => setScanning(null)}
            hint={scanning.hint ?? (side === 'runner' ? 'Point at the station or Penjara card' : 'Point at the tag or station card')}
            // No camera (blocked or broken): type the number printed on the card. The server still checks reach.
            // The side quest's slip has no number to type, so it gets no fallback.
            numberFallback={
              scanning.hint
                ? undefined
                : side === 'runner'
                  ? { label: 'Or type the station number', onNumber: (n) => onScan(stationQr(n)) }
                  : { label: 'Or type the tag number', onNumber: (n) => onScan(tagQr(n)) }
            }
          />
        </div>
      )}
    </main>
  )
}
