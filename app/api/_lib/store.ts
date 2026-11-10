import { LUAR_GARISAN_GRACE_MS } from '../../shared/alerts.js'
import type { ArenaDraft } from '../../shared/arenaDraft.js'
import type { Arena, Game, GameEvent, Ping, Player, Position, PowerUp, PowerUpKind, SecretCard } from '../../shared/types.js'
import { newDatoCode } from './secrets.js'

export type GameRow = Game & { organiser_id: string; host_push?: PushSubscriptionJSON | null }
export type PlayerRow = Player & { token_hash: string }

export interface Organisation {
  id: string
  name: string
  created_at: string
}

export interface OrganiserRow {
  id: string
  organisation_id: string
  name: string
  created_at: string
  session_token_hash: string
  session_created_at: string
}

export interface OrganiserInviteRow {
  id: string
  organisation_id: string
  /** Set = a re-link invite for this existing organiser. Null = invite for a brand new organiser. */
  organiser_id: string | null
  name: string
  token_hash: string
  created_at: string
  expires_at: string
  redeemed_at: string | null
}

export interface MarshalInviteRow {
  id: string
  game_id: string
  token_hash: string
  created_at: string
  expires_at: string
  redeemed_at: string | null
}

export type RedeemInviteResult = { ok: true; organiserId: string } | { ok: false; reason: 'invalid' | 'expired' | 'redeemed' }
export type RedeemMarshalInviteResult = { ok: true; gameId: string } | { ok: false; reason: 'invalid' | 'expired' | 'redeemed' }

