import {
  alertsFrom,
  missedTwoInARow,
  NOTE_MAX,
  OUTSIDE_MARGIN_M,
  REASON_LABEL,
  SOS_REPEAT_MS,
  START_RADIUS_M,
  who,
  type ReportReason,
} from '../../shared/alerts.js'
import { arenaAroundPoint, ARENAS } from '../../shared/arenas.js'
import { judgeCatch, judgeJailbreak } from '../../shared/catch.js'
import { ALERT_LEAD_MS, BONUS_SEQ_BASE, chaseStartOf, dueWork, phaseAt, pingTimes } from '../../shared/clock.js'
import { JAIL_QR, newGameCode, stationFromQr, tagIdFromQr } from '../../shared/ids.js'
import { activeShield, judgeClaim, pickPowerUp, STATION_LOCK_MS } from '../../shared/powerups.js'
import { computeResults } from '../../shared/results.js'
import { shuffleRoles, validateTeams } from '../../shared/teams.js'
import { DEFAULT_SETTINGS, type Arena, type Game, type LatLng, type Player, type Position, type Role, type Settings } from '../../shared/types.js'
import { viewFor } from '../../shared/views.js'
import { distanceM, distanceOutsideM } from '../../shared/geo.js'
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
const tagLabelOf = (players: Player[], id: string) => {
  const p = players.find((x) => x.id === id)
  return p?.tag_id ? `#${tag2(p.tag_id)}` : (p?.name ?? '')
}
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

/** The calling player. Removed players are refused unless `allowRemoved` (their page still polls state). */
async function requirePlayer(ctx: Ctx, game: Game, body: Body, allowRemoved = false): Promise<Player> {
  const p = body.token ? await ctx.store.playerByToken(game.id, hashToken(str(body.token))) : null
  if (!p) throw new ActionError(401, 'Not in this game')
  if (p.removed_at && !allowRemoved) throw new ActionError(403, 'You were removed from this game')
  return p
}

function requireRunning(game: Game, now: number) {
  const phase = phaseAt(game, now).phase
  if (phase !== 'hiding' && phase !== 'chasing') throw new ActionError(409, 'The game is not running')
}

/** Pushes to each player's subscription; forgets subscriptions the push service says are gone. Returns how many went out. */
async function pushTo(ctx: Ctx, players: Player[], payload: unknown): Promise<number> {
  const body = JSON.stringify(payload)
  const expired: string[] = []
  const sent = await Promise.allSettled(
    players
      .filter((p) => p.push)
      .map((p) =>
        ctx.push(p.push!, body).catch((e: { statusCode?: number }) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) expired.push(p.id)
          throw e
        }),
      ),
  )
  if (expired.length) await ctx.store.updatePlayers(expired.map((id) => ({ id, patch: { push: null } })))
  return sent.filter((r) => r.status === 'fulfilled').length
}

/** Pushes an alert to every marshal and the organiser; returns how many phones it reached. */
async function alertMarshals(ctx: Ctx, game: GameRow, text: string): Promise<number> {
  const payload = { type: 'alert', code: game.code, text }
  const marshals = (await ctx.store.players(game.id)).filter((p) => p.role === 'marshal')
  let reached = await pushTo(ctx, marshals, payload)
  if (game.host_push) {
    try {
      await ctx.push(game.host_push, JSON.stringify(payload))
      reached++
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) await ctx.store.updateGame(game.id, { host_push: null })
    }
  }
  return reached
}

