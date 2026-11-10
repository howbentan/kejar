import {
  alertsFrom,
  NOTE_MAX,
  LUAR_GARISAN_MAX_ACCURACY_M,
  LUAR_GARISAN_WARN,
  OUTSIDE_MARGIN_M,
  REASON_LABEL,
  SOS_DETAILS_MS,
  SOS_OUTCOME_LABEL,
  SOS_REASON_LABEL,
  SOS_REPEAT_MS,
  START_RADIUS_M,
  who,
  type ReportReason,
  type SosReason,
} from '../../shared/alerts.js'
import { autoJailDue, checkinsSince, countedCheckIn, fairlyWarned } from '../../shared/checkins.js'
import { cardAt, deckFor, setsFor } from '../../shared/deck.js'
import { arenaFromDraft, pointProblems, type ArenaDraft } from '../../shared/arenaDraft.js'
import { arenaAroundPoint } from '../../shared/arenas.js'
import { isOut } from '../../shared/players.js'
import { judgeCatch, judgeJailbreak, judgeSettle } from '../../shared/catch.js'
import { ALERT_LEAD_MS, BONUS_SEQ_BASE, chaseStartOf, dueWork, phaseAt, pingTimes } from '../../shared/clock.js'
import { bomohCodeFromQr, datoCodeFromQr, isBomohQr, isDatoQr, JAIL_QR, MAX_PLAYERS_PER_GAME, newGameCode, stationFromQr, tagIdFromQr } from '../../shared/ids.js'
import { activeShield, flareBlocked, judgeBomohClaim, judgeClaim, judgeDatoClaim, STATION_LOCK_MS } from '../../shared/powerups.js'
import { computeResults } from '../../shared/results.js'
import { packItems, placeItems, SECRET_PACK_IDS, SECRET_PLACE_IDS, type SecretLetters } from '../../shared/kit.js'
import { validateTeams } from '../../shared/teams.js'
import { DEFAULT_SETTINGS, type Arena, type BomohStash, type DatoStash, type Game, type LatLng, type Player, type Position, type PowerUpKind, type Role, type SecretCard, type Settings } from '../../shared/types.js'
import { latestAtOrBefore, snapshotWindow, viewFor, type SnapshotInput } from '../../shared/views.js'
import { distanceM } from '../../shared/geo.js'
import { buildPlayArea, distanceOutsidePlayArea, inPlayArea, ringAreaHa } from '../../shared/playArea.js'
import { MARSHAL_INVITE_TTL_MS, ORGANISER_INVITE_TTL_MS } from '../../shared/invites.js'
import { OSM_CACHE_MS, parkFeatures as lookupParkFeatures, searchParks as lookupParks, type FetchJson } from './osm.js'
import { hashToken, newDatoCode, newToken } from './secrets.js'
import type { GameRow, GameStore, OrganiserRow, SafetyRecord, SavedArenaRow } from './store.js'

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
  /** For the OpenStreetMap lookups (Plan 4b). */
  fetchJson?: FetchJson
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

async function requireAnyOrganiser(ctx: Ctx, body: Body): Promise<OrganiserRow> {
  const o = body.organiserToken ? await ctx.store.organiserBySessionTokenHash(hashToken(str(body.organiserToken))) : null
  if (!o) throw new ActionError(403, 'Sign in as an organiser first')
  return o
}

async function requireOrganiser(ctx: Ctx, game: GameRow, body: Body): Promise<OrganiserRow> {
  const o = await requireAnyOrganiser(ctx, body)
  if (o.id !== game.organiser_id) throw new ActionError(403, 'Organiser only')
  return o
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
  if (body.organiserToken) {
    await requireOrganiser(ctx, game, body)
    return null
  }
  const p = await requirePlayer(ctx, game, body)
  if (p.role !== 'marshal') throw new ActionError(403, 'Marshals only')
  return p
}

/**
 * Who a marshal action is by, for display: the marshal's own name, or the organiser's when `requireMarshal`
 * returned null for them (organisers aren't players, so they have no `Player.name`).
 */
async function marshalName(ctx: Ctx, game: GameRow, body: Body, marshal: Player | null): Promise<string> {
  return marshal ? marshal.name : (await requireOrganiser(ctx, game, body)).name
}

/** The card letters of the secret sets assigned to this game: Dato Seri's yellow and Bomoh's purple, when assigned. */
function secretLettersFor(game: Game): SecretLetters {
  const letters: SecretLetters = {}
  if (game.dato_stash?.card?.letter) letters.dato = game.dato_stash.card.letter
  if (game.bomoh_stash?.card?.letter) letters.bomoh = game.bomoh_stash.card.letter
  return letters
}

// ---- Secret card sets: each organisation's reusable A-C yellow and A-C purple cards ----

/** Which legendary a card-lifecycle function acts on: Dato Seri's yellow cards, or Bomoh's purple ones. */
type LegendaryKind = 'dato' | 'bomoh'

/** What `create` and `setMode` say when every yellow card is retired, waiting to be printed or in another game. */
export const NO_FREE_CARD_NOTICE = 'Reprint a yellow card to use Dato Seri.'
/** The same, for Bomoh's purple cards. */
export const NO_FREE_BOMOH_CARD_NOTICE = 'Reprint a purple card to use Bomoh.'
const NO_FREE_NOTICE: Record<LegendaryKind, string> = { dato: NO_FREE_CARD_NOTICE, bomoh: NO_FREE_BOMOH_CARD_NOTICE }
/** Stash scans that don't claim before a player's later stash scans are all ignored (Review Focus 2). */
export const STASH_MISS_LIMIT = 3
const NO_STASH = { ok: false, reason: 'no-stash' } as const

/** A lobby holds its card for this long after it was made; then it must re-check it before use (ruling R3). */
export const LOBBY_HOLD_MS = 24 * 60 * 60_000

/** An unstarted game made more than LOBBY_HOLD_MS ago. A row with no `created_at` (older test data) never expires. */
function expiredLobby(g: Game, now: number): boolean {
  return !g.started_at && !!g.created_at && now - Date.parse(g.created_at) >= LOBBY_HOLD_MS
}

/** The stash a game holds for one legendary, by its own field (`dato_stash` or `bomoh_stash`). */
function stashOf(g: Game, legendary: LegendaryKind): DatoStash | BomohStash | null | undefined {
  return legendary === 'dato' ? g.dato_stash : g.bomoh_stash
}

/** Writes (or clears, with `null`) a legendary's stash onto a game, into its own field. */
function writeStash(ctx: Ctx, gameId: string, legendary: LegendaryKind, stash: DatoStash | BomohStash | null): Promise<void> {
  return ctx.store.updateGame(gameId, legendary === 'dato' ? { dato_stash: stash } : { bomoh_stash: stash })
}

/**
 * Whether a game holds its card right now: started and not ended (including one whose time ran out that nobody
 * has polled, so `ended_at` is still unset), or a lobby made less than LOBBY_HOLD_MS ago (ruling R3).
 */
function holdsCard(g: Game, now: number, legendary: LegendaryKind): boolean {
  const stash = stashOf(g, legendary)
  if (!stash?.card) return false
  if (g.started_at) return phaseAt(g, now).phase !== 'ended'
  // A card already hidden stays this lobby's at any age (amended ruling R3): handing it to another game would
  // leave a real card in the park that claims nothing.
  return isDropped(stash) || !expiredLobby(g, now)
}

const isDropped = (s: DatoStash | BomohStash | null | undefined) => typeof s?.lat === 'number' && typeof s?.lng === 'number'

/** Each card of one legendary held by one of the organisation's games, with the game holding it. */
async function cardHolders(ctx: Ctx, organisationId: string, legendary: LegendaryKind): Promise<Map<string, GameRow>> {
  const since = iso(ctx.now - LOBBY_HOLD_MS)
  const holders = new Map<string, GameRow>()
  for (const g of await ctx.store.unfinishedGames(organisationId, since)) {
    if (holdsCard(g, ctx.now, legendary)) holders.set(stashOf(g, legendary)!.card!.id, g)
  }
  return holders
}

/**
 * A random free card of the given legendary (ready, and held by no other game of the organisation), or null when
 * there's none. Two creates at the same moment could pick the same card: an accepted race, very unlikely for one
 * organisation.
 */
async function freeCard(ctx: Ctx, organisationId: string, legendary: LegendaryKind, exceptGameId?: string): Promise<SecretCard | null> {
  const held = await cardHolders(ctx, organisationId, legendary)
  const free = (await ctx.store.secretCards(organisationId)).filter(
    (c) => c.legendary === legendary && c.state === 'ready' && (!held.has(c.id) || held.get(c.id)!.id === exceptGameId),
  )
  if (free.length === 0) return null
  return free[Math.min(free.length - 1, Math.floor(ctx.rng() * free.length))]
}

/** A fresh, not yet dropped stash on the given card: its code is the card's code, so the printed card claims. */
const stashOn = (card: SecretCard): DatoStash | BomohStash => ({ code: card.code, card: { id: card.id, letter: card.letter }, lat: null, lng: null, claimedBy: null, claimedAt: null })

/**
 * The lobby lets go of its card (ruling R8): no stash, and the walk's secret step is no longer placed, so a card
 * given later has to be hidden again. `placed.<legendary>` is removed with the atomic kit write.
 */
async function releaseCard(ctx: Ctx, game: GameRow, legendary: LegendaryKind): Promise<void> {
  if (stashOf(game, legendary)) await writeStash(ctx, game.id, legendary, null)
  if (game.kit?.placed?.[legendary]) await ctx.store.setKitKey(game.id, 'placed', legendary, null)
}

/** A lobby that wants a legendary (Full, setting on) but holds no card yet (ruling R9). */
const wantsCard = (g: Game, legendary: LegendaryKind) =>
  !g.started_at && g.settings.mode === 'full' && g.settings.legendaries?.[legendary] === 'stash' && !stashOf(g, legendary)

/**
 * Gives a lobby with no card a free card of that legendary, not yet dropped (it has to be printed and hidden).
 * With none free the lobby keeps wanting it and tries again later (ruling R9); returns the notice while it has none.
 */
async function assignFreeCard(ctx: Ctx, gameId: string, organisationId: string, legendary: LegendaryKind): Promise<string | null> {
  const card = await freeCard(ctx, organisationId, legendary, gameId)
  if (!card) return NO_FREE_NOTICE[legendary]
  await writeStash(ctx, gameId, legendary, stashOn(card))
  return null
}

/** A lobby gives up its card (retired, or no longer its own) and takes a free one, or waits for one (ruling R9). */
async function reassignCard(ctx: Ctx, game: GameRow, organisationId: string, legendary: LegendaryKind): Promise<string | null> {
  await releaseCard(ctx, game, legendary)
  return assignFreeCard(ctx, game.id, organisationId, legendary)
}