/** Everything the game actions need from the database. */
export interface GameStore {
  createGame(g: Omit<GameRow, 'id'>): Promise<Game>
  gameByCode(code: string): Promise<GameRow | null>
  updateGame(id: string, patch: Partial<GameRow>): Promise<void>
  /**
   * The packing list: atomically sets one key of `kit.ticks` or `kit.placed` (a label, or true), or removes it
   * (null), leaving every other key as it is, so two phones ticking at once never drop each other's ticks.
   */
  setKitKey(gameId: string, group: 'ticks' | 'placed', key: string, value: string | true | null): Promise<void>
  /**
   * Every game not yet ended (ended_at unset) by any organiser in the organisation that has started, or was made
   * after `createdAfter` (ISO), so abandoned lobbies drop out and the list stays small.
   */
  unfinishedGames(organisationId: string, createdAfter: string): Promise<GameRow[]>
  /** The organisation's six secret cards, A-C yellow and A-C purple; missing ones are made `ready`, with fresh codes, on first read. */
  secretCards(organisationId: string): Promise<SecretCard[]>
  setSecretCard(id: string, patch: Partial<Pick<SecretCard, 'code' | 'state' | 'found_at'>>): Promise<void>
  addPlayer(p: Omit<PlayerRow, 'id'>): Promise<Player>
  /** Includes removed players, so their page can tell them they were removed. */
  playerByToken(gameId: string, tokenHash: string): Promise<Player | null>
  /** Everyone still in the game (removed players are left out). */
  players(gameId: string): Promise<Player[]>
  updatePlayers(patches: { id: string; patch: Partial<Player> }[]): Promise<void>
  /** Marks a runner caught only if they are not already jailed; true for the first caller. */
  catchRunner(id: string, by: string | null): Promise<boolean>
  /** Atomically counts one more draw from a side's deck; returns the draw number (0 for the first). */
  drawCard(gameId: string, side: 'runner' | 'chaser'): Promise<number>
  /** Frees an auto-jailed runner (jailed, no chaser) only if still in that state; true for the first caller. */
  releaseAutoJailed(id: string, atIso: string): Promise<boolean>
  /**
   * With `minGapMs`, writes nothing and returns false when the player already has a fix newer than that.
   * With `since` (ms) too, only fixes at or after `since` count against the gap, so the first fix inside an
   * open check-in window always lands.
   */
  addPosition(gameId: string, playerId: string, p: Omit<Position, 'at'>, minGapMs?: number, since?: number): Promise<boolean>
  /**
   * Each player's latest position at or before each of the given times (deduplicated, ascending).
   * Bounded by players × times, so it stays small however long the game runs.
   */
  latestPositions(gameId: string, atIsos: string[]): Promise<Record<string, Position[]>>
  addPings(pings: Ping[]): Promise<void>
  pings(gameId: string): Promise<Ping[]>
  /** Sets the flag only if it was false; true for the first caller. */
  claimPing(gameId: string, seq: number, field: 'alerted' | 'revealed'): Promise<boolean>
  /** Ends the game only if it has not ended; true for the first caller. */
  claimEnd(gameId: string, winner: 'runners' | 'chasers'): Promise<boolean>
  addEvent(e: Omit<GameEvent, 'id' | 'at'>): Promise<GameEvent>
  events(gameId: string): Promise<GameEvent[]>
  /** claimed_at = the store's clock. */
  addPowerUp(p: NewPowerUp): Promise<PowerUp>
  powerUps(gameId: string): Promise<PowerUp[]>
  updatePowerUp(id: string, patch: Partial<PowerUp>): Promise<void>
  /**
   * Atomically claims a station: refuses if this player already claimed it, or anyone claimed it
   * less than `lockMs` ago. Otherwise stores the power-up (claimed_at = store clock).
   */
  claimStation(p: NewPowerUp, lockMs: number): Promise<StationClaim>
  /** Marks a power-up used only if it wasn't already; true for the first caller. */
  markUsed(id: string): Promise<boolean>
  /**
   * Toyol / Ah Long (power-ups §6.2): atomically picks a random eligible player on `side` (Ah Long's
   * runners must be free, not jailed), then a random card of theirs, and marks it taken (`taken_at`).
   * Eligible cards are unused, unconsumed, untaken, unsealed and not Dato Seri. Null if nothing qualifies.
   * `rng` is for the in-memory store only; Postgres uses random().
   */
  stealFrom(gameId: string, side: 'runner' | 'chaser', rng?: () => number): Promise<StolenCard | null>
  /**
   * Abang Grab, on use (power-ups §6.3): atomically, if the Grab is still held (unused, untaken), reserves
   * the next `n` draw numbers of `side`'s deck in one step and remembers the first on the Grab. A Grab that
   * already reserved its draws returns the same first number (and its stored offer) without drawing again.
   * Null if the Grab is gone.
   */
  openGrab(powerupId: string, side: 'runner' | 'chaser', n: number): Promise<{ first: number; offer: PowerUpKind[] | null } | null>
  /**
   * Abang Grab, on pick: atomically checks the Grab is this player's, still held and has an offer, marks it
   * used and adds the chosen card (offer[choice]) to the player's slot, sealed, with no station.
   */
  pickGrab(powerupId: string, playerId: string, choice: number): Promise<GrabPick>
  /**
   * Dato Seri's hidden stash (jail design §4b): atomically, if the game has a stash nobody has claimed, marks
   * it claimed by this player (claimedAt = store clock) and gives them the 'dato' card, with no station.
   * Null if there's no stash or someone got there first.
   */
  claimDato(gameId: string, playerId: string): Promise<PowerUp | null>
  /**
   * Claims Bomoh's dropped stash for a player, stamping it claimed at `at`. Returns true only for the one caller
   * who wins; no powerups row is inserted, since Bomoh activates on claim. False if nothing was dropped or it's
   * already claimed.
   */
  claimBomoh(gameId: string, playerId: string, at: Date): Promise<boolean>
  /** Consumes a shield only if it wasn't already; true for the first caller. */
  consumeShield(id: string): Promise<boolean>
  /** Adds a bonus (Flare) ping with the next free bonus number; safe when two happen at once. */
  /** Adds surprise ping `seq` only if that number is free; false if another one took it first. */
  addBonusPing(gameId: string, seq: number, alertAt: string, revealAt: string): Promise<boolean>
  /** Pauses a started, unfinished, unpaused game (paused_at = store clock); true for the first caller. */
  pauseGame(gameId: string): Promise<boolean>
  /**
   * Atomically ends the pause: records it, clears paused_at, and moves every unrevealed ping later
   * by its length. Returns that length in ms, or null if the game wasn't paused.
   */
  resumeGame(gameId: string): Promise<number | null>
  /** Writes the flag only if it differs; true if it changed. */
  setFlag(playerId: string, field: 'outside' | 'left_start', value: boolean): Promise<boolean>
  /**
   * Luar Garisan, atomic and decided from the stored row: unchanged if already disqualified; else the first call
   * sets out_warned_at (warned); a later one at least LUAR_GARISAN_GRACE_MS after it sets disqualified_at
   * (disqualified), and one sooner is unchanged.
   */
  markOutside(playerId: string, at: string): Promise<'warned' | 'disqualified' | 'unchanged'>
  /** A report back inside: clears a pending (non-null) warning, never a disqualification. */
  clearOutWarning(playerId: string): Promise<void>
  /** Sets removed_at only if it was unset; true for the first caller. */
  removePlayer(id: string): Promise<boolean>
  /** Kept apart from game data (spec §6); at = store clock. The app never reads these back. */
  addSafetyRecord(r: SafetyRecord): Promise<void>
  createOrganisation(o: Omit<Organisation, 'id'>): Promise<Organisation>
  createOrganiser(o: Omit<OrganiserRow, 'id'>): Promise<OrganiserRow>
  organiserBySessionTokenHash(hash: string): Promise<OrganiserRow | null>
  organiserById(id: string): Promise<OrganiserRow | null>
  createOrganiserInvite(inv: Omit<OrganiserInviteRow, 'id'>): Promise<OrganiserInviteRow>
  /** Atomically claims the invite (unredeemed, unexpired at `now`), then creates or re-links the organiser. */
  redeemOrganiserInvite(tokenHash: string, now: number, sessionTokenHash: string): Promise<RedeemInviteResult>
  createMarshalInvite(inv: Omit<MarshalInviteRow, 'id'>): Promise<MarshalInviteRow>
  /** Atomically claims the invite (unredeemed, unexpired at `now`, for this specific game). */
  redeemMarshalInvite(tokenHash: string, now: number, gameId: string): Promise<RedeemMarshalInviteResult>
  /** created_at = updated_at = store clock. */
  addArena(r: NewSavedArena): Promise<SavedArenaRow>
  /** updated_at = store clock. */
  updateArena(id: string, patch: Partial<Pick<SavedArenaRow, 'name' | 'draft' | 'arena' | 'water_checked'>>): Promise<void>
  arenaById(id: string): Promise<SavedArenaRow | null>
  /** Newest updated first. */
  arenasFor(organisationId: string): Promise<SavedArenaRow[]>
  deleteArena(id: string): Promise<void>
  /** The cached body, or null if missing or older than maxAgeMs by the store clock. */
  osmCacheGet(key: string, maxAgeMs: number): Promise<unknown | null>
  /** fetched_at = store clock; replaces any earlier entry. */
  osmCachePut(key: string, body: unknown): Promise<void>
  /** Counts this request in the current window for `key`; true while it is within `limit`. */
  hitRateLimit(key: string, windowMs: number, limit: number): Promise<boolean>
}

