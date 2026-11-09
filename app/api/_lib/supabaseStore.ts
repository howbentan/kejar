import { LUAR_GARISAN_GRACE_MS } from '../../shared/alerts.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Game, GameEvent, Ping, Player, Position, PowerUp, PowerUpKind, SecretCard } from '../../shared/types.js'
import { newDatoCode } from './secrets.js'
import type { GameRow, GameStore, MarshalInviteRow, NewPowerUp, NewSavedArena, Organisation, OrganiserInviteRow, OrganiserRow, PlayerRow, RedeemInviteResult, RedeemMarshalInviteResult, SafetyRecord, SavedArenaRow, GrabPick, StationClaim, StolenCard } from './store.js'

const PLAYER_COLUMNS = 'id, game_id, name, role, tag_id, accepted_at, caught_at, caught_by, jailed, freed_once, freed_at, push, removed_at, outside, left_start, out_warned_at, disqualified_at'
const GAME_COLUMNS = 'id, code, arena, settings, started_at, ended_at, winner, paused_at, pauses, organiser_id, runner_sets, chaser_sets, runner_draws, chaser_draws, deck_seed, dato_stash, kit'

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** PostgREST's "no such function" (PGRST202) or Postgres's undefined_function (42883). */
const isMissingFunction = (error: { code?: string } | null) => error?.code === 'PGRST202' || error?.code === '42883'

