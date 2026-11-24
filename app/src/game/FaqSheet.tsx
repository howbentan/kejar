import type { PowerUpKind } from '../../shared/types.js'
import { FAQ, type FaqKind } from './faq'
import { INFO } from './powerInfo'
import Sticker from './Sticker'

/** Every power-up's questions and answers in one scrolling sheet (opened from How to Play's last card). */
export default function FaqSheet({ kinds, onClose }: { kinds: PowerUpKind[]; onClose: () => void }) {
  const shown = kinds.filter((k): k is FaqKind => k in FAQ)
  return (
    <div className="faq-sheet" role="dialog" aria-modal="true" aria-label="Power-up FAQ">
      <div className="faq-top">
        <h2>Power-up FAQ</h2>
        <button type="button" className="faq-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {shown.map((k) => (
        <section key={k} className="faq-card">
          <div className="faq-name">
            <Sticker kind={k} size={34} tilt={-4} />
            <b>{INFO[k].name}</b>
          </div>
          <dl className="card-pop-faq">
            {FAQ[k].map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