/**
 * A lobby made over LOBBY_HOLD_MS ago stopped holding its card, so before it's used again its card is checked
 * (ruling R3). Kept if it's still `ready` and no other game holds it, with its current code (a reprint while the
 * lobby wasn't holding it); otherwise it's let go and the lobby takes another free card, or waits for one (R9).
 * Returns the notice while the lobby has no card.
 */
async function recheckExpiredLobby(ctx: Ctx, game: GameRow, organisationId: string, legendary: LegendaryKind): Promise<string | null> {
  const stash = stashOf(game, legendary)
  if (!stash?.card || !expiredLobby(game, ctx.now)) return null
  const card = (await ctx.store.secretCards(organisationId)).find((c) => c.id === stash.card!.id)
  const holder = (await cardHolders(ctx, organisationId, legendary)).get(stash.card.id)
  const ours = !!card && card.state !== 'retired' && (!holder || holder.id === game.id)
  // A hidden card is kept only while it still claims (amended R3). One that no longer does is let go, never kept
  // as if hidden: the new card is not dropped, so the walk asks for it to be hidden again (R8).
  if (ours && (!isDropped(stash) || card!.code === stash.code)) {
    if (card!.code !== stash.code) await writeStash(ctx, game.id, legendary, { ...stash, code: card!.code })
    return null
  }
  return reassignCard(ctx, game, organisationId, legendary)
}

/**
 * Before a lobby's card is used (setMode to Full, a drop, start, the organiser's own poll): an expired lobby
 * re-checks its card (R3), and a lobby that wants that legendary but has none tries for a free one (R9). Returns
 * the game as it now is, and the notice while it still has no card. Player polls never run this.
 */
async function settleLobbyCard(ctx: Ctx, game: GameRow, organisationId: string, legendary: LegendaryKind): Promise<{ game: GameRow; notice: string | null }> {
  if (game.started_at) return { game, notice: null }
  await recheckExpiredLobby(ctx, game, organisationId, legendary)
  let fresh = (await ctx.store.gameByCode(game.code)) ?? game
  if (wantsCard(fresh, legendary) && !(await assignFreeCard(ctx, fresh.id, organisationId, legendary))) {
    fresh = (await ctx.store.gameByCode(game.code)) ?? fresh
  }
  return { game: fresh, notice: wantsCard(fresh, legendary) ? NO_FREE_NOTICE[legendary] : null }
}

/** The cheap test the organiser's poll runs before paying for a re-check: an expired lobby's undropped card, or no card yet. */
const needsRecheck = (g: Game, now: number, legendary: LegendaryKind) => {
  const stash = stashOf(g, legendary)
  return (!!stash?.card && !isDropped(stash) && expiredLobby(g, now)) || wantsCard(g, legendary)
}

/** The card a card action names, in the calling organiser's own set. */
async function requireSecretCard(ctx: Ctx, body: Body): Promise<{ card: SecretCard; organisationId: string }> {
  const organiser = await requireAnyOrganiser(ctx, body)
  const legendary = str(body.legendary)
  const letter = str(body.letter)
  if ((legendary !== 'dato' && legendary !== 'bomoh') || !['A', 'B', 'C'].includes(letter)) throw new ActionError(400, 'Unknown card')
  const card = (await ctx.store.secretCards(organiser.organisation_id)).find((c) => c.legendary === legendary && c.letter === letter)
  if (!card) throw new ActionError(404, 'Unknown card')
  return { card, organisationId: organiser.organisation_id }
}

/** The organiser's card set, never with codes: which are ready, retired or printing, when found, and which are in a game. */
const listSecretCards: Action = async (ctx, body) => {
  const organiser = await requireAnyOrganiser(ctx, body)
  const busy = new Map<string, GameRow>([
    ...(await cardHolders(ctx, organiser.organisation_id, 'dato')),
    ...(await cardHolders(ctx, organiser.organisation_id, 'bomoh')),
  ])
  const order = (c: SecretCard) => `${c.legendary === 'dato' ? 0 : 1}${c.letter}`
  return (await ctx.store.secretCards(organiser.organisation_id))
    .sort((a, b) => order(a).localeCompare(order(b)))
    .map((c) => ({ legendary: c.legendary, letter: c.letter, state: c.state, foundAt: c.found_at, inGame: busy.has(c.id) }))
}

/**
 * The game holding a card, if any (ruling R2): a started game can't lose its card mid-game, so that's a 409; a
 * lobby is returned, for the caller to update.
 */
async function lobbyHolding(ctx: Ctx, card: SecretCard, organisationId: string): Promise<GameRow | null> {
  const holder = (await cardHolders(ctx, organisationId, card.legendary)).get(card.id)
  if (holder?.started_at) throw new ActionError(409, 'That card is in a game right now.')
  return holder ?? null
}

/**
 * A lost or spoilt card: never put in play again until it's reprinted. A lobby holding it gets another free card,
 * or that legendary off (`notice` then says so).
 */
const retireSecretCard: Action = async (ctx, body) => {
  const { card, organisationId } = await requireSecretCard(ctx, body)
  const lobby = await lobbyHolding(ctx, card, organisationId)
  await ctx.store.setSecretCard(card.id, { state: 'retired' })
  const notice = lobby ? await reassignCard(ctx, lobby, organisationId, card.legendary) : null
  return notice ? { ok: true, notice } : { ok: true }
}

/**
 * A fresh code for the card, so every copy of the old one claims nothing. Not free until it's confirmed printed.
 * A lobby holding it takes the new code, so its print link and its claim stay the same card. If it was already
 * dropped, the drop goes too (ruling R8): the old print claims nothing, so the new print must be hidden again.
 */
const reprintSecretCard: Action = async (ctx, body) => {
  const { card, organisationId } = await requireSecretCard(ctx, body)
  const lobby = await lobbyHolding(ctx, card, organisationId)
  const code = newDatoCode()
  await ctx.store.setSecretCard(card.id, { code, state: 'printing' })
  if (lobby) {
    const stash = stashOf(lobby, card.legendary)!
    await writeStash(ctx, lobby.id, card.legendary, { ...stash, code, lat: null, lng: null, claimedBy: null, claimedAt: null })
    if (lobby.kit?.placed?.[card.legendary]) await ctx.store.setKitKey(lobby.id, 'placed', card.legendary, null)
  }
  return { ok: true }
}

const confirmSecretCardPrinted: Action = async (ctx, body) => {
  const { card } = await requireSecretCard(ctx, body)
  if (card.state !== 'printing') throw new ActionError(409, 'That card is not waiting to be printed')
  await ctx.store.setSecretCard(card.id, { state: 'ready' })
  return { ok: true }
}

/** The card's code, for the organiser-only print link. */
const secretCardCode: Action = async (ctx, body) => {
  const { card } = await requireSecretCard(ctx, body)
  return { code: card.code }
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
  if (s.mode !== 'core' && s.mode !== 'full') throw new ActionError(400, 'Unknown game mode')
  if (typeof s.chaserSnapshot !== 'boolean') throw new ActionError(400, 'Chaser snapshot must be on or off')
  // The check-in switch is a Full-mode extra: always off in Core (rules §3).
  if (s.mode === 'core') s.chaserSnapshot = false
  if (![20, 30, 40].includes(s.playersBand)) throw new ActionError(400, 'Expected players must be 20, 30 or 40')
  const given = (typeof input === 'object' && input ? (input as { legendaries?: unknown }).legendaries : undefined) ?? {}
  if (typeof given !== 'object' || Array.isArray(given)) throw new ActionError(400, 'Legendary cards must be off or on a hidden stash')
  const legendaries = { ...DEFAULT_SETTINGS.legendaries, ...given } as Settings['legendaries']
  for (const v of [legendaries.dato, legendaries.bomoh]) {
    if (v !== 'off' && v !== 'stash') throw new ActionError(400, 'Legendary cards must be off or on a hidden stash')
  }
  // Bomoh is accepted as sent now that he's built end to end: his own purple cards, claim, reveal and lobby toggle.
  // Only the two known keys are stored, so nothing else a client sends ends up in the game's settings.
  s.legendaries = { dato: legendaries.dato, bomoh: legendaries.bomoh }
  return s
}

/** The moments a view looks at: now, the spectator delay, the last revealed ping, and the last scheduled one. */
function viewTimes(game: Game, pings: { seq: number; revealed: boolean; reveal_at: string }[], now: number): string[] {
  const times = [iso(now), iso(now - game.settings.spectatorDelayMin * 60_000)]
  // Latest reveal by time: bonus (Flare) pings have high numbers but can come before scheduled ones.
  const last = pings
    .filter((p) => p.revealed && p.seq > 0)
    .sort((a, b) => Date.parse(b.reveal_at) - Date.parse(a.reveal_at))[0]
  if (last) times.push(last.reveal_at)
  // The check-in banner judges the last scheduled ping too, which a later bonus reveal would hide.
  const scheduled = pingTimes(game, now)
    .filter((t) => t.revealAt <= now)
    .at(-1)
  if (scheduled && iso(scheduled.revealAt) !== last?.reveal_at) times.push(iso(scheduled.revealAt))
  return times
}

/** The worst accuracy stored for a fix, in metres. */
export const MAX_ACCURACY_M = 5_000

/**
 * A fix's accuracy as stored: missing is 0, and anything over 5,000 m is held at 5,000 m. Null when it isn't
 * a finite, non-negative number. Shared by `location` (which refuses a null) and scans (which store 0).
 */
function cleanAccuracy(v: unknown): number | null {
  if (v === undefined) return 0
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
  return Math.min(v, MAX_ACCURACY_M)
}

/** Records coordinates sent along with a scan, so judging uses where the phone is right now. */
async function recordScanLocation(ctx: Ctx, game: Game, me: Player, body: Body) {
  const { lat, lng, accuracy_m } = body as { lat?: unknown; lng?: unknown; accuracy_m?: unknown }
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return
  // A scan is never refused over its accuracy: a bad value is just stored as 0.
  await ctx.store.addPosition(game.id, me.id, { lat, lng, accuracy_m: cleanAccuracy(accuracy_m) ?? 0 })
}

const latest = (list: Position[] | undefined) => (list && list.length ? list[list.length - 1] : null)

const lastAtOf = (list: Position[] | undefined, t: number) => {
  const at = latestAtOrBefore(list, t)
  return at ? Date.parse(at.at) : null
}

/**
 * A free runner's chaser snapshot needs the chasers as of one more moment: the alert of the last scheduled
 * ping they checked into (checkins design §5). Loads just that moment, only when it isn't already loaded.
 */
