import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import type { ClaimJudgement } from '../../shared/powerups.js'
import type { PowerUp, PowerUpKind } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { loadSession } from './session'
import { clock, useServerNow } from './time'
import { INFO } from './powerInfo'
import FreezePicker from './FreezePicker'
import GrabChooser from './GrabChooser'
import Sticker from './Sticker'
import { ErrorText } from './ui'

/**
 * What a successful claim can hand back: a deck card, Dato Seri, or Bomoh. Bomoh is never a `PowerUpKind` (he works on
 * claim and never sits in a hand), so every place that names a claimed kind has to handle him on purpose.
 */
export type ClaimedKind = PowerUpKind | 'bomoh' | 'hijau'
export type ClaimResult = ({ ok: true; kind: ClaimedKind; double?: boolean } | Exclude<ClaimJudgement, { ok: true }>)
type UseResult =
  | { ok: true; kind: PowerUpKind; offer?: PowerUpKind[]; name?: string; wasted?: true }
  | { ok: false; reason: string; readyInMs?: number; frozenForMs?: number }

const CLAIM_REJECTIONS: Record<string, string> = {
  'too-far': 'Get within 30 m of the station.',
  'already-claimed': "You've used this station this game. Try another one.",
  'unknown-station': "That's not a station code",
  'not-chasing': 'Stations open when the chase starts',
  'cannot-claim': "You can't claim power-ups right now",
  // The hidden stash with a full slot (rules doc §9); a station's hand-full names the card instead.
  'hand-full': 'Use or lose your power-up first',
  paused: 'Game is paused',
  disqualified: "You're Luar Garisan, so no power-ups this round.",
}

const USE_REJECTIONS: Record<string, string> = {
  'too-late': 'Too late for Mat Rempit.',
  'already-used': 'Already used',
  'not-chasing': 'Power-ups work during the chase',
  'cannot-use': "You can't use power-ups in Penjara",
  'not-yours': "That isn't yours",
  'no-offer': 'Open Abang Grab first to see the cards',
  'bad-choice': 'Pick one of the three cards',
  'no-target': "That Kejar can't be frozen right now.",
  'effect-running': 'Wait for your last one to finish first.',
  'no-location': "Can't find you yet. Try again in a moment.",
  paused: 'Game is paused',
  disqualified: "You're Luar Garisan, so no power-ups this round.",
}

/** A chaser claiming Bomoh: what it does, since there's no card or reveal for it. */
export const BOMOH_FOUND = 'Bomoh found! Every Dikejar shows up for Kejar at the next 2 pings.'

/** A runner claiming Super Ring: what it does, since it sits unused in the slot until it steps in. */
export const RING_FOUND = "Super Ring! Next time you'd go to Penjara, it's house arrest instead."

/** A chaser claiming Mak Kau Hijau: the runners are told separately. */
export const HIJAU_FOUND = 'Mak kau hijau! Dikejar have 45 s.'

/** A card that arrived doubled (a Nasi Lemak KFC combo) says so; Bomoh never does. */
const claimedLine = (kind: ClaimedKind, double?: boolean) =>
  kind === 'bomoh' ? BOMOH_FOUND : kind === 'hijau' ? HIJAU_FOUND : kind === 'ring' ? RING_FOUND : double ? `Combo! ${INFO[kind].name} x2.` : `Got ${INFO[kind].name} ✓`

const frozenLine = (ms: number | undefined) => `Brain freeze! Wait ${clock(ms ?? 0)}.`

/**
 * Plain words for a scan of the hidden stash card. It's a secret (rules doc §9b): no refusal says what the card
 * is, or calls it a station, so anyone who isn't meant to have it learns nothing. Both legendaries' cards come here, by
 * the server's answer: an old purple card carries a ★ QR, so the client can't tell the two apart. A runner whose stash
 * scan is refused as cannot-claim is holding the chasers' purple card (a runner on the chase screen is never jailed).
 */
export function stashMessage(r: ClaimResult | { ok: false; reason: 'no-stash' | 'paused' }, side?: 'runner' | 'chaser'): string {
  if (r.ok) return claimedLine(r.kind)
  const reason: string = r.reason
  if (reason === 'cannot-claim' && side === 'runner') return 'Not for your side.'
  if (reason === 'too-far') return 'Get closer.'
  if (reason === 'hand-full') return 'Use or lose your power-up first'
  if (reason === 'paused') return CLAIM_REJECTIONS.paused
  if (reason === 'frozen') return frozenLine((r as { frozenForMs?: number }).frozenForMs)
  return 'Nothing here.'
}

