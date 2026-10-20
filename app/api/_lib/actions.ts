import { arenaAroundPoint, ARENAS } from '../../shared/arenas.js'
import { judgeCatch, judgeJailbreak } from '../../shared/catch.js'
import { chaseStartOf, dueWork, phaseAt, pingTimes } from '../../shared/clock.js'
import { JAIL_QR, newGameCode, tagIdFromQr } from '../../shared/ids.js'
import { computeResults } from '../../shared/results.js'
import { shuffleRoles, validateTeams } from '../../shared/teams.js'
import { DEFAULT_SETTINGS, type Arena, type Game, type Player, type Position, type Role, type Settings } from '../../shared/types.js'
import { viewFor } from '../../shared/views.js'
import { hashToken, newToken } from './secrets.js'
import type { GameRow, GameStore } from './store.js'

export class ActionError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Sends one push; rejects with `{ statusCode }` when the push service refuses. */
export type PushFn = (sub: PushSubscriptionJSON, payload: string) => Promise<void>

export interface Ctx {
  store: GameStore
  now: number
  push: PushFn
  rng: () => number
}

type Body = Record<string, unknown>
type Action = (ctx: Ctx, body: Body) => Promise<unknown>

const tag2 = (n: number) => String(n).padStart(2, '0')
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const iso = (ms: number) => new Date(ms).toISOString()

async function loadGame(ctx: Ctx, body: Body): Promise<GameRow> {
  const game = await ctx.store.gameByCode(str(body.code).toUpperCase())
  if (!game) throw new ActionError(404, 'Game not found')
  return game
}

function requireHost(game: GameRow, body: Body) {
  if (!body.hostKey || hashToken(str(body.hostKey)) !== game.host_key_hash) throw new ActionError(403, 'Organiser only')
}

async function requirePlayer(ctx: Ctx, game: Game, body: Body): Promise<Player> {
  const p = body.token ? await ctx.store.playerByToken(game.id, hashToken(str(body.token))) : null
  if (!p) throw new ActionError(401, 'Not in this game')
  return p
}

function requireLobby(game: Game, now: number) {
  if (phaseAt(game, now).phase !== 'lobby') throw new ActionError(409, 'Game already started')
}

function settingsFrom(input: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(typeof input === 'object' && input ? input : {}) } as Settings
  const inRange = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi
  if (!inRange(s.lengthMin, 15, 90)) throw new ActionError(400, 'Game length must be 15–90 minutes')
  if (!inRange(s.hideMin, 1, 15)) throw new ActionError(400, 'Hide time must be 1–15 minutes')
  if (![2, 3, 5].includes(s.pingMin)) throw new ActionError(400, 'Ping interval must be 2, 3 or 5 minutes')
  if (!inRange(s.spectatorDelayMin, 0, 5)) throw new ActionError(400, 'Spectator delay must be 0–5 minutes')
  if (s.checkinMode !== 'push' && s.checkinMode !== 'schedule') throw new ActionError(400, 'Unknown check-in mode')
  return s
}

/** The moments a view looks at: now, the spectator delay, and the last revealed ping. */
function viewTimes(game: Game, pings: { seq: number; revealed: boolean; reveal_at: string }[], now: number): string[] {
  const times = [iso(now), iso(now - game.settings.spectatorDelayMin * 60_000)]
  const last = pings.filter((p) => p.revealed && p.seq > 0).sort((a, b) => b.seq - a.seq)[0]
  if (last) times.push(last.reveal_at)
  return times
}

/** Records coordinates sent along with a scan, so judging uses where the phone is right now. */
async function recordScanLocation(ctx: Ctx, game: Game, me: Player, body: Body) {
  const { lat, lng, accuracy_m } = body as { lat?: unknown; lng?: unknown; accuracy_m?: unknown }
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return
  await ctx.store.addPosition(game.id, me.id, { lat, lng, accuracy_m: typeof accuracy_m === 'number' ? accuracy_m : 0 })
}

const latest = (list: Position[] | undefined) => (list && list.length ? list[list.length - 1] : null)

