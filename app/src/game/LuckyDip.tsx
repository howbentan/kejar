import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import { stationFromQr } from '../../shared/ids.js'
import type { Rarity } from '../../shared/deck.js'
import type { LegendaryKind, PowerUpKind } from '../../shared/types.js'
import { call } from './api'
import { credentials } from './auth'
import { Shockwave, Sparkles, type Spot } from './Celebrate'
import Marker from './Marker'
import PowerCard from './PowerCard'
import type { ClaimResult, SlipClaimResult } from './PowerUpHand'
import { INFO } from './powerInfo'
import Stamp from './Stamp'
import TupperwareTakeover from './TupperwareTakeover'

export const CLAIM_STAMP_MS = 900
/** Time to pick before the deck picks for you (playtest batch §2.1). */
export const PICK_MS = 10_000
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
const SPARKLE_SPOTS: Spot[] = [
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

export type Deal = { id: string; backs: Rarity[] }

/** Deals whose pick screen this page has already shown, so a poll never opens a second one. */
const shownDeals = new Set<string>()

/** An open deal the page hasn't shown (the app was closed mid-pick): the fan comes back, without the claim stamp. */
export function resumeDip(code: string, deal: Deal, deckLeft: number | null, done: () => void) {
  if (shownDeals.has(deal.id)) return null
  shownDeals.add(deal.id)
  const onPick = (index: number) =>
    call<{ ok: true; kind: PowerUpKind }>('pickCard', { code, ...credentials(code), dealId: deal.id, index }).then((x) => ({ kind: x.kind }))
  return <LuckyDip deal={deal} station={0} deckLeft={deckLeft} onPick={onPick} onDone={done} resume />
}

/**
 * The dip for a good station scan (the Tupperware unlock for a right slip), or null
 * (a refusal stays a calm line, no marker). `code` is the game, for the pick.
 */
export function dipFor(text: string, r: unknown, deckLeft: number | null, done: () => void, code = '') {
  const c = r as ClaimResult | SlipClaimResult | { ok: true; deal: Deal }
  if (!c.ok) return null
  // A right slip opens the box, whichever legendary is in it: checked first, so Bomoh and the others get their moment.
  if ('slip' in c && c.slip) return <TupperwareTakeover kind={c.kind as LegendaryKind} onDone={done} />
  // A station deals five face-down cards; the pick asks the server which one it was.
  if ('deal' in c) {
    shownDeals.add(c.deal.id)
    const onPick = (index: number) =>
      call<{ ok: true; kind: PowerUpKind }>('pickCard', { code, ...credentials(code), dealId: c.deal.id, index }).then((x) => ({ kind: x.kind }))
    return <LuckyDip deal={c.deal} station={stationFromQr(text) ?? 0} deckLeft={deckLeft} onPick={onPick} onDone={done} />
  }
  return null
}

type Stage = 'stamp' | 'fan' | 'reveal'

/**
 * The lucky dip (motion design §7, playtest batch §2.1). The scan dealt five face-down cards whose backs show their
 * rarity; the card the player taps is the one they get (the server decides which card it was, only after the tap).
 * No tap in 10 s and the deck picks one. Only the picked card is ever turned over.
 */
export default function LuckyDip({
  deal,
  station,
  deckLeft,
  onPick,
  onDone,
  resume = false,
}: {
  deal: Deal
  station: number
  deckLeft: number | null
  onPick: (index: number) => Promise<{ kind: PowerUpKind }>
  onDone: () => void
  /** Back to an open pick after a reload: straight to the fan. */
  resume?: boolean
}) {
  const [stage, setStage] = useState<Stage>(resume ? 'fan' : 'stamp')
  const [picked, setPicked] = useState<number | null>(null)
  const [kind, setKind] = useState<PowerUpKind | null>(null)
  const [auto, setAuto] = useState(false)
  const [error, setError] = useState('')
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
      fan: [PICK_MS, () => pick(Math.floor(Math.random() * deal.backs.length), true)],
      reveal: [REVEAL_HOLD_MS, onDone],
    }
    const step = next[stage]
    if (stage === 'reveal') {
      // The reveal starts once the server has said which card it was.
      if (!kind) return
      const t = window.setTimeout(() => setLanded(true), FLIP_MS)
      const done = window.setTimeout(step![1], step![0])
      return () => (window.clearTimeout(t), window.clearTimeout(done))
    }
    if (!step) return
    const t = window.setTimeout(step[1], step[0])
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, kind])

  function pick(i: number, byDeck = false) {
    if (picked !== null) return
    setPicked(i)
    setAuto(byDeck)
    setStage('reveal')
    onPick(i).then(
      (r) => {
        // A bigger buzz than the claim: this is the reward (a short one for a Sike).
        navigator.vibrate?.(r.kind === 'sike' ? 60 : [60, 40, 160])
        setKind(r.kind)
      },
      (e) => {
        setError(e instanceof Error ? e.message : String(e))
        window.setTimeout(onDone, 2_500)
      },
    )
  }

  const name = kind ? INFO[kind].name : ''
  const sike = kind === 'sike'

  return (
    <div className="moment dip" role="status">
      {/* The deck count goes with the claim stamp; the reveal's marker needs the space above the title. */}
      {stage === 'stamp' && deckLeft !== null && <span className="dip-deck">{`DECK · ${deckLeft} LEFT`}</span>}
      {stage === 'stamp' && <Stamp text={`CLAIMED · Station ${station} ✓`} small />}

      {stage === 'reveal' && kind && (
        <div className="dip-title">
          <m.h2
            ref={title}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          >{sike ? 'Sike!' : `Got ${name}!`}</m.h2>
          <p className="dip-sub">{sike ? 'your scan is used, station locks 60s' : auto ? 'too slow, the deck picked for you' : 'into your slot'}</p>
        </div>
      )}
      {error && <p className="dip-sub">{error}</p>}

      {stage !== 'stamp' && (
        <div className="dip-fan">
          {FAN.map((rot, i) =>
            i === picked ? (
              kind ? (
                <m.div
                  key={i}
                  ref={card}
                  className="dip-card picked"
                  // The deck's own pick rises out of the deck; a tapped card flips where it is.
                  initial={auto ? { y: 220, rotateY: 90 } : { rotate: rot, rotateY: 90 }}
                  animate={{ y: 0, rotate: 0, rotateY: 0 }}
                  transition={{ duration: FLIP_MS / 1000, ease: [0.32, 0.72, 0, 1] }}
                >
                  <PowerCard kind={kind} wiggle={!sike} big />
                  {/* The landing: one lime ring kicks out from the card, and sparkles pop round it (not for a Sike). */}
                  {!sike && <Shockwave delayMs={FLIP_MS} radius={20} />}
                  {!sike && <Sparkles spots={SPARKLE_SPOTS} delayMs={FLIP_MS} />}
                </m.div>
              ) : (
                <div key={i} className="dip-card picked">
                  <PowerCard faceDown rarity={deal.backs[i]} big />
                </div>
              )
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
                <PowerCard faceDown rarity={deal.backs[i]} />
              </m.button>
            ),
          )}
        </div>
      )}

      {stage === 'fan' && (
        <div className="dip-pick">
          <p>Pick a card</p>
          {stage === 'fan' && <m.span className="dip-timer" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: PICK_MS / 1000, ease: 'linear' }} />}
        </div>
      )}

      {stage === 'reveal' && landed && kind && !sike && (
        <Marker
          marks={[
            { shape: 'circle', target: title },
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
