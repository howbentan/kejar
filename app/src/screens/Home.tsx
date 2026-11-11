import { useState } from 'react'
import CatchTheJ from '../game/catchJ/CatchTheJ'
import HowToPlay from '../game/HowToPlay'
import { reconnectHref } from '../game/lastGame'
import HomeJoin from './HomeJoin'

/**
 * The home screen (design 2026-11-12): the logo as a toy to play with while friends gather, then the ways
 * out. The buttons sit below the toy's play area, so a tap on them is never a tap on the toy.
 */
export default function Home() {
  const [joining, setJoining] = useState(false)
  const [story, setStory] = useState(false)
  // Reading localStorage itself throws when the browser blocks site data; home must still work then.
  const [reconnect] = useState(() => {
    try {
      return reconnectHref(localStorage)
    } catch {
      return null
    }
  })

  return (
    <main className="home">
      <div className="home-play">
        <CatchTheJ paused={joining || story} />
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