/** Plain words for a claim; refusals name the station when the scan said which one (motion design §7). */
export function claimMessage(r: ClaimResult, station?: number | null): string {
  if (r.ok) return claimedLine(r.kind, r.double)
  if (r.reason === 'frozen') return frozenLine(r.frozenForMs)
  if (station) {
    if (r.reason === 'too-far') return `Get closer. You need to be within 30 m of Station ${station}.`
    if (r.reason === 'already-claimed') return `You've used Station ${station} this game. Try another one.`
    if (r.reason === 'locked') return `Station ${station} is cooling down. Ready in ${clock(r.lockedForMs ?? 0)}.`
  }
  if (r.reason === 'locked') return `This station is cooling down. Ready in ${clock(r.lockedForMs ?? 0)}.`
  if (r.reason === 'hand-full' && r.busyKind) {
    const name = INFO[r.busyKind].name
    return r.busyRunning ? `Your ${name} is still working. Come back when it's done.` : `Your slot is full. Use your ${name} first, then come back.`
  }
  return CLAIM_REJECTIONS[r.reason] ?? 'Nothing claimed'
}

/** The one power-up slot in the dock (Plan B). Stations are scanned with the dock's Scan button. */
export default function PowerUpHand({ code, view }: { code: string; view: View }) {
  const [confirm, setConfirm] = useState<PowerUp | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [grab, setGrab] = useState<{ powerupId: string; offer: PowerUpKind[] } | null>(null)
  const [freeze, setFreeze] = useState<PowerUp | null>(null)
  const token = () => loadSession(localStorage, code).token
  const now = useServerNow(view.now)

  // Back with an Abang Grab whose offer is still open (closed app, reload): reopen its chooser once.
  const reopened = useRef<string | null>(null)
  const openOffer = view.hand.find((u) => u.kind === 'grab' && u.offer && u.offer.length > 0)
  useEffect(() => {
    if (!openOffer || reopened.current === openOffer.id) return
    reopened.current = openOffer.id
    setGrab({ powerupId: openOffer.id, offer: openOffer.offer! })
  }, [openOffer])

  // Cheese Ais skips the confirm: the picker is its confirm, and Cancel keeps the card.
  function open(u: PowerUp) {
    if (u.kind !== 'cheese') return setConfirm(u)
    setError('')
    if (!view.freezeTargets || view.freezeTargets.length === 0) return setMessage('No Kejar to freeze right now.')
    setMessage('')
    setFreeze(u)
  }

  async function use(u: PowerUp, targetId?: string) {
    setConfirm(null)
    setFreeze(null)
    setError('')
    try {
      const r = await call<UseResult>('usePowerup', { code, token: token(), powerupId: u.id, ...(targetId ? { targetId } : {}) })
      if (r.ok && r.kind === 'grab' && r.offer) {
        reopened.current = u.id
        return setGrab({ powerupId: u.id, offer: r.offer })
      }
      setMessage(
        r.ok
          ? r.kind === 'cheese' && r.name
            ? `Cheese Ais! ${r.name} is frozen for 3 minutes.`
            : r.wasted
              ? "Combo already ready. This one's spent."
              : INFO[r.kind].used
          : r.reason === 'frozen'
            ? frozenLine(r.frozenForMs)
            : r.reason === 'taken'
            ? `Your ${INFO[u.kind].name} was taken.`
          : r.reason === 'flare-cooldown'
            ? `Mat Rempit is ready again in ${clock(r.readyInMs ?? 0)}.`
            : r.reason === 'flare-pending'
              ? `Another Mat Rempit is already on its way. Ready again in ${clock(r.readyInMs ?? 0)}.`
            : r.reason === 'nothing-to-steal'
              ? `Nothing to steal. You keep your ${INFO[u.kind].name}.`
              : (USE_REJECTIONS[r.reason] ?? 'Not used'),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // The tail chip: a used Nasi Lemak KFC waiting for the next card beats the deck count.
  const deck = view.comboReady ? (
    <small className="slot-deck">COMBO READY</small>
  ) : (
    view.deckLeft !== null && <small className="slot-deck">{`DECK · ${view.deckLeft} LEFT`}</small>
  )
  const frozenFor = view.frozenUntil !== null ? view.frozenUntil - now : 0
  const frozen = frozenFor > 0
  // A doubled card (Nasi Lemak KFC) is two unused rows, one with `twin_of` pointing at the other: show it once.
  const shown = view.hand.filter((u) => !(u.twin_of && view.hand.some((x) => x.id === u.twin_of)))

  return (
    <div className="slot-wrap">
      {(confirm || message || error) && (
        <div className="dock-pop">
          {confirm ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{`Use ${INFO[confirm.kind].name}?`}</span>
              <button type="button" className="btn" style={{ padding: '10px 16px' }} onClick={() => use(confirm)}>
                {`Use ${INFO[confirm.kind].name}`}
              </button>
              <button type="button" className="btn btn-ghost" style={{ padding: '10px 16px' }} onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="dock-pop-text" onClick={() => (setMessage(''), setError(''))}>
              {message && <span role="status">{message}</span>}
              <ErrorText>{error}</ErrorText>
            </button>
          )}
        </div>
      )}
      {shown.length > 0 ? (
        shown.map((u) => {
          const cooling = u.kind === 'flare' && view.flareReadyAt !== null
          const doubled = view.hand.some((x) => x.twin_of === u.id)
          // Dato Seri is only ever used through Settle, at Penjara: no Use here (jail design §4b).
          if (u.kind === 'dato') {
            return (
              <m.div
                key={u.id}
                className="slot legendary"
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              >
                <Sticker kind="dato" size={40} tilt={-4} />
                <span>
                  <b>{INFO.dato.name}</b>
                  <span>{INFO.dato.used}</span>
                </span>
                <small className="slot-deck">★ LEGENDARY</small>
              </m.div>
            )
          }
          // Super Ring switches on at claim and waits for the next time they'd go to Penjara: nothing to use.
          if (u.kind === 'ring') {
            return (
              <m.div
                key={u.id}
                className="slot legendary ring"
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              >
                <Sticker kind="ring" size={40} tilt={-4} />
                <span>
                  <b>{INFO.ring.name}</b>
                  <span>{INFO.ring.used}</span>
                </span>
                <small className="slot-deck">ON · WAITING</small>
              </m.div>
            )
          }
          return (
            <m.button
              key={u.id}
              type="button"
              className="slot"
              disabled={cooling || frozen}
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              onClick={() => open(u)}
            >
              <Sticker kind={u.kind} size={40} tilt={-4} />
              <span>
                <b>{INFO[u.kind].name}</b>
                <span>
                  {frozen ? `FROZEN · ${clock(frozenFor)}` : cooling ? `COOLDOWN · ${clock(view.flareReadyAt! - now)}` : INFO[u.kind].effect}
                </span>
              </span>
              {doubled && <small className="slot-x2">×2</small>}
              {/* While cooling down or frozen, the name and countdown need the room more than the deck count. */}
              {!cooling && !frozen && <small className="slot-deck">{view.comboReady ? 'COMBO READY' : 'READY'}</small>}
            </m.button>
          )
        })
      ) : view.activePowerUp ? (
        <div className="slot live">
          <Sticker kind={view.activePowerUp} size={40} tilt={-4} />
          <span>
            <b>{INFO[view.activePowerUp].name}</b>
            <span>{view.activeEndsAt !== null ? `ACTIVE · ${clock(view.activeEndsAt - now)} LEFT` : 'ACTIVE · UNTIL THE NEXT PING'}</span>
          </span>
          {deck}
        </div>
      ) : (
        <div className="slot empty">
          <span>{frozen ? `FROZEN · ${clock(frozenFor)}` : 'No power-up. Find a station and scan it.'}</span>
          {deck}
        </div>
      )}
      {freeze && <FreezePicker targets={view.freezeTargets ?? []} onPick={(id) => use(freeze, id)} onCancel={() => setFreeze(null)} />}
      {grab && <GrabChooser code={code} powerupId={grab.powerupId} offer={grab.offer} onClose={() => setGrab(null)} />}
    </div>
  )
}
