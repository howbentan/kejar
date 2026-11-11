import { SET, type Mode, type Side } from './deck.js'
import type { PowerUpKind } from './types.js'

export type SceneId =
  | 'runner-free'
  | 'checkin'
  | 'miss-two'
  | 'tag-ripped'
  | 'break-out'
  | 'runner-powerups'
  | 'sos'
  | 'chaser-start'
  | 'ping-circles'
  | 'rip-scan'
  | 'snapshot'
  | 'stop-rescue'
  | 'chaser-powerups'

export interface Card {
  scene: SceneId
  headline: string
  /** Plain text with `<b>` around the bold parts. Only `<b>` is ever interpreted by the player. */
  line: string
}

const RUNNER: Card[] = [
  { scene: 'runner-free', headline: "You're Dikejar", line: 'Hide, keep moving, and <b>stay free until time runs out</b>. Kejar get released after the hide time.' },
  { scene: 'checkin', headline: 'When it buzzes, check in', line: 'Phone in your pocket. When it buzzes, <b>open Kejar within 45 s</b>. Kejar then see roughly where you were.' },
  { scene: 'miss-two', headline: "Miss two, you're out", line: 'One missed check-in is free. <b>Miss two in a row and you go to Penjara</b> automatically. Outside the play area at two check-ins in a row? You\'re out too.' },
  { scene: 'tag-ripped', headline: 'Tag ripped? Stop', line: 'If a Kejar rips your armband tag, stop and <b>walk to Penjara</b>. No running, no arguing: use SOS. At Penjara you get <b>one pull of the reel</b>. One slot sets you free.' },
  { scene: 'break-out', headline: 'Break them out', line: 'Scan the Penjara card, then <b>stay within 30 m for 10 seconds</b>. Kejar get warned, so be quick. Each person can only be freed once.' },
  { scene: 'runner-powerups', headline: 'Grab power-ups', line: 'Scan a <b>station</b> to draw a power-up. You hold <b>one at a time</b>, so use it before you grab another.' },
  { scene: 'sos', headline: 'Anything wrong? SOS', line: 'Hurt, lost, or a dispute? <b>Tap the ! in the corner, then hold for 1 second.</b> A marshal comes to you.' },
]

const CHASER_BEFORE_SNAPSHOT: Card[] = [
  { scene: 'chaser-start', headline: "You're Kejar", line: "<b>Wait at the start</b> until you're released. Then catch every Dikejar before time runs out." },
  { scene: 'ping-circles', headline: 'Pings show circles', line: 'Every few minutes, Dikejar show as <b>fuzzy circles</b> where they checked in. Dashed means they missed.' },
  { scene: 'rip-scan', headline: 'Rip, then scan', line: '<b>One hand, upper arm, tag only.</b> No grabbing or tackling. Then scan the tag to make it count.' },
]
const CHASER_SNAPSHOT: Card = { scene: 'snapshot', headline: 'They can see you too', line: 'When their phone buzzes, Dikejar see <b>where you were at that moment</b>. Move after the buzz.' }
const CHASER_AFTER_SNAPSHOT: Card[] = [
  { scene: 'stop-rescue', headline: 'Stop the rescue', line: 'When a Dikejar starts a rescue, <b>you get 10 seconds</b>. Catch them at Penjara and nobody gets out.' },
  { scene: 'chaser-powerups', headline: 'Grab power-ups', line: "Scan a <b>station</b> to draw a power-up. You hold <b>one at a time</b>. Hit a Durian? <b>You can't catch that Dikejar again.</b>" },
  { scene: 'sos', headline: 'Anything wrong? SOS', line: 'Hurt, or a dispute? <b>Tap the ! in the corner, then hold for 1 second.</b> Never sort it out physically.' },
]

/** The story for one side. The cards are the same in Core and Full; only the power-up scene's stickers differ. */
export function cardsFor(side: Side, _mode: Mode, snapshot: boolean): Card[] {
  if (side === 'runner') return RUNNER
  return [...CHASER_BEFORE_SNAPSHOT, ...(snapshot ? [CHASER_SNAPSHOT] : []), ...CHASER_AFTER_SNAPSHOT]
}

/** The stickers the power-up scene shows: this mode's deck for the side, once each, never a legendary. */
export function stickersFor(side: Side, mode: Mode): PowerUpKind[] {
  return [...new Set(SET[mode][side])].filter((k) => k !== 'dato')
}
