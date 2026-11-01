import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import { stationFromQr } from '../../shared/ids.js'
import type { PowerUpKind } from '../../shared/types.js'
import Marker from './Marker'
import PowerCard from './PowerCard'
import type { ClaimResult } from './PowerUpHand'
import { INFO } from './powerInfo'
import Stamp from './Stamp'

export const CLAIM_STAMP_MS = 900
export const PICK_MS = 3_000
export const SWEEP_MS = 1_200
export const REVEAL_HOLD_MS = 1_600
/** Moving a card up this far is a flick, and picks it (motion design §7). */
const FLICK_PX = 40
const FAN = [-12, -6, 0, 6, 12]
/** The flip's length: the marker measures the card only once it has landed. */
export const FLIP_MS = 450
/**
 * Sparkles that pop out round the revealed card once it lands, then stay still (no looping): doodle
 * four-point stars and dots, lime and white, at spots around the 150×234 card.
 */
const SPARKLE_SPOTS: { x: number; y: number; kind: 'star' | 'dot'; white?: boolean; size: number }[] = [
  { x: -44, y: 18, kind: 'star', size: 22 },
  { x: 168, y: -14, kind: 'star', white: true, size: 18 },
  { x: -30, y: 196, kind: 'dot', size: 8 },
  { x: 176, y: 120, kind: 'star', size: 26 },
  { x: 60, y: -40, kind: 'dot', white: true, size: 7 },
  { x: -54, y: 110, kind: 'dot', size: 6 },
  { x: 158, y: 246, kind: 'star', white: true, size: 16 },
  { x: 8, y: 252, kind: 'dot', size: 7 },
]
export const SPARKLES = SPARKLE_SPOTS.length
/** The spotlight settles on the middle card. */
const SWEEP_PICK = 2

/** The dip for a good station scan, or null (a refusal stays a calm line, no marker). */
export function dipFor(text: string, r: unknown, deckLeft: number | null, done: () => void) {
  const c = r as ClaimResult
  return c.ok ? <LuckyDip kind={c.kind} station={stationFromQr(text) ?? 0} deckLeft={deckLeft} onDone={done} /> : null
}

type Stage = 'stamp' | 'fan' | 'sweep' | 'reveal'

/**
 * The lucky dip (motion design §7). The server already drew the card when the station was scanned: the five
 * face-down cards are the same, and tapping one only reveals it. The other cards are never turned over, since
 * they aren't real alternatives.
 */
