import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { resumeDip } from './LuckyDip'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { currentCoords, lastCoords } from './here'
import { distanceM } from '../../shared/geo.js'
import { CLAIM_RADIUS_M, slotCapacity } from '../../shared/powerups.js'
import GameMap from './Map'
import { PanelStack } from './ComicPanel'
import { floodPanel, powerPanels } from './statePanels'
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

/**
 * Counts up each time the phone comes within claim reach of a station that's open while there's a free slot, so the
 * Scan button wiggles once (and buzzes). A station only does it again after walking away (40 m) and back.
 */
function useNearStationWiggle(view: View): number {
  const [count, setCount] = useState(0)
  const near = useRef(new Set<number>())
  const latest = useRef(view)
  latest.current = view
  useEffect(() => {
    const id = window.setInterval(() => {
      const here = lastCoords(15_000)
      if (!here) return
      const v = latest.current
      const capacity = slotCapacity(v.settings.mode)
      const used = v.hand.filter((u) => !u.twin_of).reduce((n, u) => n + (u.kind === 'dato' ? capacity : 1), 0) + v.activePowerUps.length
      for (const s of v.stations) {
        const d = distanceM(here, s)
        if (d > 40) near.current.delete(s.n)
        else if (d <= CLAIM_RADIUS_M && !near.current.has(s.n)) {
          near.current.add(s.n)
          const open = !s.lockedUntil || Date.parse(s.lockedUntil) <= Date.now()
          if (open && used < capacity) {
            setCount((c) => c + 1)
            navigator.vibrate?.(40)
          }
        }
      }
    }, 2_000)
    return () => window.clearInterval(id)
  }, [])
  return count
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
 * Scan button; the feed is the bell at the top right. Nothing scrolls.
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
  /** After every answered scan, with what was scanned and the answer (the runner's Penjara scan opens the rescue). */
  onScanned?: (s: Scanned, text: string, result: unknown) => void
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
  const wiggle = useNearStationWiggle(view)
  const ticking = useServerNow(view.now)
  const panelNow = view.paused ? view.now : ticking
  // An open pick left from before a reload comes back on screen.
  const openDeal = view.deal
  useEffect(() => {
    if (!openDeal || moment) return
    const m = resumeDip(code, openDeal, view.deckLeft, () => setMoment(null))
    if (m) setMoment(m)
  }, [openDeal, moment, code, view.deckLeft])
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
        onScanned?.(target, text, r)
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
          serverNow={view.now}
          height="100%"
          snapshot={view.chaserSnapshot}
          tollGates={view.tollGates}
          flood={view.endgame?.flood ?? null}
          ripple={view.lastRevealAt ? { at: view.lastRevealAt, origin: rippleOrigin(view.dots, view.arena) } : null}
        />
        <div className="chase-over">
          <div className="chase-chips">
            {/* The comic panels (design 2026-11-24 §3): the screen's own, then the flood and my running power-ups. */}
            <PanelStack>
              {props.chips}
              {floodPanel(view, panelNow)}
              {powerPanels(view.activePowerUps)}
            </PanelStack>
            {view.sideQuest && questHidden && (
              <button type="button" className="chip chip-quest" onClick={() => { setQuestClosed(false); setQuestAside(false) }}>
                Tupperware
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
          <button key={`scan-${wiggle}`} type="button" className={`scan ${props.scanClass}${wiggle ? ' scan-wiggle' : ''}`} disabled={!!moment || busy} aria-busy={busy || undefined} onClick={() => openScanner()}>
            <Busy busy={busy} label="Checking" height={18} stack>{props.scanLabel}</Busy>
          </button>
        </div>
      </footer>
      <Ticker feed={view.feed} />
      {moment}
      {view.sideQuest && !questHidden && (
        <SideQuest
          onClose={closeQuest}
          onTimeout={() => setQuestAside(true)}
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
                  : {
                      // A Kejar's card may be a tag or a station, so the number needs saying which.
                      label: 'Or type the number',
                      onNumber: (n) => onScan(tagQr(n)),
                      buttons: [
                        { label: 'Tag', onNumber: (n) => onScan(tagQr(n)) },
                        { label: 'Station', onNumber: (n) => onScan(stationQr(n)) },
                      ],
                    }
            }
          />
        </div>
      )}
    </main>
  )
}