async function withSnapshotMoment(ctx: Ctx, input: SnapshotInput, times: string[]): Promise<Record<string, Position[]>> {
  const w = snapshotWindow(input)
  // Cost: one extra latest_positions call (one RPC) on most polls by a free runner with the switch on, since
  // the view's usual moments never include an alert; folding it into viewTimes would cost the same RPC for every viewer.
  if (!w || times.includes(iso(w.alertAt))) return input.positions
  const extra = await ctx.store.latestPositions(input.game.id, [iso(w.alertAt)])
  const out: Record<string, Position[]> = { ...input.positions }
  for (const [id, list] of Object.entries(extra)) {
    const merged = [...(out[id] ?? [])]
    for (const p of list) if (!merged.some((x) => x.at === p.at)) merged.push(p)
    out[id] = merged.sort((a, b) => a.at.localeCompare(b.at))
  }
  return out
}

/** Brings the game up to date: chase start, alerts, reveals and the end. Safe to call from many pages at once. */
async function advance(ctx: Ctx, game: Game): Promise<void> {
  const { store, now } = ctx
  const phase = phaseAt(game, now).phase
  if (phase === 'lobby') return

  if ((phase === 'chasing' || phase === 'ended') && (await store.claimPing(game.id, 0, 'revealed'))) {
    await store.addEvent({ game_id: game.id, type: 'chase', actor_id: null, target_id: null, data: {} })
  }

  let pingRows = await store.pings(game.id)
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
    const runners = (await store.players(game.id)).filter((p) => p.role === 'runner' && !isOut(p))
    await pushTo(ctx, runners, { type: 'checkin', code: game.code, seq, revealAt: times.get(seq)?.revealAt })
  }

  // The alerts just claimed (here or by a concurrent call) now carry their send times.
  if (work.alert.length && work.reveal.length) pingRows = await store.pings(game.id)
  const sentAt = new Map(pingRows.map((r) => [r.seq, r.alert_sent_at ? Date.parse(r.alert_sent_at) : null] as const))
  const warned = (t: { seq: number; revealAt: number }) => fairlyWarned(sentAt.get(t.seq) ?? null, t.revealAt, game.settings.checkinMode)

  for (const seq of work.reveal) {
    if (!(await store.claimPing(game.id, seq, 'revealed'))) continue
    const revealAt = times.get(seq)?.revealAt ?? now
    const positions = await store.latestPositions(game.id, [iso(revealAt)])
    const free = (await store.players(game.id)).filter((p) => p.role === 'runner' && !isOut(p))
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
    // The count starts fresh at each runner's own last release (checkins design §4.4).
    const sinceFor = (p: Player) => checkinsSince(chaseStartOf(game, now)!, p.freed_at)
    // With the chaser-snapshot switch on, a scheduled reveal records who checked in (a location inside its
    // 45 s window, counted under the same release rule as auto-jail), so a runner's view can find the last
    // window they checked into without loading every reveal's positions (checkins design §5.4).
    const scheduled = seq < BONUS_SEQ_BASE ? pingTimes(game, now).find((t) => t.seq === seq) : undefined
    const checkedInIds =
      game.settings.chaserSnapshot === true && scheduled
        ? free
            .filter((p) => countedCheckIn(scheduled.alertAt, scheduled.revealAt, lastAtOf(positions[p.id], scheduled.revealAt), sinceFor(p)))
            .map((p) => p.id)
        : null
    // Cloaked runners count as missed, matching what chasers see on the map.
    await store.addEvent({
      game_id: game.id,
      type: 'ping',
      actor_id: null,
      target_id: null,
      data: { seq, seen, missed: free.length - seen, ...(checkedInIds ? { checkedIn: checkedInIds } : {}) },
    })
    if (seq < BONUS_SEQ_BASE) {
      // Flares give only 30 s notice, so only scheduled pings count towards a missed streak.
      // The last three are loaded so a jailed runner's screen can show the check-ins it was judged on.
      // A ping whose alert gave under 25 s of warning is skipped: it is neither a miss nor a reset, and a
      // skipped reveal judges nobody (fair-play §1.1).
      const lastThree = pingTimes(game, now).filter((t) => t.seq <= seq && warned(t)).slice(-3)
      const lastTwo = warned({ seq, revealAt }) ? lastThree.slice(-2) : []
      const atReveals = lastTwo.length === 2 ? await store.latestPositions(game.id, lastThree.map((t) => iso(t.revealAt))) : {}
      for (const p of lastTwo.length === 2 ? free : []) {
        // Only a location inside each ping's 45 s window counts as a check-in (§4.2).
        const since = sinceFor(p)
        const judged = lastThree.map((t) => {
          const at = latestAtOrBefore(atReveals[p.id], t.revealAt)
          return { alertAt: t.alertAt, revealAt: t.revealAt, lastAt: at ? Date.parse(at.at) : null }
        })
        const pings = judged.slice(-2)
        // Two missed scheduled check-ins in a row: sent to Penjara like a catch, with no chaser.
        if (autoJailDue(pings, since) && (await store.catchRunner(p.id, null))) {
          const checkins = judged
            .filter((t) => t.alertAt >= since)
            .map((t) => ({ revealAt: t.revealAt, ok: countedCheckIn(t.alertAt, t.revealAt, t.lastAt, since) }))
          await store.addEvent({ game_id: game.id, type: 'auto-jailed', actor_id: null, target_id: p.id, data: { who: who(p), seq, checkins } })
        }
      }
      // Auto-jailing the last free runner ends the game, the same as a catch.
      const runners = (await store.players(game.id)).filter((p) => p.role === 'runner')
      if (runners.length > 0 && runners.every(isOut)) await finish(ctx, game)
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
  const organiser = await requireAnyOrganiser(ctx, body)
  let arena: Arena
  if (body.draft !== undefined) {
    arena = buildArena(asDraft(body.draft), 'one-off')
  } else if (body.savedArenaId !== undefined) {
    const saved = await requireArena(ctx, organiser, body.savedArenaId)
    const o = (typeof body.overrides === 'object' && body.overrides ? body.overrides : {}) as Record<string, unknown>
    const draft = asDraft({
      ...saved.draft,
      ...(o.jail !== undefined ? { jail: o.jail } : {}),
      ...(o.start !== undefined ? { start: o.start } : {}),
      ...(o.stations !== undefined ? { stations: o.stations } : {}),
    })
    // A copy for this game only: the saved arena is never changed by a game.
    arena = buildArena(draft, saved.id)
  } else if (body.arenaId === 'around-me') {
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
    throw new ActionError(400, 'Unknown arena')
  }
  const settings = settingsFrom(body.settings)
  // Full with Dato Seri on: a free yellow card now, so the organiser can print it before hiding it (ruling R15).
  // With none free, the game still gets made (Review Focus 1). It keeps wanting Dato Seri and tries again later (R9).
  let stash: DatoStash | null = null
  let noFreeCard = false
  if (settings.mode === 'full' && settings.legendaries.dato === 'stash') {
    const card = await freeCard(ctx, organiser.organisation_id, 'dato')
    if (card) stash = stashOn(card)
    else noFreeCard = true
  }
  // The same for Bomoh's purple cards, independently of Dato Seri's.
  let bomohStash: BomohStash | null = null
  let noFreeBomohCard = false
  if (settings.mode === 'full' && settings.legendaries.bomoh === 'stash') {
    const card = await freeCard(ctx, organiser.organisation_id, 'bomoh')
    if (card) bomohStash = stashOn(card)
    else noFreeBomohCard = true
  }
  let code = newGameCode(ctx.rng)
  while (await ctx.store.gameByCode(code)) code = newGameCode(ctx.rng)
  await ctx.store.createGame({
    code,
    arena,
    settings,
    started_at: null,
    ended_at: null,
    winner: null,
    paused_at: null,
    pauses: [],
    organiser_id: organiser.id,
    ...(stash ? { dato_stash: stash } : {}),
    ...(bomohStash ? { bomoh_stash: bomohStash } : {}),
  })
  const notices = [noFreeCard ? NO_FREE_CARD_NOTICE : null, noFreeBomohCard ? NO_FREE_BOMOH_CARD_NOTICE : null].filter(
    (n): n is string => n !== null,
  )
  return notices.length ? { code, notice: notices.join(' ') } : { code }
}

export { MAX_PLAYERS_PER_GAME }
/** A player's streamed location is stored at most once this often; scans always record their own fix. */
export const LOCATION_MIN_GAP_MS = 2_000

const join: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  if (body.token) {
    const existing = await ctx.store.playerByToken(game.id, hashToken(str(body.token)))
    if (existing) return { token: str(body.token), playerId: existing.id }
  }
  requireLobby(game, ctx.now)
  if (body.accepted !== true) throw new ActionError(400, 'Accept the code of conduct and waiver to join')
  if ((await ctx.store.players(game.id)).length >= MAX_PLAYERS_PER_GAME) throw new ActionError(409, 'This game is full')
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
    freed_at: null,
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
  await requireOrganiser(ctx, game, body)
  requireLobby(game, ctx.now)
  // The organiser picks each player's side: kit (vests, armbands) goes on in the lobby, so it's never a
  // random draw. Marshals only join through their invite link and are never a player's option.
  if (body.shuffle !== undefined) throw new ActionError(400, "Pick each player's side")
  const players = await ctx.store.players(game.id)
  const given = (body.roles ?? {}) as Record<string, Role>
  const roles: Record<string, Role> = Object.fromEntries(players.filter((p) => p.role).map((p) => [p.id, p.role!]))
  const changes: { id: string; role: Role }[] = []
  for (const [id, role] of Object.entries(given)) {
    const p = players.find((x) => x.id === id)
    if (!p || p.role === 'marshal') throw new ActionError(400, 'Pick a player in this game')
    if (role !== 'runner' && role !== 'chaser') throw new ActionError(400, 'Players are Dikejar or Kejar')
    roles[id] = role
    changes.push({ id, role })
  }
  await ctx.store.updatePlayers(changes.map(({ id, role }) => ({ id, patch: role === 'runner' ? { role } : { role, tag_id: null } })))
  await ctx.store.addEvent({ game_id: game.id, type: 'roles', actor_id: null, target_id: null, data: {} })
  return { roles, problems: validateTeams(roles) }
}

