export type Role = 'runner' | 'chaser' | 'marshal'
export type Phase = 'lobby' | 'hiding' | 'chasing' | 'ended'
export type CheckinMode = 'push' | 'schedule'
/** Core: the chase plus 4 simple power-ups. Full: everything (rules doc §1). */
export type GameMode = 'core' | 'full'

export interface LatLng {
  lat: number
  lng: number
}

/** A reported location; `at` is the server time it was received (ISO). */
export interface Position extends LatLng {
  accuracy_m: number
  at: string
}

export interface Settings {
  lengthMin: number
  hideMin: number
  pingMin: 2 | 3 | 5
  spectatorDelayMin: number
  checkinMode: CheckinMode
  mode: GameMode
  /**
   * Dikejar can see Kejar at check-in (chaser-snapshot design §5). Off by default. Games stored before this
   * setting existed have no value, so readers must test `settings.chaserSnapshot === true`.
   */
  chaserSnapshot: boolean
  /**
   * How many players the organiser expects: only sets the crew suggestion and the vest count (the printed kit is
   * always armbands #01–#40). Games stored before this setting existed have none, so readers default to 20.
   */
  playersBand: 20 | 30 | 40
  /**
   * Which legendary cards this game uses. Only Full mode reads it. Bomoh isn't built yet, so it stays 'off'.
   * Older games have none: read them as the defaults.
   */
  legendaries: { dato: 'off' | 'stash'; bomoh: 'off' | 'stash' }
}

/** Spec §4.3 defaults. */
export const DEFAULT_SETTINGS: Settings = {
  lengthMin: 45,
  hideMin: 5,
  pingMin: 5,
  spectatorDelayMin: 2,
  checkinMode: 'push',
  mode: 'core',
  chaserSnapshot: false,
  playersBand: 20,
  legendaries: { dato: 'stash', bomoh: 'off' },
}

export interface Arena {
  id: string
  name: string
  boundary: LatLng[]
  jail: LatLng
  start: LatLng
  /** Power-up stations; index i is station i + 1. */
  stations?: LatLng[]
  /** Water cut out of the play area (lakes, ponds): outside for every rule. Absent = none. */
  holes?: LatLng[][]
  /** Toilets inside the play area, shown on maps. */
  toilets?: LatLng[]
}

export interface Game {
  id: string
  code: string
  arena: Arena
  settings: Settings
  /** When the game was made (ISO, the column's default). Rows built before it was read may lack it. */
  created_at?: string
  started_at: string | null
  ended_at: string | null
  winner: 'runners' | 'chasers' | null
  /** Set while a marshal has the game paused. */
  paused_at: string | null
  /** Finished pauses, oldest first. */
  pauses: { from: string; to: string }[]
  /**
   * When the last free Dikejar went out (fair-play §1.4): the end is held for FINAL_WHISTLE_MS so a marshal can
   * undo a wrong last catch. Null when no whistle is pending (cleared again if someone is free).
   */
  final_whistle_at: string | null
  /** Deck sets per side, fixed at start, and cards drawn so far (power-ups §5b). Older games have none. */
  runner_sets?: number | null
  chaser_sets?: number | null
  runner_draws?: number
  chaser_draws?: number
  /** Secret seed for the deck shuffle, set at start; never sent to players, so the next card can't be predicted. */
  deck_seed?: string | null
  /**
   * Dato Seri's hidden stash (jail design §4b): where the organiser or a marshal dropped the card, and who
   * scanned it first. Never sent to players as is: they get a fuzzy, unlabelled zone. Older games have none.
   */
  dato_stash?: DatoStash | null
  /**
   * Bomoh's hidden stash (jail design §2e): the purple card's drop spot and who scanned it first. Same shape and
   * secrecy as `dato_stash`. Older games have none.
   */
  bomoh_stash?: BomohStash | null
  /**
   * The organiser's packing list: `ticks` maps an item id to the label it was ticked under (the item un-ticks
   * itself if its label changes), and `placed` is which cards are taped up. Older games have none.
   */
  kit?: { ticks: Record<string, string>; placed: Record<string, boolean> }
}

export interface DatoStash {
  /**
   * The secret on the printed ★ card (QR `datoQr(code)`): the code of the yellow card assigned to this game, so a
   * copy of any other card (or of the public sheet) never claims it (ruling R15). Never sent to players. Games
   * made before it existed have none, and their card claims nothing until a drop gives them one.
   */
  code?: string
  /**
   * The organisation's reusable yellow card this game was assigned, kept for the game's life. Games made before
   * card sets existed have none, and claim against `code` alone.
   */
  card?: { id: string; letter: string }
  /** Where the card was dropped; null until the organiser or a marshal drops it. */
  lat: number | null
  lng: number | null
  claimedBy: string | null
  claimedAt: string | null
}

/** Bomoh's hidden stash: the same shape as `DatoStash`, kept apart so the two legendaries stay independent. */
export interface BomohStash {
  /** The secret on the printed purple card; never sent to players. See `DatoStash.code`. */
  code?: string
  /** The organisation's reusable purple card this game was assigned. See `DatoStash.card`. */
  card?: { id: string; letter: string }
  /** Where the card was dropped; null until the organiser or a marshal drops it. */
  lat: number | null
  lng: number | null
  claimedBy: string | null
  claimedAt: string | null
}

