import HomeLogo from '../game/homeLogo/HomeLogo'
import { ErrorText } from '../game/ui'

/**
 * Opening a game: the home screen's logo at exactly the same size and spot, with the j running on the spot
 * until the game arrives, then sprinting off the right edge (`leaving`) before the game shows. The hidden block
 * below holds the same space as home's buttons (with reconnect showing), which keeps the logo where it was.
 */
export default function GameLoading({ code, error, leaving = false, onLeft }: { code: string; error?: string | null; leaving?: boolean; onLeft?: () => void }) {
  return (
    <main className="home">
      <div className="home-play">
        <HomeLogo
          mode={leaving ? 'leaving' : 'loading'}
          onLeft={onLeft}
          caption={
            <>
              LOADING GAME {code.toUpperCase()}
              <span className="dots" aria-hidden="true">
                <i>.</i>
                <i>.</i>
                <i>.</i>
              </span>
            </>
          }
        />
        {error && (
          <div className="home-error">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
      </div>
      <div className="home-actions" aria-hidden="true" style={{ visibility: 'hidden' }}>
        <span className="btn btn-paper">reconnect</span>
        <span className="btn">join game</span>
        <span className="btn btn-ghost">organise game</span>
        <span className="home-link">if dk how to play click here :)</span>
      </div>
    </main>
  )
}
