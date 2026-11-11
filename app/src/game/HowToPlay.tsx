import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
  const closeRef = useRef<HTMLButtonElement>(null)
  const last = i === cards.length - 1

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    onOpened?.()
  }, [onOpened])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to play"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0A0A0B', color: '#F5F5F3', overflow: 'hidden', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}
    >
      <div data-testid="segments" style={{ flex: 'none', margin: '12px 12px 0', display: 'flex', gap: 4 }}>
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
      <div style={{ flex: 'none', margin: '8px 14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 4 }}>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', width: 32, height: 32, display: 'grid', placeItems: 'center', fontSize: 22, opacity: 0.7 }}
        >
          ×
        </button>
        <ModeBadge mode={mode} />
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div data-testid="scene-box" style={{ flex: '0 1 auto', height: 'min(250px, 40dvh)', minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          <Scene key={`${card.scene}-${i}`} id={card.scene} stickers={card.scene.endsWith('powerups') ? stickers : undefined} />
        </div>
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 18px 0' }}>
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
      </div>
      <div style={{ flex: 'none', padding: '12px 16px 18px', minHeight: last ? undefined : 0, position: 'relative', zIndex: 5 }}>
        {last && (
          <button type="button" className="btn" onClick={ready} style={{ width: '100%' }}>
            I'm ready
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
