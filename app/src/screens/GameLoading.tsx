import { FullLoader } from '../game/Runner'
import { ErrorText } from '../game/ui'

/**
 * Opening a game: the full-size loader (the home screen's logo at exactly the same size and spot, with the j
 * running on the spot) until the game arrives, then the j sprints off the right edge (`leaving`) before the game shows.
 */
export default function GameLoading({ code, error, leaving = false, onLeft }: { code: string; error?: string | null; leaving?: boolean; onLeft?: () => void }) {
  return (
    <FullLoader caption={`JOM, LOADING GAME ${code.toUpperCase()}`} leaving={leaving} onLeft={onLeft}>
      {error && (
        <div className="home-error">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </FullLoader>
  )
}
