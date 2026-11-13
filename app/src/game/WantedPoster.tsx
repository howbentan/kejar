import type { View } from '../../shared/views.js'
import EndgameLogo, { isWanted, wantedLabel } from './EndgameLogo'
import Stamp from './Stamp'

/**
 * Hang Hebat's wanted poster (endgame design §8.3): the bounty's armband number and name, "DIKEHENDAKI · HANG HEBAT"
 * and the keris, on poster cream. Everyone can open it from the chip. Once the bounty is out it's stamped caught.
 */
export default function WantedPoster({ view }: { view: View }) {
  const w = view.endgame?.kind === 'hebat' ? view.endgame.wanted : null
  if (!w) return null
  return (
    <div className="wanted-poster">
      <p className="wanted-big">WANTED</p>
      <p className="wanted-sub">DIKEHENDAKI · HANG HEBAT</p>
      <div className="wanted-logo">
        <EndgameLogo kind="hebat" size={110} tilt={0} />
      </div>
      <p className="wanted-name">{wantedLabel(w)}</p>
      <p className="wanted-line">{isWanted(view) ? "That's you. Stay free till the whistle." : 'Catch them before the whistle.'}</p>
      <p className="wanted-reward">REWARD: THE WIN</p>
      {view.endgame!.bountyCaught && (
        <div className="wanted-caught">
          <Stamp text="caught!" plate />
        </div>
      )}
    </div>
  )
}