/** A park set up once and reused (Plan 4b). Games copy `arena`; the saved row is never changed by a game. */
export interface SavedArenaRow {
  id: string
  organisation_id: string
  name: string
  /** What the organiser chose, kept so the lakes can be re-checked and the area rebuilt. */
  draft: ArenaDraft
  arena: Arena
  water_checked: boolean
  created_at: string
  updated_at: string
}

export type NewSavedArena = Omit<SavedArenaRow, 'id' | 'created_at' | 'updated_at'>

export interface SafetyRecord {
  game_id: string
  type: 'sos' | 'report' | 'removed' | 'auto-jail-undone'
  player_id: string | null
  target_id: string | null
  lat: number | null
  lng: number | null
  data: Record<string, unknown>
}

export interface StolenCard {
  stolenFrom: string
  kind: PowerUpKind
  powerupId: string
}

export type StationClaim =
  | { ok: true; powerUp: PowerUp }
  | { ok: false; reason: 'already-claimed' | 'locked'; lockedForMs?: number }

export type GrabPick =
  | { ok: true; powerUp: PowerUp }
  | { ok: false; reason: 'not-yours' | 'already-used' | 'taken' | 'no-offer' | 'bad-choice' }

export type NewPowerUp = Omit<PowerUp, 'id' | 'claimed_at' | 'used_at' | 'consumed_at' | 'sealed' | 'taken_at' | 'offer'>

