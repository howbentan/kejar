import { FullLoader } from '../game/Runner'
import type { Exit } from '../game/homeLogo/exits'
import { ErrorText } from '../game/ui'

/**
 * Opening a game: the full-size loader (the home screen's logo at exactly the same size and spot, with the j
 * running on the spot) until the game arrives, then the j clears the screen its `exit` way (`leaving`) before the game shows.
 */
export default function GameLoading({
  code,
  error,
  leaving = false,
  exit,
  onLeft,
}: {
  code: string
  error?: string | null
  leaving?: boolean
  exit?: Exit
  onLeft?: () => void
}) {
  return (
    <FullLoader caption={`JOM, LOADING GAME ${code.toUpperCase()}`} leaving={leaving} exit={exit} onLeft={onLeft}>
      {error && (
        <div className="home-error">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </FullLoader>
  )
}
