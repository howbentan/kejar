import type { Game, GameEvent, Ping, Player, Position, PowerUp } from '../../shared/types.js'

export type GameRow = Game & { host_key_hash: string }
export type PlayerRow = Player & { token_hash: string }

/** Everything the game actions need from the database. */
export interface GameStore {
  createGame(g: Omit<GameRow, 'id'>): Promise<Game>
  gameByCode(code: string): Promise<GameRow | null>
  updateGame(id: string, patch: Partial<Game>): Promise<void>
  addPlayer(p: Omit<PlayerRow, 'id'>): Promise<Player>
  playerByToken(gameId: string, tokenHash: string): Promise<Player | null>
  players(gameId: string): Promise<Player[]>
  updatePlayers(patches: { id: string; patch: Partial<Player> }[]): Promise<void>
  /** Marks a runner caught only if they are not already jailed; true for the first caller. */
  catchRunner(id: string, by: string): Promise<boolean>
  addPosition(gameId: string, playerId: string, p: Omit<Position, 'at'>): Promise<void>
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
  addEvent(e: Omit<GameEvent, 'id' | 'at'>): Promise<void>
  events(gameId: string): Promise<GameEvent[]>
  /** claimed_at = the store's clock. */
  addPowerUp(p: NewPowerUp): Promise<PowerUp>
  powerUps(gameId: string): Promise<PowerUp[]>
  updatePowerUp(id: string, patch: Partial<PowerUp>): Promise<void>
}

export type NewPowerUp = Omit<PowerUp, 'id' | 'claimed_at' | 'used_at' | 'consumed_at'>

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
    const row = { ...g, id: this.id('g') }
    this.games.push(row)
    return this.strip(row, 'host_key_hash')
  }
  async gameByCode(code: string) {
    const g = this.games.find((x) => x.code === code)
    return g ? { ...g } : null
  }
  async updateGame(id: string, patch: Partial<Game>) {
    const g = this.games.find((x) => x.id === id)
    if (g) Object.assign(g, patch)
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
    return this.playerRows.filter((x) => x.game_id === gameId).map((p) => this.strip(p, 'token_hash'))
  }
  async updatePlayers(patches: { id: string; patch: Partial<Player> }[]) {
    for (const { id, patch } of patches) {
      const p = this.playerRows.find((x) => x.id === id)
      if (p) Object.assign(p, patch)
    }
  }
  async catchRunner(id: string, by: string) {
    const p = this.playerRows.find((x) => x.id === id)
    if (!p || p.jailed) return false
    Object.assign(p, { jailed: true, caught_at: this.nowIso(), caught_by: by })
    return true
  }
  async addPosition(gameId: string, playerId: string, p: Omit<Position, 'at'>) {
    this.locs.push({ ...p, at: this.nowIso(), game_id: gameId, player_id: playerId })
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
    this.eventRows.push({ ...e, id: this.id('e'), at: this.nowIso() })
  }
  async events(gameId: string) {
    return this.eventRows.filter((e) => e.game_id === gameId).map((e) => ({ ...e }))
  }
  async addPowerUp(p: NewPowerUp) {
    const row: PowerUp = { ...p, id: this.id('u'), claimed_at: this.nowIso(), used_at: null, consumed_at: null }
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
}