const start: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const organiser = await requireOrganiser(ctx, game, body)
  requireLobby(game, ctx.now)
  const players = await ctx.store.players(game.id)
  const roles = Object.fromEntries(players.filter((p) => p.role).map((p) => [p.id, p.role!]))
  const problems = [
    ...players.filter((p) => !p.role).map((p) => `${p.name} has no role`),
    ...validateTeams(roles),
    ...players.filter((p) => p.role === 'runner' && p.tag_id === null).map((p) => `Runner ${p.name} has no tag`),
  ]
  if (problems.length) throw new ActionError(409, problems.join(' · '))
  // A lobby left over a day re-checks its card, and one with no card tries once more (rulings R3, R9). Still none:
  // the game starts with that legendary off, and the organiser is told.
  const datoSettled = await settleLobbyCard(ctx, game, organiser.organisation_id, 'dato')
  const bomohSettled = await settleLobbyCard(ctx, datoSettled.game, organiser.organisation_id, 'bomoh')
  const settled = bomohSettled.game
  const notices = [datoSettled.notice, bomohSettled.notice].filter((n): n is string => n !== null)
  const startedAt = iso(ctx.now)
  const started = { ...game, started_at: startedAt }
  const count = (role: Role) => Object.values(roles).filter((r) => r === role).length
  const offLegendaries: Partial<Settings['legendaries']> = {}
  if (wantsCard(settled, 'dato')) offLegendaries.dato = 'off'
  if (wantsCard(settled, 'bomoh')) offLegendaries.bomoh = 'off'
  await ctx.store.updateGame(game.id, {
    ...(Object.keys(offLegendaries).length
      ? { settings: { ...settled.settings, legendaries: { ...settled.settings.legendaries, ...offLegendaries } } }
      : {}),
    started_at: startedAt,
    runner_sets: setsFor('runner', count('runner')),
    deck_seed: newToken(),
    chaser_sets: setsFor('chaser', count('chaser')),
  })
  const chaseAt = iso(chaseStartOf(started)!)
  await ctx.store.addPings([
    { game_id: game.id, seq: 0, alert_at: chaseAt, reveal_at: chaseAt, alerted: true, revealed: false, alert_sent_at: null },
    ...pingTimes(started).map((t) => ({
      game_id: game.id,
      seq: t.seq,
      alert_at: iso(t.alertAt),
      reveal_at: iso(t.revealAt),
      alerted: false,
      revealed: false,
      alert_sent_at: null,
    })),
  ])
  await ctx.store.addEvent({ game_id: game.id, type: 'started', actor_id: null, target_id: null, data: {} })
  return notices.length ? { startedAt, notice: notices.join(' ') } : { startedAt }
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
    const organiser = await requireOrganiser(ctx, game as GameRow, body)
    me = {
      id: 'host',
      game_id: game.id,
      name: organiser.name,
      role: 'marshal',
      tag_id: null,
      accepted_at: iso(ctx.now),
      caught_at: null,
      caught_by: null,
      jailed: false,
      freed_once: false,
      freed_at: null,
      push: (game as GameRow).host_push ?? null,
      removed_at: null,
      outside: false,
      left_start: false,
    }
  }
  // The organiser's own poll only (ruling R9): an expired lobby re-checks its card, so the print link never shows a
  // card another game holds, and a lobby with no card tries for one. Either legendary's. Player polls never pay for this.
  if (me.id === 'host' && (needsRecheck(game, ctx.now, 'dato') || needsRecheck(game, ctx.now, 'bomoh'))) {
    const org = (await ctx.store.organiserById((game as GameRow).organiser_id))?.organisation_id
    if (org) {
      if (needsRecheck(game, ctx.now, 'dato')) await settleLobbyCard(ctx, game as GameRow, org, 'dato')
      if (needsRecheck(game, ctx.now, 'bomoh')) await settleLobbyCard(ctx, game as GameRow, org, 'bomoh')
    }
  }
  await advance(ctx, game)
  game = (await loadGame(ctx, body)) as Game
  const players = await ctx.store.players(game.id)
  if (me.id !== 'host') me = players.find((p) => p.id === me.id) ?? me
  const events = await ctx.store.events(game.id)
  const pings = await ctx.store.pings(game.id)
  const ended = phaseAt(game, ctx.now).phase === 'ended'
  const times = viewTimes(game, pings, ctx.now)
  const loaded = await ctx.store.latestPositions(game.id, times)
  return viewFor({
    game,
    me,
    players,
    positions: await withSnapshotMoment(ctx, { game, me, positions: loaded, events, now: ctx.now }, times),
    pings,
    events,
    now: ctx.now,
    results: ended ? computeResults(game, players, events) : null,
    powerUps: await ctx.store.powerUps(game.id),
    secretLetters: secretLettersFor(game),
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
  const accuracy = cleanAccuracy(accuracy_m)
  if (accuracy === null) throw new ActionError(400, 'Invalid location')
  const fix = { lat, lng, accuracy_m: accuracy }
  // The gap never drops the first fix inside an open check-in window (a still phone re-sends its last fix
  // right after the alert), so only rows since the window's alert count against it.
  const since = openWindowAlert(pingTimes(game, ctx.now), ctx.now)
  const stored = await ctx.store.addPosition(game.id, me.id, fix, LOCATION_MIN_GAP_MS, since)
  if (!stored) {
    // Bonus (Flare) windows live in the pings table, so it is read only when the gap dropped this fix.
    const bonus = openWindowAlert(
      (await ctx.store.pings(game.id))
        .filter((r) => r.seq >= BONUS_SEQ_BASE)
        .map((r) => ({ alertAt: Date.parse(r.alert_at), revealAt: Date.parse(r.reveal_at) })),
      ctx.now,
    )
    if (bonus !== undefined && (since === undefined || bonus > since)) {
      await ctx.store.addPosition(game.id, me.id, fix, LOCATION_MIN_GAP_MS, bonus)
    }
  }
  await checkWhere(ctx, game, me, { lat, lng }, accuracy)
  return { ok: true }
}

/**
 * The alert time of the latest check-in window open at `now` (alert to reveal, as `checkedIn` judges it),
 * or undefined when none is open.
 */
function openWindowAlert(windows: { alertAt: number; revealAt: number }[], now: number): number | undefined {
  const open = windows.filter((w) => w.alertAt <= now && now <= w.revealAt).map((w) => w.alertAt)
  return open.length ? Math.max(...open) : undefined
}

const LUAR_GARISAN_COPY = {
  runner: {
    warn: LUAR_GARISAN_WARN,
    out: 'Luar Garisan lah! You left the play area, so no winning this round. You can still play along.',
  },
  chaser: {
    warn: LUAR_GARISAN_WARN,
    out: "Luar Garisan lah! You left the play area, so no winning this round, and your catches don't count.",
  },
}

/** One report clearly outside: the first warns, the second consecutive one disqualifies (spec §5-§6). */
async function luarGaris(ctx: Ctx, game: Game, me: Player) {
  const verdict = await ctx.store.markOutside(me.id, iso(ctx.now))
  if (verdict === 'unchanged') return
  const copy = LUAR_GARISAN_COPY[me.role === 'chaser' ? 'chaser' : 'runner']
  const warned = verdict === 'warned'
  // Order matters: the event, then the end-of-game check, then the push, so a failing push can't stop either.
  await ctx.store.addEvent({
    game_id: game.id,
    type: warned ? 'out-warned' : 'luar-garisan',
    actor_id: me.id,
    target_id: null,
    data: { who: who(me) },
  })
  // Disqualifying the last free runner ends the game, the same as catching them (spec §7a).
  if (!warned && me.role === 'runner') {
    const runners = (await ctx.store.players(game.id)).filter((p) => p.role === 'runner')
    if (runners.length > 0 && runners.every(isOut)) await finish(ctx, game)
  }
  try {
    await pushTo(ctx, [me], { type: 'notice', code: game.code, title: warned ? 'Outside the play area' : 'Luar Garisan', body: warned ? copy.warn : copy.out })
  } catch {
    // A push that can't be delivered must not fail the location report; the in-app banner and screen still show it.
  }
}

/** Raises marshal alerts for leaving the play area, or a chaser leaving the start early (spec §5.1). */
async function checkWhere(ctx: Ctx, game: Game, me: Player, here: LatLng, accuracy: number) {
  const phase = phaseAt(game, ctx.now).phase
  if ((phase !== 'hiding' && phase !== 'chasing') || me.jailed || (me.role !== 'runner' && me.role !== 'chaser')) return
  // Luar Garisan freezes with the game: nothing counts while paused, and a disqualified or removed player is done.
  // The marshal outside alert below is unchanged and keeps running either way.
  // A fix worse than LUAR_GARISAN_MAX_ACCURACY_M neither warns, disqualifies nor clears (the raw accuracy, before the slack clamp below).
  const ruleLive = !game.paused_at && !me.disqualified_at && !me.removed_at && accuracy <= LUAR_GARISAN_MAX_ACCURACY_M
  // Lakes cut out of the park count as outside too (Plan 4b).
  const outsideBy = distanceOutsidePlayArea(here, game.arena)
  // Alert only when clearly outside; re-arm only once back inside, so GPS jitter at the edge can't spam.
  if (outsideBy > OUTSIDE_MARGIN_M) {
    if (await ctx.store.setFlag(me.id, 'outside', true)) {
      await ctx.store.addEvent({ game_id: game.id, type: 'outside', actor_id: me.id, target_id: null, data: { who: who(me) } })
    }
    if (ruleLive) await luarGaris(ctx, game, me)
  } else {
    if (outsideBy === 0 && me.outside) await ctx.store.setFlag(me.id, 'outside', false)
    if (ruleLive && me.out_warned_at) await ctx.store.clearOutWarning(me.id)
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
    chaser: players.find((p) => p.id === me.id) ?? me,
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
    data: { flagged: verdict.flagged, who: tagLabelOf(players, verdict.runnerId), chaser: me.name, ...(verdict.flagged ? { farFromLast: true } : {}) },
  })
  const after = await ctx.store.players(game.id)
  if (after.filter((p) => p.role === 'runner').every(isOut)) await finish(ctx, fresh)
  const caught = players.find((p) => p.id === verdict.runnerId)
  // Wrong-catch backstop: armbands are reused, so a scan of a photo can "catch" a runner whose pocketed phone is
  // far away. Only a borderline catch (far from their last spot, but not implausibly so) tells the runner straight
  // away and lets them dispute it. The push goes after the catch is recorded and can never undo it (same as Luar Garisan).
  if (verdict.flagged && caught) {
    try {
      await pushTo(ctx, [caught], {
        type: 'notice',
        code: game.code,
        title: 'Kena tangkap!',
        body: `${me.name} caught you. Not you? Tap to tell a marshal.`,
        url: `/g/${game.code}?dispute=1`,
      })
    } catch {
      // The marshal alert and the Penjara screen's Tell a marshal still cover it.
    }
  }
  const label = caught?.tag_id ? `#${tag2(caught.tag_id)} ${caught.name}` : (caught?.name ?? '')
  return { ...verdict, label }
}