/** Coordinates sent with a request, or null when missing or invalid. */
function coordsOf(body: Body): LatLng | null {
  const { lat, lng } = body as { lat?: unknown; lng?: unknown }
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/** The organiser (null) or a player with the marshal role. */
async function requireMarshal(ctx: Ctx, game: GameRow, body: Body): Promise<Player | null> {
  if (body.hostKey) {
    requireHost(game, body)
    return null
  }
  const p = await requirePlayer(ctx, game, body)
  if (p.role !== 'marshal') throw new ActionError(403, 'Marshals only')
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
  // Latest reveal by time: bonus (Flare) pings have high numbers but can come before scheduled ones.
  const last = pings
    .filter((p) => p.revealed && p.seq > 0)
    .sort((a, b) => Date.parse(b.reveal_at) - Date.parse(a.reveal_at))[0]
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

  const pingRows = await store.pings(game.id)
  const work = dueWork(game, pingRows, now)
  // Scheduled pings come from the clock; bonus (Flare) pings carry their own times.
  const times = new Map<number, { revealAt: number }>([
    ...pingTimes(game, now).map((t) => [t.seq, t] as const),
    ...pingRows.filter((r) => r.seq >= BONUS_SEQ_BASE).map((r) => [r.seq, { revealAt: Date.parse(r.reveal_at) }] as const),
  ])

  for (const seq of work.alert) {
    if (!(await store.claimPing(game.id, seq, 'alerted'))) continue
    // Skip stale alerts when catching up after a gap: only alert pings still in the future.
    if (game.settings.checkinMode !== 'push' || now >= (times.get(seq)?.revealAt ?? 0)) continue
    const runners = (await store.players(game.id)).filter((p) => p.role === 'runner' && !p.jailed)
    await pushTo(ctx, runners, { type: 'checkin', code: game.code, seq })
  }

  for (const seq of work.reveal) {
    if (!(await store.claimPing(game.id, seq, 'revealed'))) continue
    const revealAt = times.get(seq)?.revealAt ?? now
    const positions = await store.latestPositions(game.id, [iso(revealAt)])
    const free = (await store.players(game.id)).filter((p) => p.role === 'runner' && !p.jailed)
    // Cloaked runners don't count as seen, so the feed can't give them away.
    const prevRevealAt = Math.max(
      chaseStartOf(game, now) ?? 0,
      ...pingRows.filter((r) => r.revealed && r.seq > 0 && Date.parse(r.reveal_at) < revealAt).map((r) => Date.parse(r.reveal_at)),
    )
    const cloaked = new Set(
      (await store.powerUps(game.id))
        .filter((u) => u.kind === 'cloak' && u.used_at && Date.parse(u.used_at) > prevRevealAt && Date.parse(u.used_at) <= revealAt)
        .map((u) => u.player_id),
    )
    const seen = free.filter((p) => !cloaked.has(p.id) && (positions[p.id] ?? []).length > 0).length
    await store.addEvent({ game_id: game.id, type: 'ping', actor_id: null, target_id: null, data: { seq, seen } })
    if (seq < BONUS_SEQ_BASE) {
      // Flares give only 30 s notice, so only scheduled pings count towards a missed streak.
      const windows = [chaseStartOf(game, now)!, ...pingTimes(game, now).filter((t) => t.seq <= seq).map((t) => t.revealAt)]
      for (const p of free) {
        const last = latest(positions[p.id])
        if (missedTwoInARow(windows, last ? Date.parse(last.at) : null)) {
          await store.addEvent({ game_id: game.id, type: 'missed', actor_id: p.id, target_id: null, data: { who: who(p) } })
        }
      }
    }
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
    const stations = Array.isArray(body.stations) ? (body.stations as LatLng[]) : []
    if (stations.some((st) => typeof st?.lat !== 'number' || typeof st?.lng !== 'number')) {
      throw new ActionError(400, 'Invalid station position')
    }
    try {
      arena = arenaAroundPoint({ lat: c.lat, lng: c.lng }, radiusM, stations)
    } catch (e) {
      throw new ActionError(400, e instanceof Error ? e.message : String(e))
    }
  } else {
    const found = ARENAS[str(body.arenaId)]
    if (!found) throw new ActionError(400, 'Unknown arena')
    arena = found
  }
  const settings = settingsFrom(body.settings)
  let code = newGameCode(ctx.rng)
  while (await ctx.store.gameByCode(code)) code = newGameCode(ctx.rng)
  const hostKey = newToken()
  await ctx.store.createGame({ code, arena, settings, started_at: null, ended_at: null, winner: null, paused_at: null, pauses: [], host_key_hash: hashToken(hostKey) })
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
    removed_at: null,
    outside: false,
    left_start: false,
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
  if (body.token) me = await requirePlayer(ctx, game, body, true)
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
      push: (game as GameRow).host_push ?? null,
      removed_at: null,
      outside: false,
      left_start: false,
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
    powerUps: await ctx.store.powerUps(game.id),
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
  const accuracy = typeof accuracy_m === 'number' ? accuracy_m : 0
  await ctx.store.addPosition(game.id, me.id, { lat, lng, accuracy_m: accuracy })
  await checkWhere(ctx, game, me, { lat, lng }, accuracy)
  return { ok: true }
}

/** Raises marshal alerts for leaving the play area, or a chaser leaving the start early (spec §5.1). */
async function checkWhere(ctx: Ctx, game: Game, me: Player, here: LatLng, accuracy: number) {
  const phase = phaseAt(game, ctx.now).phase
  if ((phase !== 'hiding' && phase !== 'chasing') || me.jailed || (me.role !== 'runner' && me.role !== 'chaser')) return
  const outsideBy = distanceOutsideM(here, game.arena.boundary)
  // Alert only when clearly outside; re-arm only once back inside, so GPS jitter at the edge can't spam.
  if (outsideBy > OUTSIDE_MARGIN_M) {
    if (await ctx.store.setFlag(me.id, 'outside', true)) {
      await ctx.store.addEvent({ game_id: game.id, type: 'outside', actor_id: me.id, target_id: null, data: { who: who(me) } })
    }
  } else if (outsideBy === 0 && me.outside) {
    await ctx.store.setFlag(me.id, 'outside', false)
  }
  const slack = Math.min(Math.max(accuracy, 0), 20)
  if (phase === 'hiding' && me.role === 'chaser' && !me.left_start && distanceM(here, game.arena.start) > START_RADIUS_M + slack) {
    if (await ctx.store.setFlag(me.id, 'left_start', true)) {
      await ctx.store.addEvent({ game_id: game.id, type: 'left-start', actor_id: me.id, target_id: null, data: { name: me.name } })
    }
  }
}

const catchAction: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  await recordScanLocation(ctx, game, me, body)
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  if (fresh.paused_at) return { ok: false, reason: 'paused' }
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
  // A switched-on Shield absorbs one otherwise-valid catch.
  const shield = activeShield(await ctx.store.powerUps(game.id), verdict.runnerId, ctx.now)
  // consumeShield is atomic, so two chasers scanning at once can't both be blocked by one shield.
  if (shield && (await ctx.store.consumeShield(shield.id))) {
    await ctx.store.addEvent({ game_id: game.id, type: 'shielded', actor_id: me.id, target_id: verdict.runnerId, data: {} })
    return { ok: false, reason: 'shielded' }
  }
  if (!(await ctx.store.catchRunner(verdict.runnerId, me.id))) return { ok: false, reason: 'already-caught' }
  await ctx.store.addEvent({
    game_id: game.id,
    type: 'caught',
    actor_id: me.id,
    target_id: verdict.runnerId,
    data: { flagged: verdict.flagged, who: tagLabelOf(players, verdict.runnerId), chaser: me.name },
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
  if (fresh.paused_at) return { ok: false, reason: 'paused' }
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
  const sub = body.subscription as PushSubscriptionJSON | undefined
  if (!body.token) {
    // The organiser: their phone gets SOS and report alerts.
    requireHost(game, body)
    if (!sub || typeof sub.endpoint !== 'string') throw new ActionError(400, 'Invalid push subscription')
    await ctx.store.updateGame(game.id, { host_push: sub })
    return { ok: true }
  }
  const me = await requirePlayer(ctx, game, body)
  if (!sub || typeof sub.endpoint !== 'string') throw new ActionError(400, 'Invalid push subscription')
  await ctx.store.updatePlayers([{ id: me.id, patch: { push: sub } }])
  return { ok: true }
}

const claim: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  await recordScanLocation(ctx, game, me, body)
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  if (fresh.paused_at) return { ok: false, reason: 'paused' }
  const station = stationFromQr(str(body.qr))
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  const verdict = judgeClaim({
    phase: phaseAt(fresh, ctx.now).phase,
    me,
    station,
    arena: game.arena,
    myPos: latest(positions[me.id]),
    powerUps: await ctx.store.powerUps(game.id),
    now: ctx.now,
  })
  if (!verdict.ok) return verdict
  const kind = pickPowerUp(me.role === 'chaser' ? 'chaser' : 'runner', ctx.rng)
  // Re-checked atomically by the store, so double-taps and simultaneous scans can't both win.
  const claimed = await ctx.store.claimStation(
    { game_id: game.id, player_id: me.id, kind, station: station! },
    STATION_LOCK_MS,
  )
  if (!claimed.ok) return claimed
  await ctx.store.addEvent({ game_id: game.id, type: 'powerup', actor_id: me.id, target_id: null, data: {} })
  return { ok: true, kind }
}

const usePowerup: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  if (fresh.paused_at) return { ok: false, reason: 'paused' }
  const { phase, endsAt } = phaseAt(fresh, ctx.now)
  const all = await ctx.store.powerUps(game.id)
  const u = all.find((x) => x.id === str(body.powerupId))
  if (!u || u.player_id !== me.id) return { ok: false, reason: 'not-yours' }
  if (u.used_at) return { ok: false, reason: 'already-used' }
  if (phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  if (me.jailed) return { ok: false, reason: 'cannot-use' }
  // A Flare's reveal must land before the whistle.
  if (u.kind === 'flare' && (endsAt ?? 0) - ctx.now < ALERT_LEAD_MS) return { ok: false, reason: 'too-late' }

  // markUsed is atomic: a double-tap uses the power-up once.
  if (!(await ctx.store.markUsed(u.id))) return { ok: false, reason: 'already-used' }
  if (u.kind === 'flare') {
    try {
      await ctx.store.addBonusPing(game.id, iso(ctx.now), iso(ctx.now + ALERT_LEAD_MS))
    } catch (e) {
      await ctx.store.updatePowerUp(u.id, { used_at: null }) // give the Flare back
      throw e
    }
  }
  await ctx.store.addEvent({ game_id: game.id, type: 'used', actor_id: me.id, target_id: null, data: { kind: u.kind } })
  return { ok: true, kind: u.kind }
}

const sos: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  requireRunning(game, ctx.now)
  await recordScanLocation(ctx, game, me, body)
  // A panicked double-tap raises one alert, not several.
  const recent = (await ctx.store.events(game.id)).some(
    (e) => e.type === 'sos' && e.actor_id === me.id && ctx.now - Date.parse(e.at) < SOS_REPEAT_MS,
  )
  if (recent) return { ok: true, repeat: true }
  const where = coordsOf(body)
  const data = { who: who(me), lat: where?.lat ?? null, lng: where?.lng ?? null }
  await ctx.store.addEvent({ game_id: game.id, type: 'sos', actor_id: me.id, target_id: null, data })
  await ctx.store.addSafetyRecord({
    game_id: game.id,
    type: 'sos',
    player_id: me.id,
    target_id: null,
    lat: data.lat,
    lng: data.lng,
    data: { game_code: game.code, name: data.who },
  })
  return { ok: true, notified: await alertMarshals(ctx, game, `SOS from ${data.who}`) }
}

