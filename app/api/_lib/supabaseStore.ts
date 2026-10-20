import type { SupabaseClient } from '@supabase/supabase-js'
import type { Game, GameEvent, Ping, Player, Position } from '../../shared/types.js'
import type { GameRow, GameStore, PlayerRow } from './store.js'

const PLAYER_COLUMNS = 'id, game_id, name, role, tag_id, accepted_at, caught_at, caught_by, jailed, freed_once, push'
const GAME_COLUMNS = 'id, code, arena, settings, started_at, ended_at, winner'

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Production store. Uses the secret key; the game tables deny the anon role entirely. */
export class SupabaseStore implements GameStore {
  private db: SupabaseClient

  constructor(db: SupabaseClient) {
    this.db = db
  }

  async createGame(g: Omit<GameRow, 'id'>): Promise<Game> {
    return check(await this.db.from('games').insert(g).select(GAME_COLUMNS).single()) as Game
  }
  async gameByCode(code: string): Promise<GameRow | null> {
    return check(await this.db.from('games').select('*').eq('code', code).maybeSingle()) as GameRow | null
  }
  async updateGame(id: string, patch: Partial<Game>) {
    check(await this.db.from('games').update(patch).eq('id', id))
  }
  async addPlayer(p: Omit<PlayerRow, 'id'>): Promise<Player> {
    return check(await this.db.from('players').insert(p).select(PLAYER_COLUMNS).single()) as Player
  }
  async playerByToken(gameId: string, tokenHash: string): Promise<Player | null> {
    return check(
      await this.db.from('players').select(PLAYER_COLUMNS).eq('game_id', gameId).eq('token_hash', tokenHash).maybeSingle(),
    ) as Player | null
  }
  async players(gameId: string): Promise<Player[]> {
    return check(await this.db.from('players').select(PLAYER_COLUMNS).eq('game_id', gameId).order('accepted_at')) as Player[]
  }
  async updatePlayers(patches: { id: string; patch: Partial<Player> }[]) {
    for (const { id, patch } of patches) check(await this.db.from('players').update(patch).eq('id', id))
  }
  async catchRunner(id: string, by: string) {
    const rows = check(
      await this.db
        .from('players')
        .update({ jailed: true, caught_at: new Date().toISOString(), caught_by: by })
        .eq('id', id)
        .eq('jailed', false)
        .select('id'),
    )
    return (rows ?? []).length > 0
  }
  async addPosition(gameId: string, playerId: string, p: Omit<Position, 'at'>) {
    check(await this.db.from('locations').insert({ game_id: gameId, player_id: playerId, ...p }))
  }
  async latestPositions(gameId: string, atIsos: string[]) {
    const out: Record<string, Position[]> = {}
    for (const at of [...new Set(atIsos)]) {
      const rows = check(await this.db.rpc('latest_positions', { p_game: gameId, p_at: at })) as
        | (Position & { player_id: string })[]
        | null
      for (const { player_id, ...p } of rows ?? []) {
        const list = (out[player_id] ??= [])
        if (!list.some((x) => x.at === p.at)) list.push(p)
      }
    }
    for (const list of Object.values(out)) list.sort((a, b) => a.at.localeCompare(b.at))
    return out
  }
  async addPings(pings: Ping[]) {
    check(await this.db.from('pings').insert(pings))
  }
  async pings(gameId: string): Promise<Ping[]> {
    return check(await this.db.from('pings').select('*').eq('game_id', gameId).order('seq')) as Ping[]
  }
  async claimPing(gameId: string, seq: number, field: 'alerted' | 'revealed') {
    const rows = check(
      await this.db
        .from('pings')
        .update({ [field]: true })
        .eq('game_id', gameId)
        .eq('seq', seq)
        .eq(field, false)
        .select('seq'),
    )
    return (rows ?? []).length > 0
  }
  async claimEnd(gameId: string, winner: 'runners' | 'chasers') {
    const rows = check(
      await this.db
        .from('games')
        .update({ ended_at: new Date().toISOString(), winner })
        .eq('id', gameId)
        .is('ended_at', null)
        .select('id'),
    )
    return (rows ?? []).length > 0
  }
  async addEvent(e: Omit<GameEvent, 'id' | 'at'>) {
    check(await this.db.from('events').insert(e))
  }
  async events(gameId: string): Promise<GameEvent[]> {
    return check(await this.db.from('events').select('*').eq('game_id', gameId).order('at')) as GameEvent[]
  }
}