const jailbreak: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  if (me.disqualified_at) return { ok: false, reason: 'disqualified' }
  if (str(body.qr).trim() !== JAIL_QR) throw new ActionError(400, "That's not the Penjara code")
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
  await ctx.store.updatePlayers(verdict.freedIds.map((id) => ({ id, patch: { jailed: false, freed_once: true, freed_at: iso(ctx.now), out_warned_at: null } })))
  await ctx.store.addEvent({
    game_id: game.id,
    type: 'jailbreak',
    actor_id: me.id,
    target_id: null,
    data: { freed: verdict.freedIds.length },
  })
  return verdict
}

/**
 * Settle (jail design §4b, §4d): the jailed Dato Seri holder scans the Penjara code and picks up to 2 jailed
 * friends. Frees whoever is eligible exactly as a jailbreak does. The card is spent first, atomically, so a
 * double tap settles once, and given back if the freeing fails. Visible to everyone, without naming the card.
 */
const settle: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  if (me.disqualified_at) return { ok: false, reason: 'disqualified' }
  if (str(body.qr).trim() !== JAIL_QR) throw new ActionError(400, "That's not the Penjara code")
  const targetIds = body.targetIds ?? []
  if (!Array.isArray(targetIds) || !targetIds.every((t) => typeof t === 'string')) throw new ActionError(400, 'Pick who to free')
  await recordScanLocation(ctx, game, me, body)
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  if (fresh.paused_at) return { ok: false, reason: 'paused' }
  const dato = (await ctx.store.powerUps(game.id)).find(
    (u) => u.player_id === me.id && u.kind === 'dato' && u.used_at === null && !u.taken_at,
  )
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  const verdict = judgeSettle({
    phase: phaseAt(fresh, ctx.now).phase,
    holder: me,
    holdsDato: !!dato,
    players: await ctx.store.players(game.id),
    holderPos: latest(positions[me.id]),
    jail: game.arena.jail,
    targetIds,
    now: ctx.now,
  })
  if (!verdict.ok) return verdict
  if (!(await ctx.store.markUsed(dato!.id))) return { ok: false, reason: 'already-used' }
  try {
    await ctx.store.updatePlayers(verdict.freedIds.map((id) => ({ id, patch: { jailed: false, freed_once: true, freed_at: iso(ctx.now), out_warned_at: null } })))
  } catch (e) {
    await ctx.store.updatePowerUp(dato!.id, { used_at: null }) // give Dato Seri back
    throw e
  }
  await ctx.store.addEvent({ game_id: game.id, type: 'settled', actor_id: me.id, target_id: null, data: { freed: verdict.freedIds.length } })
  return verdict
}

const subscribe: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const sub = body.subscription as PushSubscriptionJSON | undefined
  if (!body.token) {
    // The organiser: their phone gets SOS and report alerts.
    await requireOrganiser(ctx, game, body)
    if (!sub || typeof sub.endpoint !== 'string') throw new ActionError(400, 'Invalid push subscription')
    await ctx.store.updateGame(game.id, { host_push: sub })
    return { ok: true }
  }
  const me = await requirePlayer(ctx, game, body)
  if (!sub || typeof sub.endpoint !== 'string') throw new ActionError(400, 'Invalid push subscription')
  await ctx.store.updatePlayers([{ id: me.id, patch: { push: sub } }])
  return { ok: true }
}

const createOrganiserInvite: Action = async (ctx, body) => {
  const organiser = await requireAnyOrganiser(ctx, body)
  let targetOrganiserId: string | null = null
  let name: string
  if (body.organiserId) {
    // A re-link invite: any organiser can send a peer a fresh sign-in link for their own account
    // (true peers, per the design — not restricted to whoever happens to be "the owner").
    const target = await ctx.store.organiserById(str(body.organiserId))
    if (!target || target.organisation_id !== organiser.organisation_id) throw new ActionError(404, 'Unknown organiser')
    targetOrganiserId = target.id
    name = target.name
  } else {
    name = str(body.name).trim()
    if (name.length < 1 || name.length > 40) throw new ActionError(400, 'Name must be 1–40 characters')
  }
  const inviteToken = newToken()
  await ctx.store.createOrganiserInvite({
    organisation_id: organiser.organisation_id,
    organiser_id: targetOrganiserId,
    name,
    token_hash: hashToken(inviteToken),
    created_at: iso(ctx.now),
    expires_at: iso(ctx.now + ORGANISER_INVITE_TTL_MS),
    redeemed_at: null,
  })
  return { inviteToken }
}

const redeemOrganiserInvite: Action = async (ctx, body) => {
  const inviteToken = str(body.inviteToken)
  if (!inviteToken) throw new ActionError(400, 'Missing invite token')
  const organiserToken = newToken()
  const result = await ctx.store.redeemOrganiserInvite(hashToken(inviteToken), ctx.now, hashToken(organiserToken))
  if (!result.ok) {
    if (result.reason === 'invalid') throw new ActionError(404, 'That invite link is not valid')
    if (result.reason === 'redeemed') throw new ActionError(410, 'That invite link has already been used')
    throw new ActionError(410, 'That invite link has expired')
  }
  const organiser = await ctx.store.organiserBySessionTokenHash(hashToken(organiserToken))
  return { organiserToken, organiserId: organiser!.id, name: organiser!.name }
}

const createMarshalInvite: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  await requireOrganiser(ctx, game, body)
  requireLobby(game, ctx.now)
  const inviteToken = newToken()
  await ctx.store.createMarshalInvite({
    game_id: game.id,
    token_hash: hashToken(inviteToken),
    created_at: iso(ctx.now),
    expires_at: iso(ctx.now + MARSHAL_INVITE_TTL_MS),
    redeemed_at: null,
  })
  return { inviteToken }
}

const redeemMarshalInvite: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  if (phaseAt(game, ctx.now).phase !== 'lobby') throw new ActionError(410, 'That invite link is no longer usable — the game already started')
  const inviteToken = str(body.inviteToken)
  if (!inviteToken) throw new ActionError(400, 'Missing invite token')
  const name = str(body.name).trim()
  if (name.length < 1 || name.length > 24) throw new ActionError(400, 'Name must be 1–24 characters')
  const result = await ctx.store.redeemMarshalInvite(hashToken(inviteToken), ctx.now, game.id)
  if (!result.ok) {
    if (result.reason === 'invalid') throw new ActionError(404, 'That invite link is not valid')
    if (result.reason === 'redeemed') throw new ActionError(410, 'That invite link has already been used')
    throw new ActionError(410, 'That invite link has expired')
  }
  const token = newToken()
  const p = await ctx.store.addPlayer({
    game_id: game.id,
    name,
    role: 'marshal',
    tag_id: null,
    accepted_at: iso(ctx.now),
    caught_at: null,
    caught_by: null,
    jailed: false,
    freed_once: false,
    freed_at: null,
    push: null,
    removed_at: null,
    outside: false,
    left_start: false,
    token_hash: hashToken(token),
  })
  await ctx.store.addEvent({ game_id: game.id, type: 'joined', actor_id: p.id, target_id: null, data: {} })
  return { token, playerId: p.id }
}

const sideOf = (p: Player): 'runner' | 'chaser' => (p.role === 'chaser' ? 'chaser' : 'runner')

/** The card at a given draw number of a side's shared deck. Games started before decks existed have no sets. */
async function deckOf(ctx: Ctx, game: Game, side: 'runner' | 'chaser'): Promise<(index: number) => PowerUpKind> {
  const stored = side === 'runner' ? game.runner_sets : game.chaser_sets
  const sets = stored ?? setsFor(side, (await ctx.store.players(game.id)).filter((p) => p.role === side).length)
  const deck = deckFor(game.settings.mode ?? 'core', side, sets)
  // Seeded with a secret (not the game id players can see), so nobody can work out the next card.
  return (index) => cardAt(`${game.deck_seed ?? game.id}:${side}`, deck, index)
}

/** Abang Grab shows this many cards (power-ups §6.3). Each round of the deck is a full reshuffle, so 3 are always there. */
const GRAB_OFFER = 3

const claim: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  if (me.disqualified_at) return { ok: false, reason: 'disqualified' }
  await recordScanLocation(ctx, game, me, body)
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  if (fresh.paused_at) return { ok: false, reason: 'paused' }
  const qr = str(body.qr)
  if (isDatoQr(qr)) {
    const code = datoCodeFromQr(qr)
    // Purple cards printed before Bomoh had his own QR carry KEJAR:DATO:<purple code>. Cards are printed once and
    // reused every game, so that scan is a Bomoh claim, exactly as if it were KEJAR:BOMOH:<code> (C1).
    if (isLegacyBomohCode(fresh as GameRow, code)) return claimBomoh(ctx, fresh as GameRow, me, code)
    return claimDato(ctx, fresh as GameRow, me, code)
  }
  if (isBomohQr(qr)) return claimBomoh(ctx, fresh as GameRow, me, bomohCodeFromQr(qr))
  const station = stationFromQr(str(body.qr))
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  const verdict = judgeClaim({
    phase: phaseAt(fresh, ctx.now).phase,
    me,
    station,
    arena: game.arena,
    myPos: latest(positions[me.id]),
    powerUps: await ctx.store.powerUps(game.id),
    pings: await ctx.store.pings(game.id),
    now: ctx.now,
  })
  if (!verdict.ok) return verdict
  // The top card of this side's shared deck (power-ups §5b). The draw number is taken atomically, so two
  // claims at the same moment never get the same card.
  const side = sideOf(me)
  const kindAt = await deckOf(ctx, fresh, side)
  const kind = kindAt(await ctx.store.drawCard(game.id, side))
  // Re-checked atomically by the store, so double-taps and simultaneous scans can't both win.
  const claimed = await ctx.store.claimStation(
    { game_id: game.id, player_id: me.id, kind, station: station! },
    STATION_LOCK_MS,
  )
  if (!claimed.ok) return claimed
  await ctx.store.addEvent({ game_id: game.id, type: 'powerup', actor_id: me.id, target_id: null, data: {} })
  return { ok: true, kind }
}

/**
 * One legendary's wrong-scan limit for one player (Review Focus 2): null once they've used up STASH_MISS_LIMIT
 * misses on it, otherwise the function that records the next one and passes its answer through. Each legendary
 * counts its own misses (I5), tagged `data.legendary`; an untagged miss predates Bomoh, so it is Dato Seri's.
 */
async function stashMisses(ctx: Ctx, game: GameRow, me: Player, legendary: LegendaryKind) {
  const missed = (await ctx.store.events(game.id)).filter(
    (e) => e.type === 'stash-miss' && e.actor_id === me.id && (e.data?.legendary ?? 'dato') === legendary,
  ).length
  if (missed >= STASH_MISS_LIMIT) return null
  // Only a wrong or unknown code, no stash, or too far counts (ruling R4): the other refusals reveal no location.
  return async <T extends { reason: string }>(answer: T): Promise<T> => {
    await ctx.store.addEvent({ game_id: game.id, type: 'stash-miss', actor_id: me.id, target_id: null, data: { legendary } })
    return answer
  }
}