let warnedMissingAddPosition = false

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
  async setKitKey(gameId: string, group: 'ticks' | 'placed', key: string, value: string | true | null) {
    // One UPDATE in the database, so two phones ticking at once both land.
    check(await this.db.rpc('set_kit_key', { p_game: gameId, p_group: group, p_key: key, p_value: value }))
  }
  async unfinishedGames(organisationId: string, createdAfter: string): Promise<GameRow[]> {
    const organisers = check(await this.db.from('organisers').select('id').eq('organisation_id', organisationId)) as { id: string }[] | null
    const ids = (organisers ?? []).map((o) => o.id)
    if (ids.length === 0) return []
    return (check(
      await this.db
        .from('games')
        .select('*')
        .in('organiser_id', ids)
        .is('ended_at', null)
        // Quoted: the timestamp's ':' and '.' are reserved in PostgREST's or-filter syntax.
        .or(`started_at.not.is.null,created_at.gt."${createdAfter}"`),
    ) ?? []) as GameRow[]
  }
  async secretCards(organisationId: string): Promise<SecretCard[]> {
    const read = async () => (check(await this.db.from('secret_cards').select('*').eq('organisation_id', organisationId)) ?? []) as SecretCard[]
    const have = await read()
    const missing = (['dato', 'bomoh'] as const).flatMap((legendary) =>
      (['A', 'B', 'C'] as const)
        .filter((letter) => !have.some((c) => c.legendary === legendary && c.letter === letter))
        .map((letter) => ({ organisation_id: organisationId, legendary, letter, code: newDatoCode(), state: 'ready', found_at: null })),
    )
    if (missing.length === 0) return have
    // Two first reads at once: the unique key keeps one card per letter, and the other insert is ignored.
    check(await this.db.from('secret_cards').upsert(missing, { onConflict: 'organisation_id,legendary,letter', ignoreDuplicates: true }))
    return read()
  }
  async setSecretCard(id: string, patch: Partial<Pick<SecretCard, 'code' | 'state' | 'found_at'>>) {
    check(await this.db.from('secret_cards').update(patch).eq('id', id))
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
  async drawCard(gameId: string, side: 'runner' | 'chaser') {
    return check(await this.db.rpc('draw_card', { p_game: gameId, p_side: side })) as number
  }
  async releaseAutoJailed(id: string, atIso: string) {
    const rows = check(
      await this.db
        .from('players')
        .update({ jailed: false, caught_at: null, freed_at: atIso, out_warned_at: null })
        .eq('id', id)
        .eq('jailed', true)
        .is('caught_by', null)
        .select('id'),
    )
    return (rows ?? []).length > 0
  }
  async catchRunner(id: string, by: string | null) {
    const rows = check(
      await this.db
        .from('players')
        .update({ jailed: true, caught_at: this.nowIso(), caught_by: by, out_warned_at: null })
        .eq('id', id)
        .eq('jailed', false)
        .is('disqualified_at', null)
        .select('id'),
    )
    return (rows ?? []).length > 0
  }
  async addPosition(gameId: string, playerId: string, p: Omit<Position, 'at'>, minGapMs?: number, since?: number) {
    if (minGapMs !== undefined) {
      const res = await this.db.rpc('add_position', {
        p_game: gameId,
        p_player: playerId,
        p_lat: p.lat,
        p_lng: p.lng,
        p_accuracy: p.accuracy_m,
        p_at: this.nowIso(),
        p_min_gap_ms: minGapMs,
        p_since: since === undefined ? null : new Date(since).toISOString(),
      })
      // Deployed before 0012 ran: keep storing locations (without the gap) rather than break every game.
      if (!isMissingFunction(res.error)) return check(res) !== false
      if (!warnedMissingAddPosition) {
        warnedMissingAddPosition = true
        console.error('[api/game] add_position missing — run 0012')
      }
    }
    check(await this.db.from('locations').insert({ game_id: gameId, player_id: playerId, ...p, at: this.nowIso() }))
    return true
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
      await this.db.from('powerups').update({ used_at: this.nowIso() }).eq('id', id).is('used_at', null).is('taken_at', null).select('id'),
    )
    return (rows ?? []).length > 0
  }
  async stealFrom(gameId: string, side: 'runner' | 'chaser'): Promise<StolenCard | null> {
    // The database function takes a per-game advisory lock (thefts in one game run one at a time), then locks the
    // chosen card row `for update` and re-checks it before marking it taken, so two thieves never take the same one.
    const rows = check(await this.db.rpc('steal_card', { p_game: gameId, p_side: side, p_at: this.nowIso() })) as
      | { id: string; player_id: string; kind: PowerUp['kind'] }[]
      | null
    const row = rows?.[0]
    return row ? { stolenFrom: row.player_id, kind: row.kind, powerupId: row.id } : null
  }
  async openGrab(powerupId: string, side: 'runner' | 'chaser', n: number) {
    // The database function locks the Grab and bumps the side's counter by n in one transaction.
    const rows = check(await this.db.rpc('open_grab', { p_powerup: powerupId, p_side: side, p_n: n })) as
      | { first_draw: number; offer: PowerUpKind[] | null }[]
      | null
    const row = rows?.[0]
    return row ? { first: row.first_draw, offer: row.offer } : null
  }
  async pickGrab(powerupId: string, playerId: string, choice: number): Promise<GrabPick> {
    if (!Number.isInteger(choice)) return { ok: false, reason: 'bad-choice' }
    // The database function locks the Grab, re-checks, marks it used and inserts the sealed card together.
    const rows = check(
      await this.db.rpc('pick_grab', { p_powerup: powerupId, p_player: playerId, p_choice: choice, p_at: this.nowIso() }),
    ) as { result: string; powerup: PowerUp | null }[] | null
    const row = rows?.[0]
    if (row?.result === 'ok' && row.powerup) return { ok: true, powerUp: row.powerup }
    const reason = row?.result
    return { ok: false, reason: reason === 'already-used' || reason === 'taken' || reason === 'no-offer' || reason === 'bad-choice' ? reason : 'not-yours' }
  }
  async claimDato(gameId: string, playerId: string): Promise<PowerUp | null> {
    // The database function locks the game row, re-checks the stash is unclaimed, marks it and inserts the card.
    const rows = check(await this.db.rpc('claim_dato', { p_game: gameId, p_player: playerId, p_at: this.nowIso() })) as
      | PowerUp[]
      | null
    return rows?.[0] ?? null
  }
  async consumeShield(id: string) {
    const rows = check(
      await this.db.from('powerups').update({ consumed_at: this.nowIso() }).eq('id', id).is('consumed_at', null).select('id'),
    )
    return (rows ?? []).length > 0
  }
  async addBonusPing(gameId: string, seq: number, alertAt: string, revealAt: string) {
    // Two Mat Rempits at once pick the same number; the primary key lets only one in (one at a time, §5a).
    const { error } = await this.db
      .from('pings')
      .insert({ game_id: gameId, seq, alert_at: alertAt, reveal_at: revealAt, alerted: false, revealed: false })
    if (!error) return true
    if (error.code === '23505') return false
    throw new Error(error.message)
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
  async markOutside(playerId: string, at: string) {
    const r = check(await this.db.rpc('mark_outside', { p_player: playerId, p_at: at, p_grace_ms: LUAR_GARISAN_GRACE_MS }))
    return (r === 'warned' || r === 'disqualified' ? r : 'unchanged') as 'warned' | 'disqualified' | 'unchanged'
  }
  async clearOutWarning(playerId: string) {
    check(await this.db.from('players').update({ out_warned_at: null }).eq('id', playerId).is('disqualified_at', null).not('out_warned_at', 'is', null))
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
  async redeemMarshalInvite(tokenHash: string, now: number, gameId: string): Promise<RedeemMarshalInviteResult> {
    const nowIso = new Date(now).toISOString()
    const claimed = check(
      await this.db
        .from('marshal_invites')
        .update({ redeemed_at: nowIso })
        .eq('token_hash', tokenHash)
        .eq('game_id', gameId)
        .is('redeemed_at', null)
        .gt('expires_at', nowIso)
        .select('game_id'),
    ) as { game_id: string }[]
    if (claimed[0]) return { ok: true, gameId: claimed[0].game_id }
    const exists = check(
      await this.db
        .from('marshal_invites')
        .select('redeemed_at, expires_at')
        .eq('token_hash', tokenHash)
        .eq('game_id', gameId)
        .maybeSingle(),
    ) as { redeemed_at: string | null; expires_at: string } | null
    if (!exists) return { ok: false, reason: 'invalid' }
    return { ok: false, reason: exists.redeemed_at ? 'redeemed' : 'expired' }
  }
  async addArena(r: NewSavedArena): Promise<SavedArenaRow> {
    const at = this.nowIso()
    return check(await this.db.from('arenas').insert({ ...r, created_at: at, updated_at: at }).select('*').single()) as SavedArenaRow
  }
  async updateArena(id: string, patch: Partial<Pick<SavedArenaRow, 'name' | 'draft' | 'arena' | 'water_checked'>>) {
    check(await this.db.from('arenas').update({ ...patch, updated_at: this.nowIso() }).eq('id', id))
  }
  async arenaById(id: string): Promise<SavedArenaRow | null> {
    // Arena ids are uuids; anything else can't exist (and Postgres would reject it with a 500).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
    return check(await this.db.from('arenas').select('*').eq('id', id).maybeSingle()) as SavedArenaRow | null
  }
  async arenasFor(organisationId: string): Promise<SavedArenaRow[]> {
    return check(
      await this.db.from('arenas').select('*').eq('organisation_id', organisationId).order('updated_at', { ascending: false }),
    ) as SavedArenaRow[]
  }
  async deleteArena(id: string) {
    check(await this.db.from('arenas').delete().eq('id', id))
  }
  async osmCacheGet(key: string, maxAgeMs: number): Promise<unknown | null> {
    const row = check(await this.db.from('osm_cache').select('body, fetched_at').eq('key', key).maybeSingle()) as
      | { body: unknown; fetched_at: string }
      | null
    return row && this.clock() - Date.parse(row.fetched_at) < maxAgeMs ? row.body : null
  }
  async osmCachePut(key: string, body: unknown) {
    check(await this.db.from('osm_cache').upsert({ key, body, fetched_at: this.nowIso() }, { onConflict: 'key' }))
  }
  async hitRateLimit(key: string, windowMs: number, limit: number) {
    return check(await this.db.rpc('hit_rate_limit', { p_key: key, p_window_ms: windowMs, p_limit: limit })) !== false
  }
}
