import type { PowerUpKind } from '../../shared/types.js'
import { INFO } from './powerInfo'
import Sticker from './Sticker'

/**
 * A deck card, 96×150 (motion design §7). Face up: the same lime-framed layout for every power-up, no rarity
 * colours. Face down: the ornate brand back, identical for every card, so it gives nothing away.
 * `big` (150×234) is the revealed card in the lucky dip: laid out bigger, never scaled, so the marker finds its edges.
 */
export default function PowerCard({ kind, faceDown = false, wiggle = false, big = false }: { kind?: PowerUpKind; faceDown?: boolean; wiggle?: boolean; big?: boolean }) {
  if (faceDown || !kind) {
    return (
      <div className="power-card back" aria-label="Face-down card" role="img">
        <span className="pc-corner tl" />
        <span className="pc-corner tr" />
        <span className="pc-corner bl" />
        <span className="pc-corner br" />
        <span className="pc-seal">kejar.</span>
      </div>
    )
  }
  return (
    <div className={big ? 'power-card front big' : 'power-card front'}>
      <span className="pc-eyebrow">POWER-UP</span>
      <span className="pc-art">
        <Sticker kind={kind} size={big ? 104 : 64} tilt={-4} wiggle={wiggle} />
      </span>
      <b className="pc-name">{INFO[kind].name}</b>
      <span className="pc-effect">{INFO[kind].effect}</span>
    </div>
  )
}