/** A ★-prefixed code that is really this game's purple card: it matches the Bomoh stash's code and not the Dato one. */
function isLegacyBomohCode(game: GameRow, code: string | null): boolean {
  if (!code || game.settings.mode !== 'full') return false
  const matches = (secret: string | null | undefined) => !!secret && hashToken(secret) === hashToken(code)
  return matches(game.bomoh_stash?.code) && !matches(game.dato_stash?.code)
}

/**
 * Scanning Dato Seri's hidden stash (jail design §4b). A refusal changes nothing, so the stash stays claimable.
 * The store claims it atomically: two runners scanning at once get one card. No 'powerup' event, which would
 * name the finder: the feed only ever says `Something legendary was found.` (§4c). Claiming retires the card.
 *
 * The wrong-scan limit (Review Focus 2): a scan that doesn't claim is recorded as a `stash-miss`, and after
 * STASH_MISS_LIMIT of them every later stash scan by that player answers `no-stash`, unrecorded, even at the
 * right spot, so a photo of the card can't be walked round the zone. Nothing says they're locked out. A full
 * slot isn't a miss: the runner is at the stash and can come back once their slot is free.
 */
async function claimDato(ctx: Ctx, game: GameRow, me: Player, scanned: string | null) {
  const miss = await stashMisses(ctx, game, me, 'dato')
  if (!miss) return NO_STASH
  // Only the code this game was assigned (ruling R15, R2): the one on the card the organiser printed and hid. Any
  // other ★ card, bare, another game's or another card's, gets the same answer as no stash before anything else is
  // judged, so it can't tell anyone how near they are or whether a stash exists.
  const secret = game.settings.mode === 'full' ? (game.dato_stash?.code ?? null) : null
  if (!scanned || !secret || hashToken(scanned) !== hashToken(secret)) return miss(NO_STASH)
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  const verdict = judgeDatoClaim({
    phase: phaseAt(game, ctx.now).phase,
    me,
    stash: game.dato_stash,
    myPos: latest(positions[me.id]),
    powerUps: await ctx.store.powerUps(game.id),
    pings: await ctx.store.pings(game.id),
    now: ctx.now,
  })
  if (!verdict.ok) return verdict.reason === 'no-stash' || verdict.reason === 'too-far' ? miss(verdict) : verdict
  // Losing the race to another runner isn't a miss.
  if (!(await ctx.store.claimDato(game.id, me.id))) return NO_STASH
  // Found: the card is never put in play again until it's reprinted.
  if (game.dato_stash?.card) await ctx.store.setSecretCard(game.dato_stash.card.id, { state: 'retired', found_at: iso(ctx.now) })
  await ctx.store.addEvent({ game_id: game.id, type: 'legendary', actor_id: me.id, target_id: null, data: {} })
  return { ok: true, kind: 'dato' }
}

/**
 * Scanning Bomoh's hidden stash: a chaser within reach of the dropped purple card, first come first served.
 * Mirrors `claimDato` above, with Bomoh's own rules (chaser-only, no jail or hand-slot check — power-ups §5a,
 * `judgeBomohClaim`). The store claims it atomically: two chasers scanning at once get one card. No 'powerup'
 * event, which would name the finder: the feed only ever says `Something legendary was found.`. Claiming retires
 * the card. Unlike `claimDato`, no `powerups` row is read back or returned: Bomoh activates on claim, and
 * `store.claimBomoh` only reports whether the caller won.
 *
 * The wrong-scan limit (mirroring Review Focus 2): a scan that doesn't claim is recorded as a `stash-miss`, and
 * after STASH_MISS_LIMIT of them every later stash scan by that player answers `no-stash`, unrecorded, even at
 * the right spot.
 */
async function claimBomoh(ctx: Ctx, game: GameRow, me: Player, scanned: string | null) {
  const miss = await stashMisses(ctx, game, me, 'bomoh')
  if (!miss) return NO_STASH
  // Only the code this game was assigned (ruling R15, R2): the one on the card the organiser printed and hid. Any
  // other Bomoh card, bare, another game's or another card's, gets the same answer as no stash before anything else
  // is judged, so it can't tell anyone how near they are or whether a stash exists.
  const secret = game.settings.mode === 'full' ? (game.bomoh_stash?.code ?? null) : null
  if (!scanned || !secret || hashToken(scanned) !== hashToken(secret)) return miss(NO_STASH)
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  const verdict = judgeBomohClaim({
    phase: phaseAt(game, ctx.now).phase,
    me,
    stash: game.bomoh_stash,
    myPos: latest(positions[me.id]),
    now: ctx.now,
  })
  if (!verdict.ok) return verdict.reason === 'no-stash' || verdict.reason === 'too-far' ? miss(verdict) : verdict
  // Losing the race to another chaser isn't a miss.
  if (!(await ctx.store.claimBomoh(game.id, me.id, new Date(ctx.now)))) return NO_STASH
  // Found: the card is never put in play again until it's reprinted.
  if (game.bomoh_stash?.card) await ctx.store.setSecretCard(game.bomoh_stash.card.id, { state: 'retired', found_at: iso(ctx.now) })
  await ctx.store.addEvent({ game_id: game.id, type: 'legendary', actor_id: me.id, target_id: null, data: {} })
  return { ok: true, kind: 'bomoh' }
}

/**
 * The organiser hides the printed Dato Seri card and saves the spot (jail design §4b). Organiser only: marshals are
 * the helper, and never learn where it is. Full mode only. Dropping again before the start moves it; once the
 * game starts it stays put.
 */
const dropDatoSeri: Action = async (ctx, body) => {
  const loaded = await loadGame(ctx, body)
  const organiser = await requireOrganiser(ctx, loaded, body)
  if (loaded.settings.mode !== 'full') throw new ActionError(409, 'Dato Seri is in Full mode only')
  requireLobby(loaded, ctx.now)
  // An old lobby re-checks its card first, and one with none tries for one (rulings R3, R9).
  const { game } = await settleLobbyCard(ctx, loaded, organiser.organisation_id, 'dato')
  // No card (Dato Seri off, or none is free yet): there's nothing to drop.
  if (!game.dato_stash) throw new ActionError(409, NO_FREE_CARD_NOTICE)
  const at = coordsOf(body)
  if (!at) throw new ActionError(400, 'Invalid location')
  if (!inPlayArea(at, game.arena)) throw new ActionError(400, 'Drop it inside the play area')
  // Moving it keeps the code and the card, so the card already printed still works. A game made before codes gets one now.
  const stash: DatoStash = { ...game.dato_stash, code: game.dato_stash.code ?? newDatoCode(), lat: at.lat, lng: at.lng, claimedBy: null, claimedAt: null }
  await ctx.store.updateGame(game.id, { dato_stash: stash })
  return { ok: true }
}

/**
 * The organiser hides the printed Bomoh card and saves the spot, mirroring `dropDatoSeri` above. Organiser only:
 * marshals are the helper, and never learn where it is. Full mode only. Dropping again before the start moves it;
 * once the game starts it stays put.
 */
const dropBomoh: Action = async (ctx, body) => {
  const loaded = await loadGame(ctx, body)
  const organiser = await requireOrganiser(ctx, loaded, body)
  if (loaded.settings.mode !== 'full') throw new ActionError(409, 'Bomoh is in Full mode only')
  requireLobby(loaded, ctx.now)
  // An old lobby re-checks its card first, and one with none tries for one (rulings R3, R9).
  const { game } = await settleLobbyCard(ctx, loaded, organiser.organisation_id, 'bomoh')
  // No card (Bomoh off, or none is free yet): there's nothing to drop.
  if (!game.bomoh_stash) throw new ActionError(409, NO_FREE_BOMOH_CARD_NOTICE)
  const at = coordsOf(body)
  if (!at) throw new ActionError(400, 'Invalid location')
  if (!inPlayArea(at, game.arena)) throw new ActionError(400, 'Drop it inside the play area')
  // Moving it keeps the code and the card, so the card already printed still works. A game made before codes gets one now.
  const stash: BomohStash = { ...game.bomoh_stash, code: game.bomoh_stash.code ?? newDatoCode(), lat: at.lat, lng: at.lng, claimedBy: null, claimedAt: null }
  await ctx.store.updateGame(game.id, { bomoh_stash: stash })
  return { ok: true }
}

const usePowerup: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  if (me.disqualified_at) return { ok: false, reason: 'disqualified' }
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  if (fresh.paused_at) return { ok: false, reason: 'paused' }
  const { phase, endsAt } = phaseAt(fresh, ctx.now)
  const all = await ctx.store.powerUps(game.id)
  const u = all.find((x) => x.id === str(body.powerupId))
  if (!u || u.player_id !== me.id) return { ok: false, reason: 'not-yours' }
  // Taken by Toyol or Ah Long (e.g. a Grab with its offer open): the owner is told it was taken.
  if (u.taken_at) return { ok: false, reason: 'taken' }
  if (u.used_at) return { ok: false, reason: 'already-used' }
  if (phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  if (me.jailed) return { ok: false, reason: 'cannot-use' }
  // Dato Seri is only ever used through Settle, at Penjara (jail design §4b).
  if (u.kind === 'dato') return { ok: false, reason: 'settle-at-penjara' }
  // A Flare's reveal must land before the whistle.
  if (u.kind === 'flare' && (endsAt ?? 0) - ctx.now < ALERT_LEAD_MS) return { ok: false, reason: 'too-late' }

  // Mat Rempit: one at a time, team-wide, then a 3-minute wait (power-ups §5a). A refusal isn't spent.
  const pings = u.kind === 'flare' ? await ctx.store.pings(game.id) : []
  if (u.kind === 'flare') {
    const blocked = flareBlocked(pings, ctx.now)
    if (blocked) return { ok: false, ...blocked }
  }
  if (u.kind === 'grab') {
    // Abang Grab (power-ups §6.3): show the top 3 of this side's deck. Not marked used here: the Grab stays in
    // the slot with its offer until grabPick. The 3 draws are reserved in one atomic step, and a Grab that
    // already has them (re-opened screen, double-tap) gets the same 3 back without drawing again.
    const side = sideOf(me)
    const opened = await ctx.store.openGrab(u.id, side, GRAB_OFFER)
    if (!opened) return { ok: false, reason: 'already-used' }
    let offer = opened.offer
    if (!offer) {
      const kindAt = await deckOf(ctx, fresh, side)
      offer = Array.from({ length: GRAB_OFFER }, (_, k) => kindAt(opened.first + k))
      // Same draws, same cards: a racing second open writes the identical offer.
      await ctx.store.updatePowerUp(u.id, { offer })
    }
    return { ok: true, kind: 'grab', offer }
  }
  // markUsed is atomic: a double-tap uses the power-up once.
  if (!(await ctx.store.markUsed(u.id))) return { ok: false, reason: 'already-used' }
  if (u.kind === 'toyol' || u.kind === 'along') {
    // Spent first (so two taps can't both steal), taken second (atomic per card in the store, so two thieves never
    // take the same one); if nothing was there to take, the card goes back unspent (power-ups §6.2).
    let stolen
    try {
      stolen = await ctx.store.stealFrom(game.id, u.kind === 'toyol' ? 'chaser' : 'runner', ctx.rng)
    } catch (e) {
      await ctx.store.updatePowerUp(u.id, { used_at: null })
      throw e
    }
    if (!stolen) {
      await ctx.store.updatePowerUp(u.id, { used_at: null })
      return { ok: false, reason: 'nothing-to-steal' }
    }
    await ctx.store.addEvent({
      game_id: game.id,
      type: 'stolen',
      actor_id: me.id,
      target_id: stolen.stolenFrom,
      data: { kind: u.kind, takenKind: stolen.kind },
    })
    // Only that it worked: whose card it was and what it was stay secret, even from the thief (power-ups §6.2).
    return { ok: true, kind: u.kind }
  }
  if (u.kind === 'flare') {
    // The next surprise-ping number is a claim: if two Mat Rempits land at once, only one gets it.
    const seq = BONUS_SEQ_BASE + pings.filter((p) => p.seq >= BONUS_SEQ_BASE).length
    let added: boolean
    try {
      added = await ctx.store.addBonusPing(game.id, seq, iso(ctx.now), iso(ctx.now + ALERT_LEAD_MS))
    } catch (e) {
      await ctx.store.updatePowerUp(u.id, { used_at: null }) // give the Mat Rempit back
      throw e
    }
    if (!added) {
      await ctx.store.updatePowerUp(u.id, { used_at: null })
      return { ok: false, ...(flareBlocked(await ctx.store.pings(game.id), ctx.now) ?? { reason: 'flare-pending', readyInMs: 0 }) }
    }
  }
  await ctx.store.addEvent({ game_id: game.id, type: 'used', actor_id: me.id, target_id: null, data: { kind: u.kind } })
  return { ok: true, kind: u.kind }
}

