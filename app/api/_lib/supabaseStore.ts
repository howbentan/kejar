import type { SupabaseClient } from '@supabase/supabase-js'
import type { Game, GameEvent, Ping, Player, Position, PowerUp } from '../../shared/types.js'
import type {
  GameRow,
  GameStore,
  MarshalInviteRow,
  NewPowerUp,
  Organisation,
  OrganiserInviteRow,
  OrganiserRow,
  PlayerRow,
  RedeemInviteResult,
  RedeemMarshalInviteResult,
  SafetyRecord,
  StationClaim,
} from './store.js'

const PLAYER_COLUMNS = 'id, game_id, name, role, tag_id, accepted_at, caught_at, caught_by, jailed, freed_once, push, removed_at, outside, left_start'
const GAME_COLUMNS = 'id, code, arena, settings, started_at, ended_at, winner, paused_at, pauses, organiser_id'

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Production store. Uses the secret key; the game tables deny the anon role entirely. */
export class SupabaseStore implements GameStore {
  private db: SupabaseClient
  private clock: () => number

  /** `clock` must be the same clock the game rules use (the request's `now`), not the database's. */
  constructor(db: SupabaseClient, clock: () => number) {
    this.db = db
    this.clock = clock
  }

  private nowIso() {
    return new Date(this.clock()).toISOString()
  }

