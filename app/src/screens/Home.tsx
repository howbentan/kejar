import { useEffect, useRef, useState } from 'react'
import DrawnNumber from '../game/drawn/DrawnNumber'
import { formatLeft } from '../game/drawn/formatLeft'
import HomeLogo from '../game/homeLogo/HomeLogo'
import { startsIn, type HomeStatus } from '../game/homeStatus'
import HowToPlay from '../game/HowToPlay'
import { reconnectHref } from '../game/lastGame'
import Scanner from '../game/Scanner'
import { pickTip, TIPS } from '../game/tips'
import { ErrorText } from '../game/ui'
import HomeJoin, { joinCodeFrom } from './HomeJoin'
import ReconnectCard from './ReconnectCard'

const OPENED = 'kejar.opened'

/** Has the opening already played in this visit? Storage can be blocked; then it simply plays again. */
function openedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(OPENED) === '1'
  } catch {
    return false
  }
}

/** The code inside a reconnect link (`/g/ABC234` or `/host/ABC234`). */
const codeOf = (href: string) => href.split('/').pop() ?? ''

/**
 * The home screen (design 2026-11-12, running-j revision, plus the home upgrades): the logo with its j running on
 * the spot (tap to jump, three quick taps to backflip), a tip or the countdown to your game's planned start under it,
 * and the ways out below: reconnect (a card that says where your game is at), join game with a scan button beside
 * it, organise game. On a fresh open it plays the opening first. The buttons, the tip and the countdown sit outside
 * the logo's tap area, so a tap on them never makes the j jump.
 */
export default function Home() {
  const [joining, setJoining] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [story, setStory] = useState(false)
  // run-in: lime, j running in; flip: colours changing over; home: settled.
  const [stage, setStage] = useState<'run-in' | 'flip' | 'home'>(() => (openedThisVisit() ? 'home' : 'run-in'))
  const [tip, setTip] = useState(() => pickTip(Math.random))
  const [status, setStatus] = useState<HomeStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const timers = useRef<number[]>([])
  // Reading localStorage itself throws when the browser blocks site data; home must still work then.
  const [reconnect] = useState(() => {
    try {
      return reconnectHref(localStorage)
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(OPENED, '1')
    } catch {
      // Blocked storage: the opening plays again next time, which is fine.
    }
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  // The countdown to the planned start ticks once a second, and stops at zero.
  const left = status ? startsIn(status, now) : null
  useEffect(() => {
    if (left === null || left <= 0) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [left === null, left !== null && left <= 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const arrived = () => {
    timers.current.push(
      window.setTimeout(() => setStage('flip'), 120),
      window.setTimeout(() => setStage('home'), 380),
    )
  }

  const onScan = (text: string) => {
    const code = joinCodeFrom(text)
    if (code) {
      window.location.assign(`/join/${code}`)
      return
    }
    setScanning(false)
    setScanError('That QR is not a kejar game.')
  }

  const settled = stage === 'home'
  const busy = joining || story || scanning
  return (
    <main className={`home${stage === 'run-in' ? ' opening' : ''}${stage !== 'home' ? ' arriving' : ''}`}>
      <div className="home-play">
        <HomeLogo mode={stage === 'run-in' ? 'opening' : busy ? 'loading' : 'home'} inverted={stage === 'run-in'} onArrived={arrived} />
        {settled && left !== null ? (
          <div className="home-under home-countdown">
            <p className="eyebrow">{`GAME ${status?.code} STARTS IN`}</p>
            {left > 0 ? <DrawnNumber text={formatLeft(left)} /> : <p className="home-soon">starting soon</p>}
          </div>
        ) : (
          settled && (
            <button type="button" className="home-under home-tip" onClick={() => setTip((i) => (i + 1) % TIPS.length)}>
              <span className="eyebrow">TIP</span>
              <span className="home-tip-line">
                <b>{TIPS[tip].name}</b>
                {TIPS[tip].rest}
              </span>
            </button>
          )
        )}
      </div>
      {joining ? (
        <HomeJoin onBack={() => setJoining(false)} />
      ) : (
        <div className="home-actions">
          <ErrorText>{scanError}</ErrorText>
          {reconnect && <ReconnectCard href={reconnect} code={codeOf(reconnect)} onStatus={(s) => {
                setStatus(s)
                setNow(Date.now())
              }} />}
          <div className="home-join-row">
            <button type="button" className="btn" onClick={() => setJoining(true)}>
              join game
            </button>
            <button
              type="button"
              className="home-scan-btn"
              aria-label="scan qr"
              onClick={() => {
                setScanError('')
                setScanning(true)
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" />
                <rect x="8" y="8" width="8" height="8" rx="1.5" />
              </svg>
            </button>
          </div>
          <a className="btn btn-ghost" href="/host/new">
            organise game
          </a>
          <button type="button" className="home-link" onClick={() => setStory(true)}>
            if dk how to play click here :)
          </button>
        </div>
      )}
      {scanning && (
        <div className="home-scanner" role="dialog" aria-label="Scan the game's QR code">
          <Scanner onResult={onScan} onCancel={() => setScanning(false)} hint="point at the game's qr code" />
        </div>
      )}
      {story && <HowToPlay side="runner" mode="core" snapshot={false} onClose={() => setStory(false)} />}
    </main>
  )
}