/**
 * Abang Grab, step 2: keep one of the offered cards. `choice` is its index in the offer (0–2). The Grab is done
 * and the kept card takes its place in the slot, sealed (Toyol and Ah Long can't take it) and not switched on.
 */
const grabPick: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  if (me.disqualified_at) return { ok: false, reason: 'disqualified' }
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  if (fresh.paused_at) return { ok: false, reason: 'paused' }
  if (phaseAt(fresh, ctx.now).phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  if (me.jailed) return { ok: false, reason: 'cannot-use' }
  const choice = typeof body.choice === 'number' ? body.choice : NaN
  // Checked and written atomically by the store, so two picks at once deliver one card.
  const picked = await ctx.store.pickGrab(str(body.powerupId), me.id, choice)
  if (!picked.ok) return picked
  // The other two aren't put back: their draw numbers are spent, so they return at the next reshuffle
  // (our stand-in for "the bottom of the deck", power-ups §6.3).
  await ctx.store.addEvent({ game_id: game.id, type: 'powerup', actor_id: me.id, target_id: null, data: {} })
  return { ok: true, kind: picked.powerUp.kind, powerupId: picked.powerUp.id }
}

const sos: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  requireRunning(game, ctx.now)
  await recordScanLocation(ctx, game, me, body)
  // A panicked double-tap raises one alert, not several.
  const recent = (await ctx.store.events(game.id)).find(
    (e) => e.type === 'sos' && e.actor_id === me.id && ctx.now - Date.parse(e.at) < SOS_REPEAT_MS,
  )
  if (recent) return { ok: true, repeat: true, sosId: recent.id }
  const where = coordsOf(body)
  const data = { who: who(me), lat: where?.lat ?? null, lng: where?.lng ?? null }
  const e = await ctx.store.addEvent({ game_id: game.id, type: 'sos', actor_id: me.id, target_id: null, data })
  await ctx.store.addSafetyRecord({
    game_id: game.id,
    type: 'sos',
    player_id: me.id,
    target_id: null,
    lat: data.lat,
    lng: data.lng,
    data: { game_code: game.code, name: data.who },
  })
  return { ok: true, notified: await alertMarshals(ctx, game, `SOS from ${data.who}`), sosId: e.id }
}

/** "What's happening?" after an SOS: folds into the marshals' alert, no second push (motion design §6.0). */
const sosDetails: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  const reason = str(body.reason) as SosReason
  if (!Object.hasOwn(SOS_REASON_LABEL, reason)) throw new ActionError(400, 'Pick what is happening')
  const sosId = str(body.sosId)
  const events = await ctx.store.events(game.id)
  const mine = events.find((e) => e.id === sosId && e.type === 'sos' && e.actor_id === me.id)
  if (!mine || ctx.now - Date.parse(mine.at) > SOS_DETAILS_MS) return { ok: false, reason: 'not-yours' }
  let withPlayer: Player | undefined
  if ((reason === 'unsafe' || reason === 'dispute') && str(body.withId)) {
    withPlayer = (await ctx.store.players(game.id)).find((p) => p.id === str(body.withId) && p.id !== me.id)
    if (!withPlayer) throw new ActionError(400, 'Pick another player in this game')
  }
  const withName = withPlayer ? who(withPlayer) : null
  // A repeated tap of the same chip changes nothing: don't write it again.
  const latest = events.filter((e) => e.type === 'sos-details' && e.data.sosId === sosId).at(-1)
  if (latest && latest.data.reason === reason && (latest.target_id ?? null) === (withPlayer?.id ?? null)) return { ok: true }
  await ctx.store.addEvent({ game_id: game.id, type: 'sos-details', actor_id: me.id, target_id: withPlayer?.id ?? null, data: { sosId, reason, withName } })
  await ctx.store.addSafetyRecord({
    game_id: game.id,
    type: 'sos',
    player_id: me.id,
    target_id: withPlayer?.id ?? null,
    lat: null,
    lng: null,
    data: { game_code: game.code, follows: sosId, reason, with_name: withName },
  })
  return { ok: true }
}

const report: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  // Unlike other actions, a report stays valid after the game ends (Plan C3 post-game flow) — only the lobby refuses it.
  if (phaseAt(game, ctx.now).phase === 'lobby') throw new ActionError(409, 'The game is not running')
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

/** "How fun was it?" after the game, 1-5 plus an optional note (Plan C3). Marshal-only reading, in `views.ts`. */
const rate: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  // Post-game only (unlike `report`, which also works mid-game): `ratingsFor` in views.ts relies on this.
  if (phaseAt(game, ctx.now).phase !== 'ended') throw new ActionError(409, 'Rate the game once it has ended')
  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ActionError(400, 'Pick a rating from 1 to 5')
  const note = str(body.note).trim()
  if (note.length > NOTE_MAX) throw new ActionError(400, `Keep the note under ${NOTE_MAX} characters`)
  await ctx.store.addEvent({ game_id: game.id, type: 'rated', actor_id: me.id, target_id: null, data: { name: who(me), rating, note } })
  return { ok: true }
}

/** A marshal taps "I'm going" on an SOS; everyone sees who's responding on the alert. No uniqueness check — a second marshal can still respond. */
const respondToSos: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, game, body)
  const name = await marshalName(ctx, game, body, marshal)
  await ctx.store.addEvent({
    game_id: game.id,
    type: 'sos-responding',
    actor_id: marshal?.id ?? null,
    target_id: null,
    data: { sosId: str(body.eventId), name },
  })
  return { ok: true }
}

/** The event types whose closing outcome belongs in `safety_records` (its `type` check allows only these). */
const OUTCOME_RECORD_TYPES: readonly string[] = ['sos', 'report'] satisfies SafetyRecord['type'][]

/**
 * A marshal closes an alert. An SOS must carry an outcome (one of the takeover's chips), recorded on the event
 * and as a safety record; other alerts may close without one. The closer's name goes on the event either way.
 */
const handleAlert: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, game, body)
  const eventId = str(body.eventId)
  const outcome = body.outcome === undefined || body.outcome === null ? null : str(body.outcome)
  if (outcome !== null && !Object.hasOwn(SOS_OUTCOME_LABEL, outcome)) throw new ActionError(400, 'Pick what happened')
  const closing = (await ctx.store.events(game.id)).find((e) => e.id === eventId)
  if (closing?.type === 'sos' && outcome === null) throw new ActionError(400, 'Pick what happened before closing an SOS')
  const name = await marshalName(ctx, game, body, marshal)
  await ctx.store.addEvent({
    game_id: game.id,
    type: 'handled',
    actor_id: marshal?.id ?? null,
    target_id: null,
    data: { eventId, name, ...(outcome ? { outcome } : {}) },
  })
  if (outcome && closing && OUTCOME_RECORD_TYPES.includes(closing.type)) {
    await ctx.store.addSafetyRecord({
      game_id: game.id,
      type: closing.type as SafetyRecord['type'],
      player_id: marshal?.id ?? null,
      target_id: null,
      lat: null,
      lng: null,
      data: { game_code: game.code, event_id: eventId, outcome },
    })
  }
  return { ok: true }
}

/** A marshal frees an auto-jailed runner after a phone fault, without using their one escape (motion design §5b). */
const undoAutoJail: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, game, body)
  const eventId = str(body.eventId)
  const jailing = (await ctx.store.events(game.id)).find((e) => e.id === eventId && e.type === 'auto-jailed')
  const target = jailing && (await ctx.store.players(game.id)).find((p) => p.id === jailing.target_id)
  // Only while they're still in Penjara from this auto-jail: not a chaser's catch, not after a later release.
  const undoable =
    !!target && target.jailed && target.caught_by === null && (!target.freed_at || Date.parse(jailing.at) >= Date.parse(target.freed_at))
  // Atomic, so two marshals tapping at once (or a racing release) free the runner only once.
  if (!undoable || !(await ctx.store.releaseAutoJailed(target.id, iso(ctx.now)))) return { ok: false, reason: 'not-undoable' }
  await ctx.store.addEvent({ game_id: game.id, type: 'auto-jail-undone', actor_id: marshal?.id ?? null, target_id: target.id, data: { eventId } })
  const name = await marshalName(ctx, game, body, marshal)
  await ctx.store.addEvent({ game_id: game.id, type: 'handled', actor_id: marshal?.id ?? null, target_id: null, data: { eventId, name } })
  await ctx.store.addSafetyRecord({
    game_id: game.id,
    type: 'auto-jail-undone',
    player_id: marshal?.id ?? null,
    target_id: target.id,
    lat: null,
    lng: null,
    data: { game_code: game.code, by: marshal?.name ?? 'Organiser', target_name: target.name },
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
    if (runners.every(isOut)) await finish(ctx, game)
  }
  return { ok: true }
}