/** In-memory store for tests. */
export class MemoryStore implements GameStore {
  private clock: () => number
  private seq = 0
  private games: GameRow[] = []
  private playerRows: PlayerRow[] = []
  private locs: (Position & { game_id: string; player_id: string })[] = []
  private pingRows: Ping[] = []
  private eventRows: GameEvent[] = []
  private powerUpRows: PowerUp[] = []
  /** Abang Grab id → the first draw number it reserved (the `offer_from` column in Postgres). */
  private grabFrom = new Map<string, number>()
  safetyRows: (SafetyRecord & { at: string })[] = []
  private organisationRows: Organisation[] = []
  private organiserRows: OrganiserRow[] = []
  private organiserInviteRows: OrganiserInviteRow[] = []
  private marshalInviteRows: MarshalInviteRow[] = []
  private arenaRows: SavedArenaRow[] = []
  private osmCacheRows = new Map<string, { body: unknown; fetched_at: number }>()
  private secretCardRows: SecretCard[] = []
  private rateRows = new Map<string, number>()

  constructor(clock: () => number) {
    this.clock = clock
  }

  private id(prefix: string) {
    return `${prefix}${++this.seq}`
  }
  private nowIso() {
    return new Date(this.clock()).toISOString()
  }
  private strip<T extends object>(row: T, key: string): T {
    const copy = { ...row } as Record<string, unknown>
    delete copy[key]
    return copy as T
  }