/** Brings the game up to date: chase start, alerts, reveals and the end. Safe to call from many pages at once. */
async function advance(ctx: Ctx, game: Game): Promise<void> {
  const { store, now } = ctx
  const phase = phaseAt(game, now).phase
  if (phase === 'lobby') return

  if ((phase === 'chasing' || phase === 'ended') && (await store.claimPing(game.id, 0, 'revealed'))) {
    await store.addEvent({ game_id: game.id, type: 'chase', actor_id: null, target_id: null, data: {} })
  }

  const work = dueWork(game, await store.pings(game.id), now)
  const times = new Map(pingTimes(game).map((t) => [t.seq, t]))

  for (const seq of work.alert) {
    if (!(await store.claimPing(game.id, seq, 'alerted'))) continue
    // Skip stale alerts when catching up after a gap: only alert pings still in the future.
    if (game.settings.checkinMode !== 'push' || now >= (times.get(seq)?.revealAt ?? 0)) continue
    const runners = (await store.players(game.id)).filter((p) => p.role === 'runner' && !p.jailed && p.push)
    const payload = JSON.stringify({ type: 'checkin', code: game.code, seq })
    const expired: string[] = []
    await Promise.allSettled(
      runners.map((r) =>
        ctx.push(r.push!, payload).catch((e: { statusCode?: number }) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) expired.push(r.id)
        }),
      ),
    )
    if (expired.length) await store.updatePlayers(expired.map((id) => ({ id, patch: { push: null } })))
  }

  for (const seq of work.reveal) {
    if (!(await store.claimPing(game.id, seq, 'revealed'))) continue
    const revealAt = times.get(seq)?.revealAt ?? now
    const positions = await store.latestPositions(game.id, [iso(revealAt)])
    const free = (await store.players(game.id)).filter((p) => p.role === 'runner' && !p.jailed)
    const seen = free.filter((p) => (positions[p.id] ?? []).length > 0).length
    await store.addEvent({ game_id: game.id, type: 'ping', actor_id: null, target_id: null, data: { seq, seen } })
  }

  if (work.end) await finish(ctx, game)
}

async function finish(ctx: Ctx, game: Game) {
  const results = computeResults(game, await ctx.store.players(game.id), await ctx.store.events(game.id))
  if (await ctx.store.claimEnd(game.id, results.winner)) {
    await ctx.store.addEvent({ game_id: game.id, type: 'ended', actor_id: null, target_id: null, data: { winner: results.winner } })
  }
}

const create: Action = async (ctx, body) => {
  let arena: Arena
  if (body.arenaId === 'around-me') {
    const c = body.center as { lat?: unknown; lng?: unknown } | undefined
    if (typeof c?.lat !== 'number' || typeof c?.lng !== 'number') throw new ActionError(400, 'Need your location for an Around me game')
    const radiusM = body.radiusM === undefined ? 200 : Number(body.radiusM)
    if (!Number.isFinite(radiusM) || radiusM < 100 || radiusM > 500) {
      throw new ActionError(400, 'Play area must be 100–500 m across from the centre')
    }
    arena = arenaAroundPoint({ lat: c.lat, lng: c.lng }, radiusM)
  } else {
    const found = ARENAS[str(body.arenaId)]
    if (!found) throw new ActionError(400, 'Unknown arena')
    arena = found
  }
  const settings = settingsFrom(body.settings)
  let code = newGameCode(ctx.rng)
  while (await ctx.store.gameByCode(code)) code = newGameCode(ctx.rng)
  const hostKey = newToken()
  await ctx.store.createGame({ code, arena, settings, started_at: null, ended_at: null, winner: null, host_key_hash: hashToken(hostKey) })
  return { code, hostKey }
}