/**
 * One of an organisation's six reusable secret cards: A-C yellow (Dato Seri) and A-C purple (Bomoh).
 * `ready`: printed and can be put in play. `retired`: found, or retired by hand. `printing`: has a new code that
 * isn't confirmed printed yet.
 */
export interface SecretCard {
  id: string
  organisation_id: string
  legendary: 'dato' | 'bomoh'
  letter: 'A' | 'B' | 'C'
  code: string
  state: 'ready' | 'retired' | 'printing'
  /** Set when someone claims it. */
  found_at: string | null
}

/** A stash that has been dropped somewhere, without its secret code. */
export interface PlacedStash {
  lat: number
  lng: number
  claimedBy: string | null
  claimedAt: string | null
}

/** The dropped stash's spot and claim, or null when there's no stash or it hasn't been dropped yet. */
export function placedStash(s: DatoStash | null | undefined): PlacedStash | null {
  if (!s || typeof s.lat !== 'number' || typeof s.lng !== 'number') return null
  return { lat: s.lat, lng: s.lng, claimedBy: s.claimedBy, claimedAt: s.claimedAt }
}

export interface Player {
  id: string
  game_id: string
  name: string
  role: Role | null
  tag_id: number | null
  accepted_at: string
  caught_at: string | null
  caught_by: string | null
  jailed: boolean
  freed_once: boolean
  /** When this runner was last released from Penjara (ISO), or null if never. */
  freed_at: string | null
  push: PushSubscriptionJSON | null
  /** Set when a marshal removed this player from the game. */
  removed_at: string | null
  /** Alert flags: currently outside the play area; left the start point early. */
  outside: boolean
  left_start: boolean
  /** Luar Garisan: when this player's first report outside the play area was taken (ISO), cleared by a report back inside. */
  out_warned_at?: string | null
  /** Luar Garisan: when this player was disqualified for leaving the play area twice in a row (ISO). Permanent for the round. */
  disqualified_at?: string | null
}

export interface Ping {
  game_id: string
  seq: number
  alert_at: string
  reveal_at: string
  alerted: boolean
  revealed: boolean
  /** When the alert was claimed (store clock); null until it goes out. Late alerts don't count toward auto-jail. */
  alert_sent_at: string | null
}

export type EventType =
  | 'joined'
  | 'roles'
  | 'started'
  | 'chase'
  | 'ping'
  | 'caught'
  | 'jailbreak'
  | 'ended'
  | 'powerup'
  | 'used'
  | 'shielded'
  | 'sos'
  | 'report'
  | 'outside'
  /** A first report outside the play area (Luar Garisan). data: { who } */
  | 'out-warned'
  /** A second consecutive report outside: disqualified for the round. data: { who } */
  | 'luar-garisan'
  | 'missed'
  | 'left-start'
  | 'handled'
  | 'paused'
  | 'resumed'
  | 'removed'
  | 'auto-jailed'
  | 'auto-jail-undone'
  | 'sos-details'
  | 'sos-responding'
  | 'rated'
  | 'stolen'
  /** Someone scanned Dato Seri's stash. The feed never says who, or what it was (jail design §4c). */
  | 'legendary'
  /** Dato Seri's Settle freed `data.freed` runners. Visible, but never names the card (jail design §4). */
  | 'settled'
  /** A stash scan by this player that didn't claim. Three lock them out. Never in a feed or an alert. data: {} */
  | 'stash-miss'
  /** A marshal or the organiser undid a chaser's catch (fair-play §1.4). target: the runner. data: { eventId, who } */
  | 'kejar-undone'
  /** The last free Dikejar went out: the end is held for 60 s (fair-play §1.4). data: {} */
  | 'final-whistle'

export type PowerUpKind = 'decoy' | 'shield' | 'cloak' | 'flare' | 'focus' | 'toyol' | 'along' | 'grab' | 'dato'

export interface PowerUp {
  id: string
  game_id: string
  player_id: string
  kind: PowerUpKind
  /** The station it was claimed at; null for a card Abang Grab delivered. */
  station: number | null
  claimed_at: string
  used_at: string | null
  consumed_at: string | null
  /** Delivered by Abang Grab: can't be stolen (power-ups §6.3). */
  sealed: boolean
  /** Set when Toyol or Ah Long took this card; a taken card is gone from every hand. */
  taken_at: string | null
  /** Abang Grab's open offer (power-ups §6.3): the top 3 cards of the holder's deck, until one is picked. */
  offer: PowerUpKind[] | null
}

export interface GameEvent {
  id: string
  game_id: string
  at: string
  type: EventType
  actor_id: string | null
  target_id: string | null
  data: Record<string, unknown>
}

export interface Results {
  winner: 'runners' | 'chasers'
  survivors: string[]
  longestSurvivor: { id: string; ms: number } | null
  mostCatches: { id: string; count: number } | null
  jailbreakHero: { id: string; freed: number } | null
}
