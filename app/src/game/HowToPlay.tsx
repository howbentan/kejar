import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cardsFor, stickersFor } from '../../shared/howToPlay.js'
import { Scene } from './doodles'
import { ModeBadge } from './ui'

const ADVANCE_MS = 7_000

/** Renders only `<b>` as bold. Anything else, `<` included, stays plain text. Never raw HTML. */
export function renderLine(line: string): ReactNode[] {
  return line.split(/(<b>.*?<\/b>)/g).map((part, i) => {
    const m = /^<b>(.*)<\/b>$/.exec(part)
    return m ? <strong key={i}>{m[1]}</strong> : <Fragment key={i}>{part}</Fragment>
  })
}

export interface HowToPlayProps {
  side: 'runner' | 'chaser'
  mode: 'core' | 'full'
  snapshot: boolean
  onClose: () => void
  onReady?: () => void
  onOpened?: () => void
}

/** The how-to-play story: full-screen cards, tap right for next and left for back, 7 s per card. */
export default function HowToPlay({ side, mode, snapshot, onClose, onReady, onOpened }: HowToPlayProps) {
  const cards = useMemo(() => cardsFor(side, mode, snapshot), [side, mode, snapshot])
  const stickers = useMemo(() => stickersFor(side, mode), [side, mode])
  const [i, setI] = useState(0)
  const reduce = useReducedMotion()
  const opened = useRef(false)
  const last = i === cards.length - 1

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    onOpened?.()
  }, [onOpened])

  useEffect(() => {
    if (last) return
    const t = window.setTimeout(() => setI((n) => Math.min(n + 1, cards.length - 1)), ADVANCE_MS)
    return () => window.clearTimeout(t)
  }, [i, last, cards.length])

  const card = cards[i]
  const ready = () => {
    onReady?.()
    onClose()
  }

  return (
    <div role="dialog" aria-label="How to play" style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0A0A0B', color: '#F5F5F3', overflow: 'hidden' }}>
      <div data-testid="segments" style={{ position: 'absolute', left: 12, right: 12, top: 12, display: 'flex', gap: 4, zIndex: 3 }}>
        {cards.map((_, n) => (
          <i key={n} data-state={n < i ? 'done' : n === i ? 'current' : 'todo'} style={{ flex: 1, height: 3, borderRadius: 2, background: '#2a2a2a', overflow: 'hidden', position: 'relative' }}>
            {n <= i && (
              <motion.b
                key={n === i ? `cur-${i}` : 'done'}
                initial={{ scaleX: n < i || reduce ? 1 : 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: n === i && !reduce && !last ? ADVANCE_MS / 1000 : 0, ease: 'linear' }}
                style={{ position: 'absolute', inset: 0, background: 'var(--volt)', transformOrigin: 'left' }}
              />
            )}
          </i>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 14, right: 14, top: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 4 }}>
        <ModeBadge mode={mode} />
        <button type="button" aria-label="Close" onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 22, padding: '0 6px', opacity: 0.7 }}>
          ×
        </button>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 64, height: 250, display: 'grid', placeItems: 'center' }}>
        <Scene key={`${card.scene}-${i}`} id={card.scene} stickers={card.scene.endsWith('powerups') ? stickers : undefined} />
      </div>
      <div style={{ position: 'absolute', left: 18, right: 18, top: 330 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 800, letterSpacing: '-0.055em', lineHeight: 1 }}>
          {card.headline}
          <span style={{ color: 'var(--volt)' }}>.</span>
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4, opacity: 0.85 }}>{renderLine(card.line)}</p>
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 2 }}>
        <button type="button" aria-label="Previous card" onClick={() => setI((n) => Math.max(n - 1, 0))} style={{ all: 'unset', flex: 1, cursor: 'pointer' }} />
        <button type="button" aria-label="Next card" onClick={() => setI((n) => Math.min(n + 1, cards.length - 1))} style={{ all: 'unset', flex: 2, cursor: 'pointer' }} />
      </div>
      {last && (
        <button type="button" className="btn" onClick={ready} style={{ position: 'absolute', left: 16, right: 16, bottom: 18, zIndex: 5 }}>
          I'm ready
        </button>
      )}
    </div>
  )
}