const join: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  if (body.token) {
    const existing = await ctx.store.playerByToken(game.id, hashToken(str(body.token)))
    if (existing) return { token: str(body.token), playerId: existing.id }
  }
  requireLobby(game, ctx.now)
  if (body.accepted !== true) throw new ActionError(400, 'Accept the code of conduct and waiver to join')
  const name = str(body.name).trim()
  if (name.length < 1 || name.length > 24) throw new ActionError(400, 'Name must be 1–24 characters')
  const token = newToken()
  const p = await ctx.store.addPlayer({
    game_id: game.id,
    name,
    role: null,
    tag_id: null,
    accepted_at: iso(ctx.now),
    caught_at: null,
    caught_by: null,
    jailed: false,
    freed_once: false,
    push: null,
    token_hash: hashToken(token),
  })
  await ctx.store.addEvent({ game_id: game.id, type: 'joined', actor_id: p.id, target_id: null, data: {} })
  return { token, playerId: p.id }
}

const setRoles: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  requireHost(game, body)
  requireLobby(game, ctx.now)
  const players = await ctx.store.players(game.id)
  const ids = players.map((p) => p.id)
  let roles: Record<string, Role>
  if (body.shuffle === true) {
    const marshals = Array.isArray(body.marshalIds)
      ? (body.marshalIds as string[])
      : players.filter((p) => p.role === 'marshal').map((p) => p.id)
    roles = shuffleRoles(ids, marshals, ctx.rng)
  } else {
    const given = (body.roles ?? {}) as Record<string, Role>
    roles = Object.fromEntries(players.filter((p) => p.role).map((p) => [p.id, p.role!]))
    for (const [id, role] of Object.entries(given)) {
      if (ids.includes(id) && ['runner', 'chaser', 'marshal'].includes(role)) roles[id] = role
    }
  }
  await ctx.store.updatePlayers(
    Object.entries(roles).map(([id, role]) => ({ id, patch: role === 'runner' ? { role } : { role, tag_id: null } })),
  )
  await ctx.store.addEvent({ game_id: game.id, type: 'roles', actor_id: null, target_id: null, data: {} })
  return { roles, problems: validateTeams(roles) }
}

const start: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  requireHost(game, body)
  requireLobby(game, ctx.now)
  const players = await ctx.store.players(game.id)
  const roles = Object.fromEntries(players.filter((p) => p.role).map((p) => [p.id, p.role!]))
  const problems = [
    ...players.filter((p) => !p.role).map((p) => `${p.name} has no role`),
    ...validateTeams(roles),
    ...players.filter((p) => p.role === 'runner' && p.tag_id === null).map((p) => `Runner ${p.name} has no tag`),
  ]
  if (problems.length) throw new ActionError(409, problems.join(' · '))
  const startedAt = iso(ctx.now)
  const started = { ...game, started_at: startedAt }
  await ctx.store.updateGame(game.id, { started_at: startedAt })
  const chaseAt = iso(chaseStartOf(started)!)
  await ctx.store.addPings([
    { game_id: game.id, seq: 0, alert_at: chaseAt, reveal_at: chaseAt, alerted: true, revealed: false },
    ...pingTimes(started).map((t) => ({
      game_id: game.id,
      seq: t.seq,
      alert_at: iso(t.alertAt),
      reveal_at: iso(t.revealAt),
      alerted: false,
      revealed: false,
    })),
  ])
  await ctx.store.addEvent({ game_id: game.id, type: 'started', actor_id: null, target_id: null, data: {} })
  return { startedAt }
}

const linkTag: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  requireLobby(game, ctx.now)
  if (me.role !== 'runner') throw new ActionError(403, 'Only runners have tags')
  const tagId = Number(body.tagId)
  if (!Number.isInteger(tagId) || tagId < 1 || tagId > 99) throw new ActionError(400, 'Tag number must be 1–99')
  const taken = (await ctx.store.players(game.id)).find((p) => p.tag_id === tagId && p.id !== me.id)
  if (taken) throw new ActionError(409, `Tag ${tag2(tagId)} is already taken`)
  await ctx.store.updatePlayers([{ id: me.id, patch: { tag_id: tagId } }])
  return { tagId }
}