const report: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  requireRunning(game, ctx.now)
  const reason = str(body.reason) as ReportReason
  if (!Object.hasOwn(REASON_LABEL, reason)) throw new ActionError(400, 'Pick a reason')
  const note = str(body.note).trim()
  if (note.length > NOTE_MAX) throw new ActionError(400, `Keep the note under ${NOTE_MAX} characters`)
  const target = (await ctx.store.players(game.id)).find((p) => p.id === str(body.targetId))
  if (!target || target.id === me.id) throw new ActionError(400, 'Pick another player in this game')
  await recordScanLocation(ctx, game, me, body)
  const where = coordsOf(body)
  const data = { name: who(me), targetName: who(target), reason, note, lat: where?.lat ?? null, lng: where?.lng ?? null }
  const e = await ctx.store.addEvent({ game_id: game.id, type: 'report', actor_id: me.id, target_id: target.id, data })
  await ctx.store.addSafetyRecord({
    game_id: game.id,
    type: 'report',
    player_id: me.id,
    target_id: target.id,
    lat: data.lat,
    lng: data.lng,
    data: { game_code: game.code, name: data.name, target_name: data.targetName, reason, note },
  })
  return { ok: true, notified: await alertMarshals(ctx, game, alertsFrom([e])[0].text) }
}