// ---- Saved arenas and park setup (Plan 4b) ----

const isLatLng = (v: unknown): v is LatLng =>
  typeof v === 'object' && v !== null && Number.isFinite((v as LatLng).lat) && Number.isFinite((v as LatLng).lng)
const isRing = (v: unknown): v is LatLng[] => Array.isArray(v) && v.length >= 3 && v.length <= 5_000 && v.every(isLatLng)

/** Checks the shape of a draft sent by the browser; the rules themselves are in arenaFromDraft. */
function asDraft(v: unknown): ArenaDraft {
  const d = (typeof v === 'object' && v ? v : {}) as Record<string, unknown>
  const circle = d.circle as { center?: unknown; radiusM?: unknown } | null | undefined
  const ok =
    typeof d.name === 'string' &&
    (d.source === 'osm' || d.source === 'circle') &&
    (d.osmRef === null || typeof d.osmRef === 'string') &&
    (d.outline === null || isRing(d.outline)) &&
    (circle === null || (typeof circle === 'object' && isLatLng(circle.center) && typeof circle.radiusM === 'number')) &&
    Array.isArray(d.water) && d.water.every(isRing) &&
    Array.isArray(d.toilets) && d.toilets.every(isLatLng) &&
    typeof d.waterChecked === 'boolean' &&
    (d.jail === null || isLatLng(d.jail)) &&
    (d.start === null || isLatLng(d.start)) &&
    Array.isArray(d.stations) && d.stations.every(isLatLng)
  if (!ok) throw new ActionError(400, 'Invalid play area')
  return d as unknown as ArenaDraft
}

function buildArena(draft: ArenaDraft, id: string): Arena {
  try {
    return arenaFromDraft(draft, id)
  } catch (e) {
    throw new ActionError(400, e instanceof Error ? e.message : String(e))
  }
}

async function requireArena(ctx: Ctx, organiser: OrganiserRow, id: unknown): Promise<SavedArenaRow> {
  const row = await ctx.store.arenaById(str(id))
  if (!row || row.organisation_id !== organiser.organisation_id) throw new ActionError(404, 'Arena not found')
  return row
}

function osmDeps(ctx: Ctx) {
  return {
    fetchJson: ctx.fetchJson ?? (async () => Promise.reject(new Error('OpenStreetMap lookups are not available'))),
    cache: {
      get: (key: string) => ctx.store.osmCacheGet(key, OSM_CACHE_MS),
      put: (key: string, body: unknown) => ctx.store.osmCachePut(key, body),
    },
  }
}

const areaHaOf = (a: Arena) => ringAreaHa(a.boundary) - (a.holes ?? []).reduce((sum, h) => sum + ringAreaHa(h), 0)

const searchParks: Action = async (ctx, body) => {
  await requireAnyOrganiser(ctx, body)
  const query = str(body.query).trim()
  if (query.length < 3 || query.length > 80) throw new ActionError(400, 'Type at least 3 letters')
  try {
    return { results: await lookupParks(query, osmDeps(ctx)) }
  } catch {
    throw new ActionError(502, 'Park search is unavailable right now — try again in a minute')
  }
}

const parkFeatures: Action = async (ctx, body) => {
  await requireAnyOrganiser(ctx, body)
  if (!isRing(body.outline)) throw new ActionError(400, 'Invalid park outline')
  return lookupParkFeatures(body.outline, osmDeps(ctx))
}

const saveArena: Action = async (ctx, body) => {
  const organiser = await requireAnyOrganiser(ctx, body)
  const draft = asDraft(body.draft)
  const existing = body.arenaId !== undefined ? await requireArena(ctx, organiser, body.arenaId) : null
  const arena = buildArena(draft, existing?.id ?? 'saved')
  const fields = { name: arena.name, draft, arena, water_checked: draft.waterChecked }
  if (existing) {
    await ctx.store.updateArena(existing.id, fields)
    return { arenaId: existing.id }
  }
  const row = await ctx.store.addArena({ organisation_id: organiser.organisation_id, ...fields })
  return { arenaId: row.id }
}

const listArenas: Action = async (ctx, body) => {
  const organiser = await requireAnyOrganiser(ctx, body)
  const rows = await ctx.store.arenasFor(organiser.organisation_id)
  return {
    arenas: rows.map((r) => ({
      id: r.id,
      name: r.name,
      areaHa: areaHaOf(r.arena),
      waterChecked: r.water_checked,
      arena: r.arena,
      /** What the organiser chose, so the park can be edited. */
      draft: r.draft,
      problems: pointProblems(r.arena),
    })),
  }
}

const deleteArena: Action = async (ctx, body) => {
  const organiser = await requireAnyOrganiser(ctx, body)
  const row = await requireArena(ctx, organiser, body.arenaId)
  await ctx.store.deleteArena(row.id)
  return { ok: true }
}

/** Looks for lakes again on a park saved while Overpass was down; says which points now need moving. */
const recheckWater: Action = async (ctx, body) => {
  const organiser = await requireAnyOrganiser(ctx, body)
  const row = await requireArena(ctx, organiser, body.arenaId)
  if (row.draft.source !== 'osm' || !row.draft.outline) {
    if (!row.water_checked) await ctx.store.updateArena(row.id, { water_checked: true })
    return { waterChecked: true, problems: pointProblems(row.arena) }
  }
  const found = await lookupParkFeatures(row.draft.outline, osmDeps(ctx))
  if (!found.waterChecked) return { waterChecked: false, problems: pointProblems(row.arena) }
  const draft: ArenaDraft = { ...row.draft, water: found.water, toilets: found.toilets, waterChecked: true }
  // Rebuild the area without rejecting misplaced points: the organiser moves them afterwards.
  const area = buildPlayArea({ outline: draft.outline, water: draft.water, circle: draft.circle })
  const shape = { boundary: area.boundary, holes: area.holes }
  const arena: Arena = { ...row.arena, ...shape, toilets: draft.toilets.filter((t) => inPlayArea(t, shape)) }
  await ctx.store.updateArena(row.id, { draft, arena, water_checked: true })
  return { waterChecked: true, problems: pointProblems(arena) }
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
  // Luar Garisan froze with the pause: a warning given before it must not carry over into the resumed game.
  const warned = (await ctx.store.players(game.id)).filter((p) => p.out_warned_at && !p.disqualified_at)
  if (warned.length > 0) await ctx.store.updatePlayers(warned.map((p) => ({ id: p.id, patch: { out_warned_at: null } })))
  await ctx.store.addEvent({ game_id: game.id, type: 'resumed', actor_id: marshal?.id ?? null, target_id: null, data: {} })
  return { ok: true }
}

/**
 * The organiser ticks an item off the packing list, or marks a card as taped up. Organiser or marshal, lobby only.
 * The yellow card and its place are the organiser's alone. A tick stores the item's label at that moment, so it
 * un-ticks itself if the label changes later. Each write sets or removes just its own key, atomically in the
 * store, so two phones ticking at once never drop each other's ticks.
 */
const setKit: Action = async (ctx, body) => {
  const loaded = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, loaded, body)
  requireLobby(loaded, ctx.now)
  const organiser = marshal === null
  const tick = body.tick as { id?: unknown; on?: unknown } | undefined
  const placed = body.placed as { id?: unknown; on?: unknown } | undefined
  if (!tick && !placed) throw new ActionError(400, 'Nothing to save')
  if (!organiser && ((tick && SECRET_PACK_IDS.includes(str(tick.id))) || (placed && SECRET_PLACE_IDS.includes(str(placed.id))))) {
    throw new ActionError(403, 'Organiser only')
  }
  const game: Game = loaded
  const letters = secretLettersFor(game)
  // Everything is checked before anything is written.
  const item = tick ? packItems(game, letters).find((x) => x.id === tick.id) : undefined
  const place = placed ? placeItems(game, organiser, letters).find((x) => x.id === placed.id) : undefined
  if (tick && typeof tick.on !== 'boolean') throw new ActionError(400, 'Tick on or off')
  if (tick && !item) throw new ActionError(400, 'Unknown item')
  if (placed && typeof placed.on !== 'boolean') throw new ActionError(400, 'Place on or off')
  if (placed && !place) throw new ActionError(400, 'Unknown place')
  if (tick && item) await ctx.store.setKitKey(game.id, 'ticks', item.id, tick.on ? item.label : null)
  if (placed && place) await ctx.store.setKitKey(game.id, 'placed', place.id, placed.on ? true : null)
  return { ok: true }
}

/**
 * The organiser switches between Core and Full while still in the lobby; never after the start (rules doc §1).
 * Core releases the game's cards, both legendaries' (ruling R8): no stash, and the walk's secret step is no longer
 * placed. Full assigns each fresh, not yet dropped; with none free, that legendary stays wanted and the answer
 * says so (R9).
 */
const setMode: Action = async (ctx, body) => {
  const loaded = await loadGame(ctx, body)
  const organiser = await requireOrganiser(ctx, loaded, body)
  requireLobby(loaded, ctx.now)
  const settings = settingsFrom({ ...loaded.settings, mode: body.mode })
  await ctx.store.updateGame(loaded.id, { settings })
  if (settings.mode !== 'full') {
    await releaseCard(ctx, loaded, 'dato')
    await releaseCard(ctx, loaded, 'bomoh')
    return { ok: true }
  }
  const dato = await settleLobbyCard(ctx, { ...loaded, settings }, organiser.organisation_id, 'dato')
  const bomoh = await settleLobbyCard(ctx, dato.game, organiser.organisation_id, 'bomoh')
  const notices = [dato.notice, bomoh.notice].filter((n): n is string => n !== null)
  return notices.length ? { ok: true, notice: notices.join(' ') } : { ok: true }
}

export const actions = {
  create,
  setKit,
  setMode,
  join,
  setRoles,
  start,
  linkTag,
  state,
  location,
  catch: catchAction,
  jailbreak,
  settle,
  subscribe,
  claim,
  usePowerup,
  grabPick,
  dropDatoSeri,
  dropBomoh,
  listSecretCards,
  retireSecretCard,
  reprintSecretCard,
  confirmSecretCardPrinted,
  secretCardCode,
  pause,
  resume,
  sos,
  sosDetails,
  report,
  rate,
  handleAlert,
  respondToSos,
  undoAutoJail,
  removePlayer,
  searchParks,
  parkFeatures,
  saveArena,
  listArenas,
  deleteArena,
  recheckWater,
  createOrganiserInvite,
  redeemOrganiserInvite,
  createMarshalInvite,
  redeemMarshalInvite,
} satisfies Record<string, Action>

export type ActionName = keyof typeof actions