const state: Action = async (ctx, body) => {
  let game: Game = await loadGame(ctx, body)
  let me: Player
  if (body.token) me = await requirePlayer(ctx, game, body)
  else {
    requireHost(game as GameRow, body)
    me = {
      id: 'host',
      game_id: game.id,
      name: 'Organiser',
      role: 'marshal',
      tag_id: null,
      accepted_at: iso(ctx.now),
      caught_at: null,
      caught_by: null,
      jailed: false,
      freed_once: false,
      push: null,
    }
  }
  await advance(ctx, game)
  game = (await loadGame(ctx, body)) as Game
  const players = await ctx.store.players(game.id)
  if (me.id !== 'host') me = players.find((p) => p.id === me.id) ?? me
  const events = await ctx.store.events(game.id)
  const pings = await ctx.store.pings(game.id)
  const ended = phaseAt(game, ctx.now).phase === 'ended'
  return viewFor({
    game,
    me,
    players,
    positions: await ctx.store.latestPositions(game.id, viewTimes(game, pings, ctx.now)),
    pings,
    events,
    now: ctx.now,
    results: ended ? computeResults(game, players, events) : null,
  })
}

const location: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  if (phaseAt(game, ctx.now).phase === 'ended') return { ok: true }
  const { lat, lng, accuracy_m } = body as { lat: unknown; lng: unknown; accuracy_m: unknown }
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ActionError(400, 'Invalid location')
  }
  await ctx.store.addPosition(game.id, me.id, { lat, lng, accuracy_m: typeof accuracy_m === 'number' ? accuracy_m : 0 })
  return { ok: true }
}

const catchAction: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  await recordScanLocation(ctx, game, me, body)
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  const players = await ctx.store.players(game.id)
  const tagId = tagIdFromQr(str(body.tagQr))
  const runner = players.find((p) => p.role === 'runner' && p.tag_id === tagId)
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  const verdict = judgeCatch({
    phase: phaseAt(fresh, ctx.now).phase,
    chaser: me,
    tagId,
    players,
    chaserPos: latest(positions[me.id]),
    runnerPos: runner ? latest(positions[runner.id]) : null,
    now: ctx.now,
  })
  if (!verdict.ok) return verdict
  if (!(await ctx.store.catchRunner(verdict.runnerId, me.id))) return { ok: false, reason: 'already-caught' }
  await ctx.store.addEvent({
    game_id: game.id,
    type: 'caught',
    actor_id: me.id,
    target_id: verdict.runnerId,
    data: { flagged: verdict.flagged },
  })
  const after = await ctx.store.players(game.id)
  if (after.filter((p) => p.role === 'runner').every((p) => p.jailed)) await finish(ctx, fresh)
  return verdict
}

const jailbreak: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  if (str(body.qr).trim() !== JAIL_QR) throw new ActionError(400, "That's not the jail code")
  await recordScanLocation(ctx, game, me, body)
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  const verdict = judgeJailbreak({
    phase: phaseAt(fresh, ctx.now).phase,
    runner: me,
    players: await ctx.store.players(game.id),
    runnerPos: latest(positions[me.id]),
    jail: game.arena.jail,
    now: ctx.now,
  })
  if (!verdict.ok) return verdict
  await ctx.store.updatePlayers(verdict.freedIds.map((id) => ({ id, patch: { jailed: false, freed_once: true } })))
  await ctx.store.addEvent({
    game_id: game.id,
    type: 'jailbreak',
    actor_id: me.id,
    target_id: null,
    data: { freed: verdict.freedIds.length },
  })
  return verdict
}

const subscribe: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  const sub = body.subscription as PushSubscriptionJSON | undefined
  if (!sub || typeof sub.endpoint !== 'string') throw new ActionError(400, 'Invalid push subscription')
  await ctx.store.updatePlayers([{ id: me.id, patch: { push: sub } }])
  return { ok: true }
}

export const actions = {
  create,
  join,
  setRoles,
  start,
  linkTag,
  state,
  location,
  catch: catchAction,
  jailbreak,
  subscribe,
} satisfies Record<string, Action>

export type ActionName = keyof typeof actions