  async createGame(g: Omit<GameRow, 'id'>): Promise<Game> {
    return check(await this.db.from('games').insert(g).select(GAME_COLUMNS).single()) as Game
  }
  async gameByCode(code: string): Promise<GameRow | null> {
    return check(await this.db.from('games').select('*').eq('code', code).maybeSingle()) as GameRow | null
  }
  async updateGame(id: string, patch: Partial<GameRow>) {
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
    return check(
      await this.db.from('players').select(PLAYER_COLUMNS).eq('game_id', gameId).is('removed_at', null).order('accepted_at'),
    ) as Player[]
  }
  async updatePlayers(patches: { id: string; patch: Partial<Player> }[]) {
    for (const { id, patch } of patches) check(await this.db.from('players').update(patch).eq('id', id))
  }
  async catchRunner(id: string, by: string) {
    const rows = check(
      await this.db
        .from('players')
        .update({ jailed: true, caught_at: this.nowIso(), caught_by: by })
        .eq('id', id)
        .eq('jailed', false)
        .select('id'),
    )
    return (rows ?? []).length > 0
  }
  async addPosition(gameId: string, playerId: string, p: Omit<Position, 'at'>) {
    check(await this.db.from('locations').insert({ game_id: gameId, player_id: playerId, ...p, at: this.nowIso() }))
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
        .update({ ended_at: this.nowIso(), winner })
        .eq('id', gameId)
        .is('ended_at', null)
        .select('id'),
    )
    return (rows ?? []).length > 0
  }
  async addEvent(e: Omit<GameEvent, 'id' | 'at'>): Promise<GameEvent> {
    return check(await this.db.from('events').insert({ ...e, at: this.nowIso() }).select('*').single()) as GameEvent
  }
  async events(gameId: string): Promise<GameEvent[]> {
    return check(await this.db.from('events').select('*').eq('game_id', gameId).order('at')) as GameEvent[]
  }
  async addPowerUp(p: NewPowerUp): Promise<PowerUp> {
    return check(await this.db.from('powerups').insert({ ...p, claimed_at: this.nowIso() }).select('*').single()) as PowerUp
  }
  async powerUps(gameId: string): Promise<PowerUp[]> {
    return check(await this.db.from('powerups').select('*').eq('game_id', gameId).order('claimed_at')) as PowerUp[]
  }
  async updatePowerUp(id: string, patch: Partial<PowerUp>) {
    check(await this.db.from('powerups').update(patch).eq('id', id))
  }
  async claimStation(p: NewPowerUp, lockMs: number): Promise<StationClaim> {
    // The database function locks the station, re-checks, and inserts in one transaction.
    const r = check(
      await this.db.rpc('claim_station', {
        p_game: p.game_id,
        p_player: p.player_id,
        p_station: p.station,
        p_kind: p.kind,
        p_at: this.nowIso(),
        p_lock_ms: lockMs,
      }),
    ) as { result: string; locked_for_ms: number | null; powerup: PowerUp | null }[]
    const row = r[0]
    if (row?.result === 'ok' && row.powerup) return { ok: true, powerUp: row.powerup }
    if (row?.result === 'locked') return { ok: false, reason: 'locked', lockedForMs: row.locked_for_ms ?? 0 }
    return { ok: false, reason: 'already-claimed' }
  }
  async markUsed(id: string) {
    const rows = check(
      await this.db.from('powerups').update({ used_at: this.nowIso() }).eq('id', id).is('used_at', null).select('id'),
    )
    return (rows ?? []).length > 0
  }
  async consumeShield(id: string) {
    const rows = check(
      await this.db.from('powerups').update({ consumed_at: this.nowIso() }).eq('id', id).is('consumed_at', null).select('id'),
    )
    return (rows ?? []).length > 0
  }
  async addBonusPing(gameId: string, alertAt: string, revealAt: string) {
    // Two Flares at once may pick the same number; the primary key refuses one, so try the next.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { count } = await this.db.from('pings').select('seq', { count: 'exact', head: true }).eq('game_id', gameId).gte('seq', 1000)
      const seq = 1000 + (count ?? 0) + attempt
      const { error } = await this.db
        .from('pings')
        .insert({ game_id: gameId, seq, alert_at: alertAt, reveal_at: revealAt, alerted: false, revealed: false })
      if (!error) return seq
      if (error.code !== '23505') throw new Error(error.message)
    }
    throw new Error('Could not schedule the Flare — try again')
  }
  async pauseGame(gameId: string) {
    const rows = check(
      await this.db
        .from('games')
        .update({ paused_at: this.nowIso() })
        .eq('id', gameId)
        .not('started_at', 'is', null)
        .is('ended_at', null)
        .is('paused_at', null)
        .select('id'),
    )
    return (rows ?? []).length > 0
  }
  async resumeGame(gameId: string) {
    // The database function closes the pause and shifts the pings in one transaction.
    return check(await this.db.rpc('resume_game', { p_game: gameId, p_at: this.nowIso() })) as number | null
  }
  async setFlag(playerId: string, field: 'outside' | 'left_start', value: boolean) {
    const rows = check(
      await this.db.from('players').update({ [field]: value }).eq('id', playerId).eq(field, !value).select('id'),
    )
    return (rows ?? []).length > 0
  }
  async removePlayer(id: string) {
    const rows = check(
      await this.db.from('players').update({ removed_at: this.nowIso() }).eq('id', id).is('removed_at', null).select('id'),
    )
    return (rows ?? []).length > 0
  }
  async addSafetyRecord(r: SafetyRecord) {
    check(await this.db.from('safety_records').insert({ ...r, at: this.nowIso() }))
  }
  async createOrganisation(o: Omit<Organisation, 'id'>): Promise<Organisation> {
    return check(await this.db.from('organisations').insert(o).select('*').single()) as Organisation
  }
  async createOrganiser(o: Omit<OrganiserRow, 'id'>): Promise<OrganiserRow> {
    return check(await this.db.from('organisers').insert(o).select('*').single()) as OrganiserRow
  }
  async organiserBySessionTokenHash(hash: string): Promise<OrganiserRow | null> {
    return check(
      await this.db.from('organisers').select('*').eq('session_token_hash', hash).maybeSingle(),
    ) as OrganiserRow | null
  }
  async organiserById(id: string): Promise<OrganiserRow | null> {
    return check(await this.db.from('organisers').select('*').eq('id', id).maybeSingle()) as OrganiserRow | null
  }
  async createOrganiserInvite(inv: Omit<OrganiserInviteRow, 'id'>): Promise<OrganiserInviteRow> {
    return check(await this.db.from('organiser_invites').insert(inv).select('*').single()) as OrganiserInviteRow
  }
  async redeemOrganiserInvite(tokenHash: string, now: number, sessionTokenHash: string): Promise<RedeemInviteResult> {
    const nowIso = new Date(now).toISOString()
    const claimed = check(
      await this.db
        .from('organiser_invites')
        .update({ redeemed_at: nowIso })
        .eq('token_hash', tokenHash)
        .is('redeemed_at', null)
        .gt('expires_at', nowIso)
        .select('*'),
    ) as OrganiserInviteRow[]
    const inv = claimed[0]
    if (!inv) {
      const exists = check(
        await this.db.from('organiser_invites').select('redeemed_at, expires_at').eq('token_hash', tokenHash).maybeSingle(),
      ) as { redeemed_at: string | null; expires_at: string } | null
      if (!exists) return { ok: false, reason: 'invalid' }
      return { ok: false, reason: exists.redeemed_at ? 'redeemed' : 'expired' }
    }
    if (inv.organiser_id) {
      check(
        await this.db
          .from('organisers')
          .update({ session_token_hash: sessionTokenHash, session_created_at: nowIso })
          .eq('id', inv.organiser_id),
      )
      return { ok: true, organiserId: inv.organiser_id }
    }
    const created = await this.createOrganiser({
      organisation_id: inv.organisation_id,
      name: inv.name,
      created_at: nowIso,
      session_token_hash: sessionTokenHash,
      session_created_at: nowIso,
    })
    return { ok: true, organiserId: created.id }
  }
  async createMarshalInvite(inv: Omit<MarshalInviteRow, 'id'>): Promise<MarshalInviteRow> {
    return check(await this.db.from('marshal_invites').insert(inv).select('*').single()) as MarshalInviteRow
  }
  async redeemMarshalInvite(tokenHash: string, now: number): Promise<RedeemMarshalInviteResult> {
    const nowIso = new Date(now).toISOString()
    const claimed = check(
      await this.db
        .from('marshal_invites')
        .update({ redeemed_at: nowIso })
        .eq('token_hash', tokenHash)
        .is('redeemed_at', null)
        .gt('expires_at', nowIso)
        .select('game_id, redeemed_at'),
    ) as { game_id: string; redeemed_at: string }[]
    if (claimed[0]) return { ok: true, gameId: claimed[0].game_id }
    const exists = check(
      await this.db.from('marshal_invites').select('redeemed_at, expires_at').eq('token_hash', tokenHash).maybeSingle(),
    ) as { redeemed_at: string | null; expires_at: string } | null
    if (!exists) return { ok: false, reason: 'invalid' }
    return { ok: false, reason: exists.redeemed_at ? 'redeemed' : 'expired' }
  }
}