const handleAlert: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, game, body)
  await ctx.store.addEvent({
    game_id: game.id,
    type: 'handled',
    actor_id: marshal?.id ?? null,
    target_id: null,
    data: { eventId: str(body.eventId) },
  })
  return { ok: true }
}

const removePlayer: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, game, body)
  const target = (await ctx.store.players(game.id)).find((p) => p.id === str(body.playerId))
  if (!target || !(await ctx.store.removePlayer(target.id))) return { ok: false }
  await ctx.store.addEvent({
    game_id: game.id,
    type: 'removed',
    actor_id: marshal?.id ?? null,
    target_id: target.id,
    data: { name: target.name },
  })
  await ctx.store.addSafetyRecord({
    game_id: game.id,
    type: 'removed',
    player_id: marshal?.id ?? null,
    target_id: target.id,
    lat: null,
    lng: null,
    data: { game_code: game.code, by: marshal?.name ?? 'Organiser', target_name: target.name },
  })
  // The removed runner may have been the last one still free.
  const phase = phaseAt(game, ctx.now).phase
  if (phase === 'hiding' || phase === 'chasing') {
    const runners = (await ctx.store.players(game.id)).filter((p) => p.role === 'runner')
    if (runners.every((p) => p.jailed)) await finish(ctx, game)
  }
  return { ok: true }
}

const pause: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, game, body)
  await advance(ctx, game)
  const phase = phaseAt((await loadGame(ctx, body)) as Game, ctx.now).phase
  if (phase !== 'hiding' && phase !== 'chasing') throw new ActionError(409, 'The game is not running')
  if (!(await ctx.store.pauseGame(game.id))) return { ok: false }
  await ctx.store.addEvent({ game_id: game.id, type: 'paused', actor_id: marshal?.id ?? null, target_id: null, data: {} })
  return { ok: true }
}

const resume: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, game, body)
  if ((await ctx.store.resumeGame(game.id)) === null) return { ok: false }
  await ctx.store.addEvent({ game_id: game.id, type: 'resumed', actor_id: marshal?.id ?? null, target_id: null, data: {} })
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
  claim,
  usePowerup,
  pause,
  resume,
  sos,
  report,
  handleAlert,
  removePlayer,
} satisfies Record<string, Action>

export type ActionName = keyof typeof actions
