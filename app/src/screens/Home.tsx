import { useEffect, useRef, useState } from 'react'
import HomeLogo from '../game/homeLogo/HomeLogo'
import HowToPlay from '../game/HowToPlay'
import { reconnectHref } from '../game/lastGame'
import HomeJoin from './HomeJoin'

const OPENED = 'kejar.opened'

/** Has the opening already played in this visit? Storage can be blocked; then it simply plays again. */
function openedThisVisit(): boolean {
  try {
    return sessionStorage.getItem(OPENED) === '1'
  } catch {
    return false
  }
}

/**
 * The home screen (design 2026-11-12, running-j revision): the logo with its j running on the spot, tap it to
 * jump, and the ways out below. On a fresh open it plays the opening first: lime, the logo in black, the j runs
 * in from the left to its gap, the colours flip, and the buttons come up. The buttons sit below the logo's
 * area, so a tap on them never makes the j jump.
 */
export default function Home() {
  const [joining, setJoining] = useState(false)
  const [story, setStory] = useState(false)
  // run-in: lime, j running in; flip: colours changing over; home: settled.
  const [stage, setStage] = useState<'run-in' | 'flip' | 'home'>(() => (openedThisVisit() ? 'home' : 'run-in'))
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

  const arrived = () => {
    timers.current.push(
      window.setTimeout(() => setStage('flip'), 120),
      window.setTimeout(() => setStage('home'), 380),
    )
  }

  return (
    <main className={`home${stage === 'run-in' ? ' opening' : ''}${stage !== 'home' ? ' arriving' : ''}`}>
      <div className="home-play">
        <HomeLogo mode={stage === 'run-in' ? 'opening' : joining || story ? 'loading' : 'home'} inverted={stage === 'run-in'} onArrived={arrived} />
      </div>
      {joining ? (
        <HomeJoin onBack={() => setJoining(false)} />
      ) : (
        <div className="home-actions">
          {reconnect && (
            <a className="btn btn-paper" href={reconnect}>
              reconnect
            </a>
          )}
          <button type="button" className="btn" onClick={() => setJoining(true)}>
            join game
          </button>
          <a className="btn btn-ghost" href="/host/new">
            organise game
          </a>
          <button type="button" className="home-link" onClick={() => setStory(true)}>
            if dk how to play click here :)
          </button>
        </div>
      )}
      {story && <HowToPlay side="runner" mode="core" snapshot={false} onClose={() => setStory(false)} />}
    </main>
  )
}