  async createGame(g: Omit<GameRow, 'id'>) {
    // created_at = the store clock, like the column's default.
    const row = { created_at: this.nowIso(), ...g, id: this.id('g') }
    this.games.push(row)
    const { organiser_id, ...rest } = row
    return rest as Game
  }
  async gameByCode(code: string) {
    const g = this.games.find((x) => x.code === code)
    return g ? { ...g } : null
  }
  async updateGame(id: string, patch: Partial<GameRow>) {
    const g = this.games.find((x) => x.id === id)
    if (g) Object.assign(g, patch)
  }
  async setKitKey(gameId: string, group: 'ticks' | 'placed', key: string, value: string | true | null) {
    // No await between the read and the write, so it's atomic here.
    const g = this.games.find((x) => x.id === gameId)
    if (!g) return
    const kit = { ticks: { ...(g.kit?.ticks ?? {}) }, placed: { ...(g.kit?.placed ?? {}) } }
    const into = kit[group] as Record<string, string | boolean>
    if (value === null) delete into[key]
    else into[key] = value
    g.kit = kit
  }
  async unfinishedGames(organisationId: string, createdAfter: string) {
    const organisers = new Set(this.organiserRows.filter((o) => o.organisation_id === organisationId).map((o) => o.id))
    return this.games
      .filter(
        (g) =>
          organisers.has(g.organiser_id) &&
          !g.ended_at &&
          (g.started_at || !g.created_at || g.created_at > createdAfter || typeof g.dato_stash?.lat === 'number'),
      )
      .map((g) => ({ ...g }))
  }
  async secretCards(organisationId: string) {
    for (const legendary of ['dato', 'bomoh'] as const) {
      for (const letter of ['A', 'B', 'C'] as const) {
        const has = this.secretCardRows.some((c) => c.organisation_id === organisationId && c.legendary === legendary && c.letter === letter)
        if (!has) {
          this.secretCardRows.push({ id: this.id('sc'), organisation_id: organisationId, legendary, letter, code: newDatoCode(), state: 'ready', found_at: null })
        }
      }
    }
    return this.secretCardRows.filter((c) => c.organisation_id === organisationId).map((c) => ({ ...c }))
  }
  async setSecretCard(id: string, patch: Partial<Pick<SecretCard, 'code' | 'state' | 'found_at'>>) {
    const c = this.secretCardRows.find((x) => x.id === id)
    if (c) Object.assign(c, patch)
  }
  async addPlayer(p: Omit<PlayerRow, 'id'>) {
    const row = { ...p, id: this.id('p') }
    this.playerRows.push(row)
    return this.strip(row, 'token_hash')
  }
  async playerByToken(gameId: string, tokenHash: string) {
    const p = this.playerRows.find((x) => x.game_id === gameId && x.token_hash === tokenHash)
    return p ? this.strip(p, 'token_hash') : null
  }
  async players(gameId: string) {
    return this.playerRows.filter((x) => x.game_id === gameId && !x.removed_at).map((p) => this.strip(p, 'token_hash'))
  }
  async updatePlayers(patches: { id: string; patch: Partial<Player> }[]) {
    for (const { id, patch } of patches) {
      const p = this.playerRows.find((x) => x.id === id)
      if (p) Object.assign(p, patch)
    }
  }
  async drawCard(gameId: string, side: 'runner' | 'chaser') {
    const g = this.games.find((x) => x.id === gameId)!
    const key = side === 'runner' ? 'runner_draws' : 'chaser_draws'
    const n = g[key] ?? 0
    g[key] = n + 1
    return n
  }
  async releaseAutoJailed(id: string, atIso: string) {
    const p = this.playerRows.find((x) => x.id === id)
    if (!p || !p.jailed || p.caught_by !== null) return false
    Object.assign(p, { jailed: false, caught_at: null, freed_at: atIso, out_warned_at: null })
    return true
  }
  async catchRunner(id: string, by: string | null) {
    const p = this.playerRows.find((x) => x.id === id)
    if (!p || p.jailed || p.disqualified_at) return false
    Object.assign(p, { jailed: true, caught_at: this.nowIso(), caught_by: by, out_warned_at: null })
    return true
  }
  async addPosition(gameId: string, playerId: string, p: Omit<Position, 'at'>, minGapMs?: number, since?: number) {
    // No await between the check and the push, so two calls can't both pass the gap.
    if (minGapMs !== undefined) {
      const cutoff = new Date(this.clock() - minGapMs).toISOString()
      const from = since === undefined ? null : new Date(since).toISOString()
      if (this.locs.some((l) => l.player_id === playerId && l.at > cutoff && (from === null || l.at >= from))) return false
    }
    this.locs.push({ ...p, at: this.nowIso(), game_id: gameId, player_id: playerId })
    return true
  }
  async latestPositions(gameId: string, atIsos: string[]) {
    const out: Record<string, Position[]> = {}
    for (const t of atIsos) {
      const best = new Map<string, Position & { game_id: string; player_id: string }>()
      for (const l of this.locs) {
        if (l.game_id !== gameId || l.at > t) continue
        const cur = best.get(l.player_id)
        if (!cur || l.at >= cur.at) best.set(l.player_id, l)
      }
      for (const [id, l] of best) {
        const list = (out[id] ??= [])
        if (!list.some((p) => p.at === l.at)) list.push({ lat: l.lat, lng: l.lng, accuracy_m: l.accuracy_m, at: l.at })
      }
    }
    for (const list of Object.values(out)) list.sort((a, b) => a.at.localeCompare(b.at))
    return out
  }
  /** Bulk read for tests only — the game must never depend on reading every row. */
  async positions(gameId: string, sinceIso: string) {
    const out: Record<string, Position[]> = {}
    for (const l of this.locs) {
      if (l.game_id !== gameId || l.at < sinceIso) continue
      ;(out[l.player_id] ??= []).push({ lat: l.lat, lng: l.lng, accuracy_m: l.accuracy_m, at: l.at })
    }
    return out
  }
  async addPings(pings: Ping[]) {
    // Mirror the database's primary key on (game_id, seq).
    for (const p of pings) {
      if (this.pingRows.some((x) => x.game_id === p.game_id && x.seq === p.seq)) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "pings_pkey"'), { code: '23505' })
      }
    }
    this.pingRows.push(...pings.map((p) => ({ ...p })))
  }
  async pings(gameId: string) {
    return this.pingRows.filter((p) => p.game_id === gameId).map((p) => ({ ...p }))
  }
  async claimPing(gameId: string, seq: number, field: 'alerted' | 'revealed') {
    const p = this.pingRows.find((x) => x.game_id === gameId && x.seq === seq)
    if (!p || p[field]) return false
    p[field] = true
    return true
  }
  async claimEnd(gameId: string, winner: 'runners' | 'chasers') {
    const g = this.games.find((x) => x.id === gameId)
    if (!g || g.ended_at) return false
    g.ended_at = this.nowIso()
    g.winner = winner
    return true
  }
  async addEvent(e: Omit<GameEvent, 'id' | 'at'>) {
    const row = { ...e, id: this.id('e'), at: this.nowIso() }
    this.eventRows.push(row)
    return { ...row }
  }
  async events(gameId: string) {
    return this.eventRows.filter((e) => e.game_id === gameId).map((e) => ({ ...e }))
  }
  async addPowerUp(p: NewPowerUp) {
    const row: PowerUp = { ...p, id: this.id('u'), claimed_at: this.nowIso(), used_at: null, consumed_at: null, sealed: false, taken_at: null, offer: null }
    this.powerUpRows.push(row)
    return { ...row }
  }
  async powerUps(gameId: string) {
    return this.powerUpRows.filter((u) => u.game_id === gameId).map((u) => ({ ...u }))
  }
  async updatePowerUp(id: string, patch: Partial<PowerUp>) {
    const u = this.powerUpRows.find((x) => x.id === id)
    if (u) Object.assign(u, patch)
  }
  // The methods below check and write with no await in between, so they're atomic here.
  async claimStation(p: NewPowerUp, lockMs: number): Promise<StationClaim> {
    const here = this.powerUpRows.filter((u) => u.game_id === p.game_id && u.station === p.station)
    if (here.some((u) => u.player_id === p.player_id)) return { ok: false, reason: 'already-claimed' }
    const last = Math.max(...here.map((u) => Date.parse(u.claimed_at)), -Infinity)
    const lockedForMs = last + lockMs - this.clock()
    if (lockedForMs > 0) return { ok: false, reason: 'locked', lockedForMs }
    const row: PowerUp = { ...p, id: this.id('u'), claimed_at: this.nowIso(), used_at: null, consumed_at: null, sealed: false, taken_at: null, offer: null }
    this.powerUpRows.push(row)
    return { ok: true, powerUp: { ...row } }
  }
  async markUsed(id: string) {
    const u = this.powerUpRows.find((x) => x.id === id)
    if (!u || u.used_at || u.taken_at) return false // a card Toyol or Ah Long took can't be used
    u.used_at = this.nowIso()
    return true
  }
  async stealFrom(gameId: string, side: 'runner' | 'chaser', rng: () => number = Math.random): Promise<StolenCard | null> {
    const pick = <T,>(xs: T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]
    const stealable = (u: PowerUp) =>
      u.game_id === gameId && !u.used_at && !u.consumed_at && !u.taken_at && !u.sealed && u.kind !== 'dato' // Dato Seri is immune
    const owners = this.playerRows
      .filter((p) => p.game_id === gameId && p.role === side && !p.removed_at && !p.disqualified_at && !(side === 'runner' && p.jailed))
      .filter((p) => this.powerUpRows.some((u) => u.player_id === p.id && stealable(u)))
    if (!owners.length) return null
    const victim = pick(owners)
    const card = pick(this.powerUpRows.filter((u) => u.player_id === victim.id && stealable(u)))
    card.taken_at = this.nowIso()
    return { stolenFrom: victim.id, kind: card.kind, powerupId: card.id }
  }
  async openGrab(powerupId: string, side: 'runner' | 'chaser', n: number) {
    const u = this.powerUpRows.find((x) => x.id === powerupId)
    if (!u || u.used_at || u.taken_at) return null
    const reserved = this.grabFrom.get(u.id)
    if (reserved !== undefined) return { first: reserved, offer: u.offer ? [...u.offer] : null }
    const g = this.games.find((x) => x.id === u.game_id)!
    const key = side === 'runner' ? 'runner_draws' : 'chaser_draws'
    const first = g[key] ?? 0
    g[key] = first + n
    this.grabFrom.set(u.id, first)
    return { first, offer: null }
  }
  async pickGrab(powerupId: string, playerId: string, choice: number): Promise<GrabPick> {
    const u = this.powerUpRows.find((x) => x.id === powerupId)
    if (!u || u.player_id !== playerId) return { ok: false, reason: 'not-yours' }
    // Toyol or Ah Long took it while its offer was open: say so, rather than "already used".
    if (u.taken_at) return { ok: false, reason: 'taken' }
    if (u.used_at) return { ok: false, reason: 'already-used' }
    if (!u.offer) return { ok: false, reason: 'no-offer' }
    if (!Number.isInteger(choice) || choice < 0 || choice >= u.offer.length) return { ok: false, reason: 'bad-choice' }
    u.used_at = this.nowIso()
    const row: PowerUp = {
      id: this.id('u'),
      game_id: u.game_id,
      player_id: playerId,
      kind: u.offer[choice],
      station: null,
      claimed_at: this.nowIso(),
      used_at: null,
      consumed_at: null,
      sealed: true,
      taken_at: null,
      offer: null,
    }
    this.powerUpRows.push(row)
    return { ok: true, powerUp: { ...row } }
  }
  async claimDato(gameId: string, playerId: string) {
    const g = this.games.find((x) => x.id === gameId)
    // Not dropped yet (no spot), or already claimed: nothing to take.
    if (!g?.dato_stash || typeof g.dato_stash.lat !== 'number' || g.dato_stash.claimedBy !== null) return null
    // A fresh object: gameByCode hands out shallow copies that share the old one.
    g.dato_stash = { ...g.dato_stash, claimedBy: playerId, claimedAt: this.nowIso() }
    const row: PowerUp = {
      id: this.id('u'),
      game_id: gameId,
      player_id: playerId,
      kind: 'dato',
      station: null,
      claimed_at: this.nowIso(),
      used_at: null,
      consumed_at: null,
      sealed: false,
      taken_at: null,
      offer: null,
    }
    this.powerUpRows.push(row)
    return { ...row }
  }
  async claimBomoh(gameId: string, playerId: string, at: Date) {
    const g = this.games.find((x) => x.id === gameId)
    // Not dropped yet (no spot), or already claimed: nothing to take.
    if (!g?.bomoh_stash || typeof g.bomoh_stash.lat !== 'number' || g.bomoh_stash.claimedBy !== null) return false
    // A fresh object: gameByCode hands out shallow copies that share the old one.
    g.bomoh_stash = { ...g.bomoh_stash, claimedBy: playerId, claimedAt: at.toISOString() }
    return true
  }
  async consumeShield(id: string) {
    const u = this.powerUpRows.find((x) => x.id === id)
    if (!u || u.consumed_at) return false
    u.consumed_at = this.nowIso()
    return true
  }
  async addBonusPing(gameId: string, seq: number, alertAt: string, revealAt: string) {
    if (this.pingRows.some((p) => p.game_id === gameId && p.seq === seq)) return false
    this.pingRows.push({ game_id: gameId, seq, alert_at: alertAt, reveal_at: revealAt, alerted: false, revealed: false })
    return true
  }
  async pauseGame(gameId: string) {
    const g = this.games.find((x) => x.id === gameId)
    if (!g || !g.started_at || g.ended_at || g.paused_at) return false
    g.paused_at = this.nowIso()
    return true
  }
  async resumeGame(gameId: string) {
    const g = this.games.find((x) => x.id === gameId)
    if (!g?.paused_at) return null
    const d = this.clock() - Date.parse(g.paused_at)
    g.pauses = [...g.pauses, { from: g.paused_at, to: this.nowIso() }]
    g.paused_at = null
    const shift = (t: string) => new Date(Date.parse(t) + d).toISOString()
    for (const p of this.pingRows) {
      if (p.game_id !== gameId || p.revealed) continue
      p.alert_at = shift(p.alert_at)
      p.reveal_at = shift(p.reveal_at)
    }
    return d
  }
  async setFlag(playerId: string, field: 'outside' | 'left_start', value: boolean) {
    const p = this.playerRows.find((x) => x.id === playerId)
    if (!p || p[field] === value) return false
    p[field] = value
    return true
  }
  async markOutside(playerId: string, at: string) {
    const p = this.playerRows.find((x) => x.id === playerId)
    if (!p || p.disqualified_at || p.jailed) return 'unchanged' as const
    if (!p.out_warned_at) {
      p.out_warned_at = at
      return 'warned' as const
    }
    if (Date.parse(at) - Date.parse(p.out_warned_at) < LUAR_GARISAN_GRACE_MS) return 'unchanged' as const
    p.disqualified_at = at
    return 'disqualified' as const
  }
  async clearOutWarning(playerId: string) {
    const p = this.playerRows.find((x) => x.id === playerId)
    if (p && !p.disqualified_at) p.out_warned_at = null
  }
  async removePlayer(id: string) {
    const p = this.playerRows.find((x) => x.id === id)
    if (!p || p.removed_at) return false
    p.removed_at = this.nowIso()
    return true
  }
  async addSafetyRecord(r: SafetyRecord) {
    this.safetyRows.push({ ...r, at: this.nowIso() })
  }
  async createOrganisation(o: Omit<Organisation, 'id'>) {
    const row = { ...o, id: this.id('org') }
    this.organisationRows.push(row)
    return { ...row }
  }
  async createOrganiser(o: Omit<OrganiserRow, 'id'>) {
    const row = { ...o, id: this.id('r') }
    this.organiserRows.push(row)
    return { ...row }
  }
  async organiserBySessionTokenHash(hash: string) {
    const r = this.organiserRows.find((x) => x.session_token_hash === hash)
    return r ? { ...r } : null
  }
  async organiserById(id: string) {
    const r = this.organiserRows.find((x) => x.id === id)
    return r ? { ...r } : null
  }
  async createOrganiserInvite(inv: Omit<OrganiserInviteRow, 'id'>) {
    const row = { ...inv, id: this.id('oi') }
    this.organiserInviteRows.push(row)
    return { ...row }
  }
  async redeemOrganiserInvite(tokenHash: string, now: number, sessionTokenHash: string): Promise<RedeemInviteResult> {
    const inv = this.organiserInviteRows.find((x) => x.token_hash === tokenHash)
    if (!inv) return { ok: false, reason: 'invalid' }
    if (inv.redeemed_at) return { ok: false, reason: 'redeemed' }
    if (now >= Date.parse(inv.expires_at)) return { ok: false, reason: 'expired' }
    inv.redeemed_at = new Date(now).toISOString()
    if (inv.organiser_id) {
      const existing = this.organiserRows.find((x) => x.id === inv.organiser_id)!
      existing.session_token_hash = sessionTokenHash
      existing.session_created_at = new Date(now).toISOString()
      return { ok: true, organiserId: existing.id }
    }
    const created = await this.createOrganiser({
      organisation_id: inv.organisation_id,
      name: inv.name,
      created_at: new Date(now).toISOString(),
      session_token_hash: sessionTokenHash,
      session_created_at: new Date(now).toISOString(),
    })
    return { ok: true, organiserId: created.id }
  }
  async createMarshalInvite(inv: Omit<MarshalInviteRow, 'id'>) {
    const row = { ...inv, id: this.id('mi') }
    this.marshalInviteRows.push(row)
    return { ...row }
  }
  async redeemMarshalInvite(tokenHash: string, now: number, gameId: string): Promise<RedeemMarshalInviteResult> {
    const inv = this.marshalInviteRows.find((x) => x.token_hash === tokenHash && x.game_id === gameId)
    if (!inv) return { ok: false, reason: 'invalid' }
    if (inv.redeemed_at) return { ok: false, reason: 'redeemed' }
    if (now >= Date.parse(inv.expires_at)) return { ok: false, reason: 'expired' }
    inv.redeemed_at = new Date(now).toISOString()
    return { ok: true, gameId: inv.game_id }
  }
  async addArena(r: NewSavedArena) {
    const row: SavedArenaRow = { ...r, id: this.id('ar'), created_at: this.nowIso(), updated_at: this.nowIso() }
    this.arenaRows.push(row)
    return structuredClone(row)
  }
  async updateArena(id: string, patch: Partial<Pick<SavedArenaRow, 'name' | 'draft' | 'arena' | 'water_checked'>>) {
    const row = this.arenaRows.find((x) => x.id === id)
    if (row) Object.assign(row, structuredClone(patch), { updated_at: this.nowIso() })
  }
  async arenaById(id: string) {
    const row = this.arenaRows.find((x) => x.id === id)
    return row ? structuredClone(row) : null
  }
  async arenasFor(organisationId: string) {
    return this.arenaRows
      .filter((x) => x.organisation_id === organisationId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((x) => structuredClone(x))
  }
  async deleteArena(id: string) {
    this.arenaRows = this.arenaRows.filter((x) => x.id !== id)
  }
  async osmCacheGet(key: string, maxAgeMs: number) {
    const hit = this.osmCacheRows.get(key)
    return hit && this.clock() - hit.fetched_at < maxAgeMs ? structuredClone(hit.body) : null
  }
  async osmCachePut(key: string, body: unknown) {
    this.osmCacheRows.set(key, { body: structuredClone(body), fetched_at: this.clock() })
  }
  async hitRateLimit(key: string, windowMs: number, limit: number) {
    const windowStart = Math.floor(this.clock() / windowMs) * windowMs
    for (const k of this.rateRows.keys()) if (!k.endsWith(`|${windowStart}`)) this.rateRows.delete(k)
    const id = `${key}|${windowStart}`
    const count = (this.rateRows.get(id) ?? 0) + 1
    this.rateRows.set(id, count)
    return count <= limit
  }
}