export default function LuckyDip({ kind, station, deckLeft, onDone }: { kind: PowerUpKind; station: number; deckLeft: number | null; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('stamp')
  const [picked, setPicked] = useState<number | null>(null)
  const [landed, setLanded] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const flick = useRef<number | null>(null)

  useEffect(() => {
    navigator.vibrate?.(80)
  }, [])

  useEffect(() => {
    const next: Partial<Record<Stage, [number, () => void]>> = {
      stamp: [CLAIM_STAMP_MS, () => setStage('fan')],
      fan: [PICK_MS, () => setStage('sweep')],
      sweep: [SWEEP_MS, () => pick(SWEEP_PICK)],
      reveal: [REVEAL_HOLD_MS, onDone],
    }
    const step = next[stage]
    if (stage === 'reveal') {
      const t = window.setTimeout(() => setLanded(true), FLIP_MS)
      const done = window.setTimeout(step![1], step![0])
      return () => (window.clearTimeout(t), window.clearTimeout(done))
    }
    if (!step) return
    const t = window.setTimeout(step[1], step[0])
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  function pick(i: number) {
    if (picked !== null) return
    // A bigger buzz than the claim: this is the reward.
    navigator.vibrate?.([60, 40, 160])
    setPicked(i)
    setStage('reveal')
  }

  const name = INFO[kind].name

  return (
    <div className="moment dip" role="status">
      {/* The deck count goes with the claim stamp; the reveal's marker needs the space above the title. */}
      {stage === 'stamp' && deckLeft !== null && <span className="dip-deck">{`DECK · ${deckLeft} LEFT`}</span>}
      {stage === 'stamp' && <Stamp text={`CLAIMED · Station ${station} ✓`} small />}

      {stage === 'reveal' && (
        <div className="dip-title">
          <m.h2
            ref={title}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          >{`Got ${name}!`}</m.h2>
        </div>
      )}

      {stage !== 'stamp' && (
        <div className="dip-fan">
          {stage === 'sweep' && (
            <m.span className="dip-spotlight" initial={{ x: '-160%' }} animate={{ x: ['-160%', '160%', '0%'] }} transition={{ duration: SWEEP_MS / 1000, ease: 'easeOut' }} />
          )}
          {FAN.map((rot, i) =>
            i === picked ? (
              <m.div
                key={i}
                ref={card}
                className="dip-card picked"
                initial={{ rotate: rot, rotateY: 90 }}
                animate={{ rotate: 0, rotateY: 0 }}
                transition={{ duration: FLIP_MS / 1000, ease: [0.32, 0.72, 0, 1] }}
              >
                <PowerCard kind={kind} wiggle big />
                {/* The landing: one lime ring kicks out from the card. */}
                <m.span
                  className="dip-shock"
                  aria-hidden="true"
                  initial={{ scale: 1, opacity: 0 }}
                  animate={{ scale: 1.55, opacity: [0, 0.9, 0] }}
                  transition={{ delay: FLIP_MS / 1000, duration: 0.6, ease: 'easeOut' }}
                />
                {SPARKLE_SPOTS.map((s, k) => (
                  <m.span
                    key={k}
                    className="dip-sparkle"
                    aria-hidden="true"
                    style={{ left: s.x, top: s.y, width: s.size, height: s.size, color: s.white ? 'var(--white)' : 'var(--volt)' }}
                    initial={{ scale: 0, opacity: 0, rotate: -30 }}
                    animate={{ scale: [0, 1.35, 1], opacity: 1, rotate: 0 }}
                    transition={{ delay: FLIP_MS / 1000 + 0.08 * k, duration: 0.35 }}
                  >
                    {s.kind === 'star' ? (
                      <svg viewBox="0 0 24 24" width="100%" height="100%">
                        <path d="M12 1 C13 9 15 11 23 12 C15 13 13 15 12 23 C11 15 9 13 1 12 C9 11 11 9 12 1 Z" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 10 10" width="100%" height="100%">
                        <circle cx="5" cy="5" r="5" fill="currentColor" />
                      </svg>
                    )}
                  </m.span>
                ))}
              </m.div>
            ) : (
              <m.button
                key={i}
                type="button"
                className="dip-card"
                aria-label={`Pick card ${i + 1}`}
                disabled={picked !== null}
                initial={{ rotate: rot, y: Math.abs(rot) * 1.5, opacity: 0, scale: 0.8 }}
                animate={picked === null ? { rotate: rot, y: Math.abs(rot) * 1.5, opacity: 1, scale: 1 } : { y: 120, opacity: 0 }}
                transition={{ delay: picked === null ? i * 0.06 : 0, duration: 0.35 }}
                onPointerDown={(e) => (flick.current = e.clientY)}
                onPointerUp={(e) => {
                  if (flick.current !== null && flick.current - e.clientY >= FLICK_PX) pick(i)
                  flick.current = null
                }}
                onClick={() => pick(i)}
              >
                <PowerCard faceDown />
              </m.button>
            ),
          )}
        </div>
      )}

      {(stage === 'fan' || stage === 'sweep') && (
        <div className="dip-pick">
          <p>Pick a card</p>
          {stage === 'fan' && <m.span className="dip-timer" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: PICK_MS / 1000, ease: 'linear' }} />}
        </div>
      )}

      {stage === 'reveal' && landed && (
        <Marker
          marks={[
            { shape: 'circle', target: title },
            { shape: 'circle', target: title, variant: 1 },
            { shape: 'stars', target: title },
            { shape: 'burst', target: card },
            { shape: 'arrow', target: card },
          ]}
          delayMs={0}
        />
      )}
    </div>
  )
}
