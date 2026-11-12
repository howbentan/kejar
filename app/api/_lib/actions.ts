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
import { autoJailDue, checkinsSince, countedCheckIn, countRestartAt, fairlyWarned } from '../../shared/checkins.js'
import { cardAt, deckFor, setsFor } from '../../shared/deck.js'
import { arenaFromDraft, pointProblems, type ArenaDraft } from '../../shared/arenaDraft.js'
import { arenaAroundPoint } from '../../shared/arenas.js'
import { isOut, undoableArrestId, undoableCatchId } from '../../shared/players.js'
import { ARREST_FIX_FRESH_MS, ARREST_OPEN_MS, arrestEndsAt, insideArrest, releaseVerdict, usableFix } from '../../shared/arrest.js'
import { atJail, judgeCatch, judgeJailbreak, judgeSettle } from '../../shared/catch.js'
import { ALERT_LEAD_MS, BONUS_SEQ_BASE, chaseStartOf, dueWork, FINAL_WHISTLE_MS, phaseAt, pingTimes } from '../../shared/clock.js'
import { bomohCodeFromQr, datoCodeFromQr, hijauCodeFromQr, isBomohQr, isDatoQr, isHijauQr, isRingQr, ringCodeFromQr, JAIL_QR, MAX_PLAYERS_PER_GAME, newGameCode, stationFromQr, tagIdFromQr } from '../../shared/ids.js'
import { activeShield, COMBO_EXCLUDED, comboReady, flareBlocked, judgeBomohClaim, judgeClaim, judgeDatoClaim, judgeHijauClaim, judgeRingClaim, frozenForMs, FREEZE_MS, runningEffect, STATION_LOCK_MS, TOLL_FRESH_MS } from '../../shared/powerups.js'
import { fiveLeftDue, pickReel, reelPulledThisStay, RESCUE_HOLD_MS, rescueVerdict } from '../../shared/penjara.js'
import { computeResults } from '../../shared/results.js'
import { packItems, placeItems, SECRET_PACK_IDS, SECRET_PLACE_IDS, type SecretLetters } from '../../shared/kit.js'
import { fallbackFor, LEGENDARY_KINDS, pickLegendaries, sidesOf, type SideSwitch } from '../../shared/legendaries.js'
import { validateTeams } from '../../shared/teams.js'
import { DEFAULT_SETTINGS, type Arena, type Arrest, type BomohStash, type DatoStash, type Game, type LatLng, type LegendaryKind, type Player, type Position, type PowerUp, type PowerUpKind, type Role, type SecretCard, type Settings } from '../../shared/types.js'
import { latestAtOrBefore, snapshotWindow, viewFor, type SnapshotInput } from '../../shared/views.js'
import { distanceM } from '../../shared/geo.js'
import { buildPlayArea, distanceOutsidePlayArea, inPlayArea, ringAreaHa } from '../../shared/playArea.js'
import { MARSHAL_INVITE_TTL_MS, ORGANISER_INVITE_TTL_MS, PHONE_MOVE_TTL_MS } from '../../shared/invites.js'
import { OSM_CACHE_MS, nearbyParks as lookupNearby, parkFeatures as lookupParkFeatures, searchParks as lookupParks, type FetchJson } from './osm.js'
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

/** The card letters of the secret sets assigned to this game, one per legendary that holds a card. */
function secretLettersFor(game: Game): SecretLetters {
  const letters: SecretLetters = {}
  for (const kind of LEGENDARY_KINDS) {
    const letter = stashOf(game, kind)?.card?.letter
    if (letter) letters[kind] = letter
  }
  return letters
}

// ---- Secret card sets: each organisation's reusable A-C yellow, orange, purple and green cards ----

/** What `create` and `setMode` say when every yellow card is retired, waiting to be printed or in another game. */
export const NO_FREE_CARD_NOTICE = 'Reprint a yellow card to use Dato Seri.'
/** The same, for Bomoh's purple cards. */
export const NO_FREE_BOMOH_CARD_NOTICE = 'Reprint a purple card to use Bomoh.'
/** The same, for Super Ring's cheese-orange cards. */
export const NO_FREE_RING_CARD_NOTICE = 'Reprint an orange card to use Super Ring.'
/** The same, for Mak Kau Hijau's deep-green cards. */
export const NO_FREE_HIJAU_CARD_NOTICE = 'Reprint a green card to use Mak Kau Hijau.'
const NO_FREE_NOTICE: Record<LegendaryKind, string> = {
  dato: NO_FREE_CARD_NOTICE,
  ring: NO_FREE_RING_CARD_NOTICE,
  bomoh: NO_FREE_BOMOH_CARD_NOTICE,
  hijau: NO_FREE_HIJAU_CARD_NOTICE,
}
/** Stash scans that don't claim before a player's later stash scans are all ignored (Review Focus 2). */
export const STASH_MISS_LIMIT = 3
const NO_STASH = { ok: false, reason: 'no-stash' } as const

/** A lobby holds its card for this long after it was made; then it must re-check it before use (ruling R3). */
export const LOBBY_HOLD_MS = 24 * 60 * 60_000

/** A game's personal data is wiped this long after it ends (fair-play §1.8). */
export const WIPE_AFTER_MS = 30 * 24 * 60 * 60_000
/** How many expired games one request sweeps, so the wipe stays cheap. */
/**
 * A game that never recorded an end (ended_at is written lazily from requests) is wiped this long after it was made. A lobby
 * holds its card for 24 h and a game runs a couple of hours, so any game this old is certainly over.
 */
export const WIPE_UNENDED_AFTER_MS = 32 * 24 * 60 * 60_000
const WIPE_BATCH = 3

/** Wipes a few expired games. Best effort: it runs on requests that already happen, so an error here is swallowed. */
async function wipeExpired(ctx: Ctx): Promise<void> {
  try {
    const ids = await ctx.store.gamesToWipe(iso(ctx.now - WIPE_AFTER_MS), iso(ctx.now - WIPE_UNENDED_AFTER_MS), WIPE_BATCH)
    for (const id of ids) {
      try {
        await ctx.store.wipeGame(id)
      } catch {
        // One bad game doesn't stop the rest.
      }
    }
  } catch {
    // Never fails the request.
  }
}

/** An unstarted game made more than LOBBY_HOLD_MS ago. A row with no `created_at` (older test data) never expires. */
function expiredLobby(g: Game, now: number): boolean {
  return !g.started_at && !!g.created_at && now - Date.parse(g.created_at) >= LOBBY_HOLD_MS
}

/** The stash a game holds for one legendary, by its own field (`dato_stash` or `bomoh_stash`). */
function stashOf(g: Game, legendary: LegendaryKind): DatoStash | BomohStash | null | undefined {
  if (legendary === 'ring') return g.ring_stash
  if (legendary === 'hijau') return g.hijau_stash
  return legendary === 'dato' ? g.dato_stash : g.bomoh_stash
}

/** Writes (or clears, with `null`) a legendary's stash onto a game, into its own field. */
function writeStash(ctx: Ctx, gameId: string, legendary: LegendaryKind, stash: DatoStash | BomohStash | null): Promise<void> {
  const field = { dato: 'dato_stash', bomoh: 'bomoh_stash', ring: 'ring_stash', hijau: 'hijau_stash' }[legendary] as const
  return ctx.store.updateGame(gameId, { [field]: stash })
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
 * A free card for the picked legendary, or else for the other one of its side (new power-ups design §6.1: the app
 * picks which legendary, so it can switch to the one that has a card). Null with neither free.
 */
async function cardOrFallback(
  ctx: Ctx,
  organisationId: string,
  legendary: LegendaryKind,
  exceptGameId?: string,
): Promise<{ kind: LegendaryKind; card: SecretCard } | null> {
  const card = await freeCard(ctx, organisationId, legendary, exceptGameId)
  if (card) return { kind: legendary, card }
  const sibling = fallbackFor(legendary)
  const spare = await freeCard(ctx, organisationId, sibling, exceptGameId)
  return spare ? { kind: sibling, card: spare } : null
}

/** A game's legendaries with the picked one switched to its fallback. */
const switchedTo = (l: Settings['legendaries'], from: LegendaryKind, to: LegendaryKind): Settings['legendaries'] => ({ ...l, [from]: 'off', [to]: 'stash' })

/**
 * Gives a lobby with no card a free card of that legendary, not yet dropped (it has to be printed and hidden). With
 * none free but one free for the other legendary of its side, the setting switches to that one and it gets that card.
 * With neither free the lobby keeps wanting the picked one and tries again later (ruling R9); returns the notice
 * while it has none.
 */
async function assignFreeCard(ctx: Ctx, game: GameRow, organisationId: string, legendary: LegendaryKind): Promise<string | null> {
  const sibling = fallbackFor(legendary)
  const got = await cardOrFallback(ctx, organisationId, legendary, game.id)
  // A sibling that somehow already holds a card is never given a second one.
  if (!got || (got.kind === sibling && stashOf(game, sibling))) return NO_FREE_NOTICE[legendary]
  if (got.kind === sibling) {
    const settings = { ...game.settings, legendaries: switchedTo({ ...DEFAULT_SETTINGS.legendaries, ...game.settings.legendaries }, legendary, sibling) }
    await ctx.store.updateGame(game.id, { settings })
  }
  await writeStash(ctx, game.id, got.kind, stashOn(got.card))
  return null
}

/** A lobby gives up its card (retired, or no longer its own) and takes a free one, or waits for one (ruling R9). */
async function reassignCard(ctx: Ctx, game: GameRow, organisationId: string, legendary: LegendaryKind): Promise<string | null> {
  await releaseCard(ctx, game, legendary)
  return assignFreeCard(ctx, game, organisationId, legendary)
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
  if (wantsCard(fresh, legendary) && !(await assignFreeCard(ctx, fresh, organisationId, legendary))) {
    fresh = (await ctx.store.gameByCode(game.code)) ?? fresh
  }
  return { game: fresh, notice: wantsCard(fresh, legendary) ? NO_FREE_NOTICE[legendary] : null }
}

/** `settleLobbyCard` for every legendary in turn, each on the game as the one before left it; the notices in order. */
async function settleAllLobbyCards(ctx: Ctx, game: GameRow, organisationId: string): Promise<{ game: GameRow; notices: string[] }> {
  let fresh = game
  const notices: string[] = []
  for (const kind of LEGENDARY_KINDS) {
    const settled = await settleLobbyCard(ctx, fresh, organisationId, kind)
    fresh = settled.game
    if (settled.notice) notices.push(settled.notice)
  }
  return { game: fresh, notices }
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
  if (!(LEGENDARY_KINDS as readonly string[]).includes(legendary) || !['A', 'B', 'C'].includes(letter)) throw new ActionError(400, 'Unknown card')
  const card = (await ctx.store.secretCards(organiser.organisation_id)).find((c) => c.legendary === legendary && c.letter === letter)
  if (!card) throw new ActionError(404, 'Unknown card')
  return { card, organisationId: organiser.organisation_id }
}

/** The organiser's card set, never with codes: which are ready, retired or printing, when found, and which are in a game. */
const listSecretCards: Action = async (ctx, body) => {
  const organiser = await requireAnyOrganiser(ctx, body)
  const busy = new Map<string, GameRow>()
  for (const kind of LEGENDARY_KINDS) for (const [id, g] of await cardHolders(ctx, organiser.organisation_id, kind)) busy.set(id, g)
  // Yellow, orange, purple, green: each side's pair together.
  const order = (c: SecretCard) => `${LEGENDARY_KINDS.indexOf(c.legendary)}${c.letter}`
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

/** The organiser taps Brief the players: how to play opens on every phone. Lobby only; the first time stays (idempotent). */
const startBriefing: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  await requireOrganiser(ctx, game, body)
  requireLobby(game, ctx.now)
  await ctx.store.setBriefedAt(game.id, iso(ctx.now))
  return { ok: true }
}

/** A runner or chaser's phone opened the story, or tapped I'm ready. Any phase (it can be reopened mid-game); set once. */
async function markBriefing(ctx: Ctx, body: Body, field: 'brief_opened_at' | 'brief_ready_at') {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  if (me.role === 'marshal') throw new ActionError(403, 'Marshals have no story')
  await ctx.store.markBrief(me.id, field, iso(ctx.now))
  return { ok: true }
}
const briefOpened: Action = (ctx, body) => markBriefing(ctx, body, 'brief_opened_at')
const briefReady: Action = (ctx, body) => markBriefing(ctx, body, 'brief_ready_at')

function requireLobby(game: Game, now: number) {
  if (phaseAt(game, now).phase !== 'lobby') throw new ActionError(409, 'Game already started')
}

const LEGENDARY_ERROR = 'Legendary cards must be off or on'

/**
 * The legendaries a request asks for. With `pick` (create, and a switch to Full) the organiser's sides decide and the
 * app picks one legendary per side (new power-ups design §6.1): `legendarySides` from HostNew, or an older request's
 * per-legendary `legendaries` read as sides. Without it (a game's own stored settings) the stored pick is kept.
 */
function legendariesFrom(input: object, pick?: () => number): Settings['legendaries'] {
  const { legendaries: givenRaw, legendarySides } = input as { legendaries?: unknown; legendarySides?: unknown }
  const given = givenRaw ?? {}
  if (typeof given !== 'object' || given === null || Array.isArray(given)) throw new ActionError(400, LEGENDARY_ERROR)
  const merged = { ...DEFAULT_SETTINGS.legendaries, ...given } as Record<string, unknown>
  for (const kind of LEGENDARY_KINDS) {
    if (merged[kind] !== 'off' && merged[kind] !== 'stash') throw new ActionError(400, LEGENDARY_ERROR)
  }
  // Only the four known keys are stored, so nothing else a client sends ends up in the game's settings.
  const stored = Object.fromEntries(LEGENDARY_KINDS.map((k) => [k, merged[k]])) as Settings['legendaries']
  if (!pick) return stored
  let sides: SideSwitch
  if (legendarySides !== undefined) {
    const s = legendarySides as Partial<SideSwitch> | null
    const ok = (v: unknown) => v === 'off' || v === 'on'
    if (typeof s !== 'object' || s === null || !ok(s.runner) || !ok(s.chaser)) throw new ActionError(400, LEGENDARY_ERROR)
    sides = { runner: s.runner!, chaser: s.chaser! }
  } else {
    sides = sidesOf(stored)
  }
  return pickLegendaries(sides, pick)
}

function settingsFrom(input: unknown, pick?: () => number): Settings {
  const given = typeof input === 'object' && input ? input : {}
  // The legendaries first: create's pick is the request's first random draw.
  const legendaries = legendariesFrom(given, pick)
  const { legendarySides: _sides, ...rest } = given as { legendarySides?: unknown }
  const s = { ...DEFAULT_SETTINGS, ...rest } as Settings
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
  s.legendaries = legendaries
  // The planned start only survives as a real time; anything else a client sends is dropped.
  s.startsAt = typeof s.startsAt === 'string' && Number.isFinite(Date.parse(s.startsAt)) ? s.startsAt : null
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
  if (game.rescue) await settleRescue(ctx, game, phase)

  if ((phase === 'chasing' || phase === 'ended') && (await store.claimPing(game.id, 0, 'revealed'))) {
    await store.addEvent({ game_id: game.id, type: 'chase', actor_id: null, target_id: null, data: {} })
  }

  // '5 minutes left!' goes out once per game: the claim decides who posts it (rules §2.7).
  if (fiveLeftDue(game, now) && (await store.claimFiveWarning(game.id, iso(now)))) {
    await store.addEvent({ game_id: game.id, type: 'five-left', actor_id: null, target_id: null, data: {} })
    const everyone = await store.players(game.id)
    try {
      await pushTo(ctx, everyone, { type: 'notice', code: game.code, title: 'kejar.', body: '5 minutes left!' })
    } catch {
      // The feed line and the lime clock still carry it.
    }
  }

  let pingRows = await store.pings(game.id)
  const work = dueWork(game, pingRows, now)
  let whistleNow = false
  // Super Ring's house arrests are judged lazily, on any poll (there's no server tick); never while paused.
  if (phase === 'chasing' && !game.paused_at && !game.ended_at && (await settleArrests(ctx, game))) whistleNow = true
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
    // A runner under house arrest is left out entirely: hidden from chasers, so not in the seen/missed counts
    // either (comparing counts with dots would give them away), and judged by the circle, not check-ins.
    const free = (await store.players(game.id)).filter((p) => p.role === 'runner' && !isOut(p) && !p.arrest)
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
    // The count starts fresh at each runner's own last release (checkins design §4.4), from Penjara or from house
    // arrest (one events read per claimed reveal).
    const events = (await store.events(game.id)).filter((e) => e.type === 'arrest-ended')
    const sinceFor = (p: Player) => checkinsSince(chaseStartOf(game, now)!, countRestartAt(p, events))
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
        // Two missed scheduled check-ins in a row: sent to Penjara like a catch, with no chaser (or house arrest,
        // with Super Ring; its `arrested` event keeps the check-ins in case they never open Kejar).
        if (autoJailDue(pings, since)) {
          const checkins = judged
            .filter((t) => t.alertAt >= since)
            .map((t) => ({ revealAt: t.revealAt, ok: countedCheckIn(t.alertAt, t.revealAt, t.lastAt, since) }))
          if ((await jailOrArrest(ctx, game, p, null, 'auto-jail', { seq, checkins })) === 'jailed') {
            await store.addEvent({ game_id: game.id, type: 'auto-jailed', actor_id: null, target_id: p.id, data: { who: who(p), seq, checkins } })
          }
        }
      }
      // Auto-jailing the last free runner blows the final whistle, the same as a catch.
      if (await allOutCheck(ctx, game, 'auto-jail')) whistleNow = true
    }
  }

  // A whistle just blown here (or by a concurrent call) isn't on `game` yet: read it back before judging the end.
  const g = whistleNow && !game.final_whistle_at ? ((await store.gameByCode(game.code)) ?? game) : game
  if (g.final_whistle_at && !g.ended_at) await settleWhistle(ctx, g)
  else if (work.end) await finish(ctx, g)
}

/**
 * Settles a live rescue (rules §9a). Once the game has ended (the clock ran out) it is cleared and frees nobody;
 * while paused it waits. Otherwise the rescuer's fixes during the hold decide it: `fix` is one just sent (the
 * `location` heartbeat judges each fix as it lands), else their latest stored fix within the hold. `end_rescue`
 * decides who settles it, so a success frees once and a failure posts once.
 */
async function settleRescue(ctx: Ctx, game: Game, phase = phaseAt(game, ctx.now).phase, fix?: Position): Promise<void> {
  const { store, now } = ctx
  const r = game.rescue
  if (!r) return
  if (phase === 'ended' || game.ended_at) {
    await store.endRescue(game.id, r.startedAt)
    return
  }
  if (game.paused_at) return
  const startedAt = Date.parse(r.startedAt)
  const players = await store.players(game.id)
  const rescuer = players.find((p) => p.id === r.by)
  let fixes: Position[] = fix ? [fix] : []
  if (!fix && rescuer) {
    fixes = (await store.latestPositions(game.id, [iso(Math.min(now, startedAt + RESCUE_HOLD_MS))]))[r.by] ?? []
  }
  // A removed rescuer has left the game: the same as being caught.
  const verdict = rescuer ? rescueVerdict({ rescue: { by: r.by, startedAt }, rescuer, fixes, jail: game.arena.jail, now, pauses: game.pauses, pausedAt: game.paused_at }) : 'failed'
  if (verdict === 'holding' || !(await store.endRescue(game.id, r.startedAt))) return
  if (verdict === 'failed') {
    await store.addEvent({ game_id: game.id, type: 'rescue-failed', actor_id: r.by, target_id: null, data: {} })
    return
  }
  // Frees exactly as the scan used to: everyone in Penjara who hasn't used their one escape.
  const freedIds = players.filter((p) => p.role === 'runner' && p.jailed && !p.freed_once).map((p) => p.id)
  if (freedIds.length === 0) return
  await store.updatePlayers(freedIds.map((id) => ({ id, patch: { jailed: false, freed_once: true, freed_at: iso(now), out_warned_at: null } })))
  await store.addEvent({ game_id: game.id, type: 'jailbreak', actor_id: r.by, target_id: null, data: { freed: freedIds.length } })
}

/** What put the last free Dikejar out: it picks the feed line (views.ts). */
type WhistleCause = 'catch' | 'auto-jail' | 'removed' | 'luar-garisan'

/**
 * Everyone is out (fair-play §1.4): instead of ending at once, the final whistle starts, and the end is held for
 * FINAL_WHISTLE_MS so a marshal can undo a wrong last catch. The first caller posts the feed line. True when every
 * runner is out (a whistle is pending, here or already).
 */
async function allOutCheck(ctx: Ctx, game: Game, cause: WhistleCause = 'catch'): Promise<boolean> {
  const runners = (await ctx.store.players(game.id)).filter((p) => p.role === 'runner')
  if (runners.length === 0 || !runners.every(isOut)) return false
  if (await ctx.store.claimFinalWhistle(game.id, iso(ctx.now))) {
    await ctx.store.addEvent({ game_id: game.id, type: 'final-whistle', actor_id: null, target_id: null, data: { cause } })
  }
  return true
}

/**
 * A pending final whistle: someone free again calls it off (and a chase whose time ran out during the hold then
 * ends on time, as a Dikejar win); otherwise the game ends once the hold is over. Never while paused.
 */
async function settleWhistle(ctx: Ctx, game: Game) {
  const runners = (await ctx.store.players(game.id)).filter((p) => p.role === 'runner')
  if (runners.length > 0 && runners.every(isOut)) {
    if (!game.paused_at && ctx.now >= Date.parse(game.final_whistle_at!) + FINAL_WHISTLE_MS) await finish(ctx, game)
    return
  }
  if (await callOffWhistle(ctx, game)) return
  const cleared = { ...game, final_whistle_at: null }
  if (phaseAt(cleared, ctx.now).phase === 'ended') await finish(ctx, cleared)
}

/**
 * Clears the final whistle because someone is free again, then checks once more: a catch racing this call may
 * have found the old whistle still set (so started none) just before it was cleared. True if a whistle is
 * pending again.
 */
async function callOffWhistle(ctx: Ctx, game: Game): Promise<boolean> {
  await ctx.store.clearFinalWhistle(game.id)
  return allOutCheck(ctx, game)
}

async function finish(ctx: Ctx, game: Game) {
  const results = computeResults(game, await ctx.store.players(game.id), await ctx.store.events(game.id))
  if (await ctx.store.claimEnd(game.id, results.winner)) {
    await ctx.store.addEvent({ game_id: game.id, type: 'ended', actor_id: null, target_id: null, data: { winner: results.winner } })
  }
}

/** Super Ring's messages to the runner (new power-ups §6.2). */
const ARREST_STARTED = 'Super Ring! House arrest: stay within 26 m for 2:36.'
const ARREST_OPEN = 'Super Ring! Open Kejar within 60 s to start house arrest.'
const ARREST_FREE = 'Free! Super Ring is spent.'
const BAIL_REVOKED = 'Bail revoked. To Penjara.'

/** A private notice to one player; a push that can't be delivered never fails the action. */
async function notify(ctx: Ctx, game: Game, p: Player, title: string, body: string) {
  try {
    await pushTo(ctx, [p], { type: 'notice', code: game.code, title, body })
  } catch {
    // Their own screen still shows it on the next poll.
  }
}

/**
 * The one way into Penjara (new power-ups §6.2): every route (a catch, auto-jail, later Mak Kau Hijau) goes
 * through here. A runner holding an unused Super Ring gets house arrest instead: on a catch it starts at once,
 * centred on their fix if it's at most 20 s old (else the chaser's), and locks that chaser off them; on any other
 * route it waits for them to open Kejar. `data` goes on the `arrested` event. Returns null when neither happened:
 * already jailed, or a concurrent call is firing their Super Ring right now.
 */
async function jailOrArrest(
  ctx: Ctx,
  game: Game,
  runner: Player,
  by: Player | null,
  route: Arrest['route'],
  data: Record<string, unknown> = {},
): Promise<'jailed' | 'arrested' | null> {
  const { store, now } = ctx
  const ring = (await store.powerUps(game.id)).find((u) => u.player_id === runner.id && u.kind === 'ring' && u.used_at === null && !u.taken_at)
  if (!ring) return (await store.catchRunner(runner.id, by?.id ?? null)) ? 'jailed' : null
  // Someone else's call won the card a moment ago: it is firing there, so this one does nothing.
  if (!(await store.markUsed(ring.id))) return null
  const firedAt = iso(now)
  let center: LatLng | null = null
  if (route === 'catch') {
    const positions = await store.latestPositions(game.id, [firedAt])
    const theirs = latest(positions[runner.id])
    const chaser = by ? latest(positions[by.id]) : null
    // The runner's own fix if it's fresh and usable, else the chaser's usable fix. Final fallback: the chaser's fix
    // whatever its accuracy (the catch scan just stored it, so the tag was ripped right there), then the runner's.
    const usable = (f: Position | null) => !!f && usableFix(f)
    const pick =
      theirs && usable(theirs) && now - Date.parse(theirs.at) <= ARREST_FIX_FRESH_MS ? theirs : usable(chaser) ? chaser : (chaser ?? theirs)
    center = pick ? { lat: pick.lat, lng: pick.lng } : null
  }
  const arrest: Arrest = { firedAt, route, by: by?.id ?? null, center, startedAt: center ? firedAt : null, ringId: ring.id, catchEventId: null }
  if (!(await store.startArrest(runner.id, arrest))) {
    // Jailed by a racing call first: the card was never spent.
    await store.updatePowerUp(ring.id, { used_at: null })
    return null
  }
  // No actor: the feed line never says who, or which card.
  const fired = await store.addEvent({ game_id: game.id, type: 'arrested', actor_id: null, target_id: runner.id, data: { route, firedAt, ...data } })
  await store.updateArrest(runner.id, route === 'catch' && by ? { eventId: fired.id, catchEventId: fired.id } : { eventId: fired.id })
  if (route === 'catch' && by) {
    await store.addEvent({ game_id: game.id, type: 'ring-locked', actor_id: by.id, target_id: runner.id, data: { firedAt } })
  }
  await notify(ctx, game, runner, 'House arrest', center ? ARREST_STARTED : ARREST_OPEN)
  return 'arrested'
}

/**
 * Ends a house arrest in Penjara: a fix outside the circle, no fresh fix inside at the end (`revoked`), or no fix
 * at all within 60 s of a waiting one (`no-show`, which keeps the missed check-ins that started it). The runner
 * goes in with no chaser, under an `auto-jailed` event, so the Penjara screens and a marshal's phone-problem undo
 * work as for auto-jail. True when that put the last free runner out (a final whistle is pending).
 */
async function arrestToPenjara(ctx: Ctx, game: Game, runner: Player, a: Arrest, cause: 'revoked' | 'no-show', data: Record<string, unknown> = {}): Promise<boolean> {
  const { store } = ctx
  if (!(await store.endArrest(runner.id, a.firedAt))) return false
  if (await store.catchRunner(runner.id, null)) {
    if (cause === 'revoked') await notify(ctx, game, runner, 'Penjara', BAIL_REVOKED)
    await store.addEvent({ game_id: game.id, type: 'auto-jailed', actor_id: null, target_id: runner.id, data: { who: who(runner), cause, ...data } })
  }
  await store.addEvent({ game_id: game.id, type: 'arrest-ended', actor_id: null, target_id: runner.id, data: { outcome: 'revoked', firedAt: a.firedAt } })
  return allOutCheck(ctx, game, 'auto-jail')
}

/**
 * Judges every house arrest that is due (the caller skips paused games): a waiting one with no fix 60 s after it
 * fired goes to Penjara; a started one at its end is judged on the runner's latest fix at or before the end, so a
 * late poll never changes the outcome. A Luar Garisan runner's arrest just ends. True if a final whistle is pending.
 */
async function settleArrests(ctx: Ctx, game: Game): Promise<boolean> {
  const { store, now } = ctx
  let allOut = false
  for (const p of (await store.players(game.id)).filter((r) => r.role === 'runner' && r.arrest && !r.jailed)) {
    const a = p.arrest!
    if (p.disqualified_at) {
      await store.endArrest(p.id, a.firedAt)
      continue
    }
    const endsAt = arrestEndsAt(a)
    if (endsAt === null) {
      if (now < Date.parse(a.firedAt) + ARREST_OPEN_MS) continue
      // By id: a resume moves a waiting arrest's `firedAt`, so it no longer matches the event's.
      const fired = a.eventId ? (await store.events(game.id)).find((e) => e.id === a.eventId) : undefined
      const kept = fired && Array.isArray(fired.data.checkins) ? { seq: fired.data.seq, checkins: fired.data.checkins } : {}
      if (await arrestToPenjara(ctx, game, p, a, 'no-show', kept)) allOut = true
      continue
    }
    if (now < endsAt) continue
    // The latest usable fix in the last 20 s up to the end: a rough fix is ignored, never a revoke on its own.
    const recent = await store.playerPositions(game.id, p.id, iso(endsAt - ARREST_FIX_FRESH_MS), iso(endsAt))
    const fix = [...recent].reverse().find(usableFix) ?? null
    if (releaseVerdict(a, fix) === 'revoked') {
      if (await arrestToPenjara(ctx, game, p, a, 'revoked')) allOut = true
    } else if (await store.endArrest(p.id, a.firedAt)) {
      // Free, and it doesn't use their one freed: they never went in.
      await notify(ctx, game, p, 'Free!', ARREST_FREE)
      await store.addEvent({ game_id: game.id, type: 'arrest-ended', actor_id: null, target_id: p.id, data: { outcome: 'free', firedAt: a.firedAt } })
    }
  }
  return allOut
}

/**
 * A fix from a runner under house arrest (the caller skips paused games and anything but the chase). A rough fix
 * counts for nothing. The first usable fix starts a waiting arrest right there, if it lands within 60 s; once
 * started, a usable fix outside the circle before the end sends them to Penjara at once.
 */
async function arrestFix(ctx: Ctx, game: Game, me: Player, fix: Position) {
  const a = me.arrest
  if (!a || !usableFix(fix)) return
  if (!a.startedAt) {
    if (ctx.now >= Date.parse(a.firedAt) + ARREST_OPEN_MS) return
    await ctx.store.updateArrest(me.id, { center: { lat: fix.lat, lng: fix.lng }, startedAt: iso(ctx.now) })
    await notify(ctx, game, me, 'House arrest', ARREST_STARTED)
    return
  }
  // After the end, only the fix at or before it counts, which a poll judges.
  if (ctx.now >= arrestEndsAt(a)! || insideArrest(a, fix)) return
  await arrestToPenjara(ctx, game, me, a, 'revoked')
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
  // A new game has no planned start yet; the organiser sets one in the lobby (setStartTime).
  // The app picks one legendary per side here (new power-ups design §6.1), before anything else draws from rng.
  const settings = { ...settingsFrom(body.settings, ctx.rng), startsAt: null }
  // Full with a legendary picked: a free card of its colour now, so the organiser can print it before hiding it
  // (ruling R15). With none free but one free for the other legendary of that side, the game switches to that one.
  // With neither, the game still gets made (Review Focus 1); it keeps wanting the picked one and tries again later (R9).
  const stashes: Partial<Record<LegendaryKind, DatoStash>> = {}
  const notices: string[] = []
  if (settings.mode === 'full') {
    for (const kind of LEGENDARY_KINDS) {
      if (settings.legendaries[kind] !== 'stash' || stashes[kind]) continue
      const got = await cardOrFallback(ctx, organiser.organisation_id, kind)
      if (!got) {
        notices.push(NO_FREE_NOTICE[kind])
        continue
      }
      if (got.kind !== kind) settings.legendaries = switchedTo(settings.legendaries, kind, got.kind)
      stashes[got.kind] = stashOn(got.card)
    }
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
    final_whistle_at: null,
    rescue: null,
    five_warned_at: null,
    wiped_at: null,
    briefed_at: null,
    organiser_id: organiser.id,
    ...(stashes.dato ? { dato_stash: stashes.dato } : {}),
    ...(stashes.ring ? { ring_stash: stashes.ring } : {}),
    ...(stashes.bomoh ? { bomoh_stash: stashes.bomoh } : {}),
    ...(stashes.hijau ? { hijau_stash: stashes.hijau } : {}),
  })
  await wipeExpired(ctx)
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
    reel_pulled_at: null,
    push: null,
    removed_at: null,
    outside: false,
    left_start: false,
    brief_opened_at: null,
    brief_ready_at: null,
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
  const { game: settled, notices } = await settleAllLobbyCards(ctx, game, organiser.organisation_id)
  const startedAt = iso(ctx.now)
  const started = { ...game, started_at: startedAt }
  const count = (role: Role) => Object.values(roles).filter((r) => r === role).length
  const offLegendaries: Partial<Settings['legendaries']> = {}
  for (const kind of LEGENDARY_KINDS) if (wantsCard(settled, kind)) offLegendaries[kind] = 'off'
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
      reel_pulled_at: null,
      push: (game as GameRow).host_push ?? null,
      removed_at: null,
      outside: false,
      left_start: false,
      brief_opened_at: null,
      brief_ready_at: null,
    }
  }
  // The organiser's own poll only (ruling R9): an expired lobby re-checks its card, so the print link never shows a
  // card another game holds, and a lobby with no card tries for one. Any legendary's. Player polls never pay for this.
  if (me.id === 'host' && LEGENDARY_KINDS.some((k) => needsRecheck(game, ctx.now, k))) {
    const org = (await ctx.store.organiserById((game as GameRow).organiser_id))?.organisation_id
    if (org) {
      let fresh = game as GameRow
      for (const kind of LEGENDARY_KINDS) {
        if (needsRecheck(fresh, ctx.now, kind)) fresh = (await settleLobbyCard(ctx, fresh, org, kind)).game
      }
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
  // The rescuer's phone sends a fix every RESCUE_PING_MS (1.5 s) during the hold, under the 2 s gap: their fixes
  // are the hold's heartbeat, so none is dropped. The hold is 10 s, so that is a handful of extra rows.
  const rescuing = game.rescue?.by === me.id
  const stored = await ctx.store.addPosition(game.id, me.id, fix, rescuing && !game.paused_at ? undefined : LOCATION_MIN_GAP_MS, since)
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
  // Super Ring's house arrest freezes with the game, like Luar Garisan. Luar Garisan above still applies to it.
  if (me.arrest && !game.paused_at && phaseAt(game, ctx.now).phase === 'chasing') await arrestFix(ctx, game, me, { ...fix, at: iso(ctx.now) })
  // Each fix is judged as it lands, so a step outside and back between two polls still counts (rules §9a).
  if (rescuing) await settleRescue(ctx, game, undefined, { ...fix, at: iso(ctx.now) })
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
  // Disqualifying the last free runner blows the final whistle, the same as catching them (spec §7a, fair-play §1.4).
  if (!warned && me.role === 'runner') await allOutCheck(ctx, game, 'luar-garisan')
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
  const events = await ctx.store.events(game.id)
  const shieldings = events
    .filter((e) => e.type === 'shielded' && e.actor_id && e.target_id)
    .map((e) => ({ chaserId: e.actor_id as string, runnerId: e.target_id as string, at: Date.parse(e.at) }))
  // Super Ring's locks, minus any whose house arrest a marshal undid (Undo kejar: the catch never happened).
  const undone = new Set(events.filter((e) => e.type === 'arrest-ended' && e.data.outcome === 'undone').map((e) => `${e.target_id}|${str(e.data.firedAt)}`))
  const ringLocks = events
    .filter((e) => e.type === 'ring-locked' && e.actor_id && e.target_id && !undone.has(`${e.target_id}|${str(e.data.firedAt)}`))
    .map((e) => ({ chaserId: e.actor_id as string, runnerId: e.target_id as string }))
  const verdict = judgeCatch({
    phase: phaseAt(fresh, ctx.now).phase,
    chaser: players.find((p) => p.id === me.id) ?? me,
    tagId,
    players,
    chaserPos: latest(positions[me.id]),
    runnerPos: runner ? latest(positions[runner.id]) : null,
    now: ctx.now,
    shieldings,
    ringLocks,
  })
  if (!verdict.ok) {
    // The Durian and Super Ring refusals name the runner so the chaser knows who is off limits.
    const named: string[] = ['durian-locked', 'durian-head-start', 'ring-locked', 'arrest']
    return runner && named.includes(verdict.reason) ? { ...verdict, name: runner.name } : verdict
  }
  // A switched-on Shield absorbs one otherwise-valid catch.
  const shield = activeShield(await ctx.store.powerUps(game.id), verdict.runnerId, ctx.now)
  // consumeShield is atomic, so two chasers scanning at once can't both be blocked by one shield.
  if (shield && (await ctx.store.consumeShield(shield.id))) {
    await ctx.store.addEvent({ game_id: game.id, type: 'shielded', actor_id: me.id, target_id: verdict.runnerId, data: {} })
    return { ok: false, reason: 'shielded', name: runner?.name }
  }
  const sent = runner ? await jailOrArrest(ctx, fresh, runner, players.find((p) => p.id === me.id) ?? me, 'catch') : null
  if (sent === null) return { ok: false, reason: 'already-caught' }
  // Catching the rescuer fails a live rescue: nobody gets out, even with a joiner still close (rules §9a). Super
  // Ring saving the rescuer from Penjara doesn't save the rescue.
  const failRescue = async () => {
    if (fresh.rescue?.by === verdict.runnerId && (await ctx.store.endRescue(game.id, fresh.rescue.startedAt))) {
      await ctx.store.addEvent({ game_id: game.id, type: 'rescue-failed', actor_id: verdict.runnerId, target_id: null, data: {} })
    }
  }
  // Super Ring fired: house arrest, not a catch, and this chaser hands the tag back for good.
  if (sent === 'arrested') {
    await failRescue()
    return { ok: false, reason: 'ring', name: runner!.name }
  }
  await ctx.store.addEvent({
    game_id: game.id,
    type: 'caught',
    actor_id: me.id,
    target_id: verdict.runnerId,
    data: { flagged: verdict.flagged, who: tagLabelOf(players, verdict.runnerId), chaser: me.name, ...(verdict.flagged ? { farFromLast: true } : {}) },
  })
  await failRescue()
  // The last free runner caught: the final whistle, not the end (fair-play §1.4).
  await allOutCheck(ctx, fresh)
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
  // The scan starts the 10-second hold instead of freeing at once (rules §9a); `advance` settles it.
  if (await ctx.store.startRescue(game.id, me.id, iso(ctx.now))) {
    await ctx.store.addEvent({ game_id: game.id, type: 'rescue-started', actor_id: me.id, target_id: null, data: { who: who(me) } })
    return { ok: true, rescue: 'started', endsAt: ctx.now + RESCUE_HOLD_MS }
  }
  // One rescue at a time: a scan during a hold joins it, and the hold keeps its own time. Only the first
  // rescuer's catch or fixes decide it.
  const live = (await loadGame(ctx, body)).rescue
  if (!live) return { ok: false, reason: 'try-again' }
  await ctx.store.joinRescue(game.id, me.id)
  return { ok: true, rescue: live.by === me.id ? 'started' : 'joined', endsAt: Date.parse(live.startedAt) + RESCUE_HOLD_MS }
}

/**
 * The Penjara reel (§2.2): a jailed runner at Penjara pulls once per stay. The server picks the slot (one in ten is
 * free, none once the escape is used) and the phone only animates to it. The pull is spent first, atomically, so a
 * double tap or two phones pull once. A free slot frees the runner like a jailbreak, so a pending final whistle is
 * called off; a black slot changes nothing and posts nothing.
 */
const pullReel: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const me = await requirePlayer(ctx, game, body)
  if (me.disqualified_at) return { ok: false, reason: 'disqualified' }
  await recordScanLocation(ctx, game, me, body)
  await advance(ctx, game)
  const fresh = (await loadGame(ctx, body)) as Game
  if (fresh.paused_at) return { ok: false, reason: 'paused' }
  if (phaseAt(fresh, ctx.now).phase !== 'chasing') return { ok: false, reason: 'not-chasing' }
  const current = (await ctx.store.players(game.id)).find((p) => p.id === me.id)
  if (!current || current.role !== 'runner' || !current.jailed) return { ok: false, reason: 'not-jailed' }
  if (reelPulledThisStay(current)) return { ok: false, reason: 'already-pulled' }
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  if (!atJail(latest(positions[me.id]), game.arena.jail, ctx.now)) return { ok: false, reason: 'too-far-from-jail' }
  if (!(await ctx.store.pullReel(me.id, iso(ctx.now)))) return { ok: false, reason: 'already-pulled' }
  const result = pickReel(ctx.rng, current.freed_once)
  if (result === 'free') {
    try {
      await ctx.store.updatePlayers([{ id: me.id, patch: { jailed: false, freed_once: true, freed_at: iso(ctx.now), out_warned_at: null } }])
      await ctx.store.addEvent({ game_id: game.id, type: 'reel-free', actor_id: me.id, target_id: null, data: { who: who(me) } })
    } catch (e) {
      await ctx.store.releaseReelPull(me.id) // give the pull back
      throw e
    }
    // Someone is free again: no final whistle (advance would call it off too, on the next poll).
    if (fresh.final_whistle_at) await callOffWhistle(ctx, fresh)
  }
  return { ok: true, result }
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
  if (phaseAt(game, ctx.now).phase !== 'lobby') throw new ActionError(410, 'That invite link is no longer usable. The game already started.')
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
    reel_pulled_at: null,
    push: null,
    removed_at: null,
    outside: false,
    left_start: false,
    brief_opened_at: null,
    brief_ready_at: null,
    token_hash: hashToken(token),
  })
  await ctx.store.addEvent({ game_id: game.id, type: 'joined', actor_id: p.id, target_id: null, data: {} })
  return { token, playerId: p.id }
}

/**
 * New phone (fair-play §1.7): a marshal or the organiser makes a one-time link that moves a runner or chaser onto
 * another phone. Any phase but ended. Redeeming it swaps the player's session token, so the old phone stops working.
 */
const createPhoneMove: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, game, body)
  if (phaseAt(game, ctx.now).phase === 'ended') throw new ActionError(409, 'The game has ended')
  const target = (await ctx.store.players(game.id)).find((p) => p.id === str(body.playerId))
  if (!target || target.removed_at || (target.role !== 'runner' && target.role !== 'chaser')) {
    throw new ActionError(400, 'Pick a runner or a chaser who is still in the game')
  }
  const inviteToken = newToken()
  await ctx.store.createPhoneMove({
    game_id: game.id,
    player_id: target.id,
    token_hash: hashToken(inviteToken),
    created_at: iso(ctx.now),
    expires_at: iso(ctx.now + PHONE_MOVE_TTL_MS),
    redeemed_at: null,
  })
  await ctx.store.addSafetyRecord({
    game_id: game.id,
    type: 'phone-move',
    player_id: marshal?.id ?? null,
    target_id: target.id,
    lat: null,
    lng: null,
    data: { game_code: game.code, by: await marshalName(ctx, game, body, marshal), target_name: target.name },
  })
  return { inviteToken }
}

const redeemPhoneMove: Action = async (ctx, body) => {
  const game = await loadGame(ctx, body)
  const inviteToken = str(body.inviteToken)
  if (!inviteToken) throw new ActionError(400, 'Missing invite token')
  const token = newToken()
  const result = await ctx.store.redeemPhoneMove(hashToken(inviteToken), ctx.now, game.id, hashToken(token))
  if (!result.ok) {
    if (result.reason === 'invalid') throw new ActionError(404, 'That invite link is not valid')
    if (result.reason === 'redeemed') throw new ActionError(410, 'That invite link has already been used')
    throw new ActionError(410, 'That invite link has expired')
  }
  return { token, playerId: result.playerId }
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
  if (isRingQr(qr)) return claimRing(ctx, fresh as GameRow, me, ringCodeFromQr(qr))
  if (isHijauQr(qr)) return claimHijau(ctx, fresh as GameRow, me, hijauCodeFromQr(qr))
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
  return { ok: true, kind, ...(await doubleIfCombo(ctx, me, claimed.powerUp)) }
}

/**
 * Nasi Lemak KFC (new power-ups §5.2): a card delivered while the player is combo ready arrives with a twin, the
 * second use. A card it can't double (COMBO_EXCLUDED) arrives as normal and leaves the combo ready for the card
 * after. `delivered` must be this player's own just-delivered card: the store doesn't check whose it is.
 */
async function doubleIfCombo(ctx: Ctx, me: Player, delivered: PowerUp): Promise<{ double?: true }> {
  if (COMBO_EXCLUDED.includes(delivered.kind)) return {}
  return (await ctx.store.applyCombo(me.id, delivered.id)) ? { double: true } : {}
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
 * Scanning Super Ring's hidden stash: exactly Dato Seri's flow and refusals (`claimDato`), with its own wrong-scan
 * count. The store puts an unused `ring` row in the runner's slot; it is used automatically later, never from the
 * slot. The feed only ever says `Something legendary was found.`
 */
async function claimRing(ctx: Ctx, game: GameRow, me: Player, scanned: string | null) {
  const miss = await stashMisses(ctx, game, me, 'ring')
  if (!miss) return NO_STASH
  const secret = game.settings.mode === 'full' ? (game.ring_stash?.code ?? null) : null
  if (!scanned || !secret || hashToken(scanned) !== hashToken(secret)) return miss(NO_STASH)
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  const verdict = judgeRingClaim({
    phase: phaseAt(game, ctx.now).phase,
    me,
    stash: game.ring_stash,
    myPos: latest(positions[me.id]),
    powerUps: await ctx.store.powerUps(game.id),
    pings: await ctx.store.pings(game.id),
    now: ctx.now,
  })
  if (!verdict.ok) return verdict.reason === 'no-stash' || verdict.reason === 'too-far' ? miss(verdict) : verdict
  // Losing the race to another runner isn't a miss.
  if (!(await ctx.store.claimRing(game.id, me.id))) return NO_STASH
  if (game.ring_stash?.card) await ctx.store.setSecretCard(game.ring_stash.card.id, { state: 'retired', found_at: iso(ctx.now) })
  await ctx.store.addEvent({ game_id: game.id, type: 'legendary', actor_id: me.id, target_id: null, data: {} })
  return { ok: true, kind: 'ring' }
}

/** How long runners have to tap green once Mak Kau Hijau is claimed. Task 5 moves the start clear of check-in windows. */
const HIJAU_WINDOW_MS = 45_000

/**
 * Scanning Mak Kau Hijau's hidden stash: exactly Bomoh's flow and refusals (`claimBomoh`, plus the frozen
 * refusal from `judgeHijauClaim`), with its own wrong-scan count. The store marks the stash claimed and writes
 * `games.hijau` in one step. Timing is a placeholder (starts at the claim); Task 5 replaces it and adds the push,
 * the taps and the judging.
 */
async function claimHijau(ctx: Ctx, game: GameRow, me: Player, scanned: string | null) {
  const miss = await stashMisses(ctx, game, me, 'hijau')
  if (!miss) return NO_STASH
  const secret = game.settings.mode === 'full' ? (game.hijau_stash?.code ?? null) : null
  if (!scanned || !secret || hashToken(scanned) !== hashToken(secret)) return miss(NO_STASH)
  const positions = await ctx.store.latestPositions(game.id, [iso(ctx.now)])
  const verdict = judgeHijauClaim({
    phase: phaseAt(game, ctx.now).phase,
    me,
    stash: game.hijau_stash,
    myPos: latest(positions[me.id]),
    now: ctx.now,
  })
  if (!verdict.ok) return verdict.reason === 'no-stash' || verdict.reason === 'too-far' ? miss(verdict) : verdict
  const run = { startsAt: iso(ctx.now), deadline: iso(ctx.now + HIJAU_WINDOW_MS) }
  // Losing the race to another chaser isn't a miss.
  if (!(await ctx.store.claimHijau(game.id, me.id, run))) return NO_STASH
  if (game.hijau_stash?.card) await ctx.store.setSecretCard(game.hijau_stash.card.id, { state: 'retired', found_at: iso(ctx.now) })
  await ctx.store.addEvent({ game_id: game.id, type: 'legendary', actor_id: me.id, target_id: null, data: {} })
  return { ok: true, kind: 'hijau' }
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

/**
 * The organiser hides the printed Super Ring or Mak Kau Hijau card and saves the spot, mirroring `dropBomoh` above:
 * organiser only (marshals never learn where it is), Full mode only, lobby only, and dropping again moves it.
 */
function dropLegendary(legendary: 'ring' | 'hijau', name: string): Action {
  return async (ctx, body) => {
    const loaded = await loadGame(ctx, body)
    const organiser = await requireOrganiser(ctx, loaded, body)
    if (loaded.settings.mode !== 'full') throw new ActionError(409, `${name} is in Full mode only`)
    requireLobby(loaded, ctx.now)
    // An old lobby re-checks its card first, and one with none tries for one (rulings R3, R9).
    const { game } = await settleLobbyCard(ctx, loaded, organiser.organisation_id, legendary)
    const held = stashOf(game, legendary)
    // No card (this legendary wasn't picked, or none is free yet): there's nothing to drop.
    if (!held) throw new ActionError(409, NO_FREE_NOTICE[legendary])
    const at = coordsOf(body)
    if (!at) throw new ActionError(400, 'Invalid location')
    if (!inPlayArea(at, game.arena)) throw new ActionError(400, 'Drop it inside the play area')
    // Moving it keeps the code and the card, so the card already printed still works.
    await writeStash(ctx, game.id, legendary, { ...held, code: held.code ?? newDatoCode(), lat: at.lat, lng: at.lng, claimedBy: null, claimedAt: null })
    return { ok: true }
  }
}
const dropRing = dropLegendary('ring', 'Super Ring')
const dropHijau = dropLegendary('hijau', 'Mak Kau Hijau')

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
  // A frozen chaser's power-up slot is shut (Cheese Ais): nothing is spent.
  const frozenFor = frozenForMs(me, ctx.now)
  if (frozenFor > 0) return { ok: false, reason: 'frozen', frozenForMs: frozenFor }
  // A doubled card's second use waits until the first one's effect has finished (new power-ups §5.2), so both
  // uses can't land on one ping. A doubled Durian's twin never gets here: it is switched on with its partner.
  const pings = await ctx.store.pings(game.id)
  if (runningEffect(all, me.id, pings, ctx.now) !== null) return { ok: false, reason: 'effect-running' }
  // Dato Seri is only ever used through Settle, at Penjara (jail design §4b).
  if (u.kind === 'dato') return { ok: false, reason: 'settle-at-penjara' }
  // Super Ring is never used from the slot: it steps in by itself when its holder would go to Penjara.
  if (u.kind === 'ring') return { ok: false, reason: 'automatic' }
  // A Flare's reveal must land before the whistle.
  if (u.kind === 'flare' && (endsAt ?? 0) - ctx.now < ALERT_LEAD_MS) return { ok: false, reason: 'too-late' }

  // Mat Rempit: one at a time, team-wide, then a 3-minute wait (power-ups §5a). A refusal isn't spent.
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
  // Cheese Ais: the target is checked before the card is spent; a refusal keeps the card.
  let cheeseTarget: Player | undefined
  if (u.kind === 'cheese') {
    cheeseTarget = (await ctx.store.players(game.id)).find((p) => p.id === str(body.targetId))
    const t = cheeseTarget
    if (!t || t.role !== 'chaser' || t.removed_at || t.disqualified_at || frozenForMs(t, ctx.now) > 0) return { ok: false, reason: 'no-target' }
  }
  // Tuch and Ga (new power-ups §5.3): the gate goes where the chaser stands now. No fresh fix, no gate, and the
  // card is kept (checked before the card is spent).
  let gateSpot: { lat: number; lng: number } | null = null
  if (u.kind === 'toll') {
    const fix = latest((await ctx.store.latestPositions(game.id, [iso(ctx.now)]))[me.id])
    if (!fix || ctx.now - Date.parse(fix.at) > TOLL_FRESH_MS) return { ok: false, reason: 'no-location' }
    gateSpot = { lat: fix.lat, lng: fix.lng }
  }
  // markUsed is atomic: a double-tap uses the power-up once.
  if (!(await ctx.store.markUsed(u.id))) return { ok: false, reason: 'already-used' }
  if (u.kind === 'combo' && comboReady(all, me.id)) {
    // Nasi Lemak KFC can't double itself (new power-ups §5.2): marks never stack, so this one is spent at once
    // (used and consumed) and the slot frees. The first mark stays for the next delivery.
    await ctx.store.updatePowerUp(u.id, { consumed_at: iso(ctx.now) })
    await ctx.store.addEvent({ game_id: game.id, type: 'used', actor_id: me.id, target_id: null, data: { kind: 'combo' } })
    return { ok: true, kind: 'combo', wasted: true }
  }
  if (u.kind === 'toll' && gateSpot) await ctx.store.updatePowerUp(u.id, { spot: gateSpot })
  if (u.kind === 'shield') {
    // A doubled Durian is one tap (new power-ups §5.2): its other half is switched on too, whichever row was
    // tapped, and arms itself through shieldArmedAt when this one blocks a catch or runs out. A stolen half is skipped.
    const other = all.find((x) => x.id !== u.id && x.player_id === me.id && x.kind === 'shield' && (x.twin_of === u.id || x.id === u.twin_of))
    if (other && other.used_at === null && !other.taken_at) await ctx.store.markUsed(other.id)
  }
  if (u.kind === 'cheese' && cheeseTarget) {
    // Spent first, frozen second (atomic in the store: of two racing runners only one lands); a lost race gives the card back.
    const until = iso(ctx.now + FREEZE_MS)
    let landed: boolean
    try {
      landed = await ctx.store.freezeChaser(cheeseTarget.id, until)
    } catch (e) {
      await ctx.store.updatePowerUp(u.id, { used_at: null })
      throw e
    }
    if (!landed) {
      await ctx.store.updatePowerUp(u.id, { used_at: null })
      return { ok: false, reason: 'no-target' }
    }
    await ctx.store.addEvent({ game_id: game.id, type: 'frozen', actor_id: me.id, target_id: cheeseTarget.id, data: { until } })
    return { ok: true, kind: 'cheese', name: cheeseTarget.name }
  }
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
  return { ok: true, kind: picked.powerUp.kind, powerupId: picked.powerUp.id, ...(await doubleIfCombo(ctx, me, picked.powerUp)) }
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
  const loaded = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, loaded, body)
  // Bring the game up to date first: a final whistle that ran out with nobody polling has ended the game.
  await advance(ctx, loaded)
  const game = await loadGame(ctx, body)
  // Once the game has ended its result is final (fair-play §1.4: after 60 s the Kejar win is final).
  if (phaseAt(game, ctx.now).phase === 'ended') return { ok: false, reason: 'not-undoable' }
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
  // Someone is free again: no final whistle (advance would call it off too, on the next poll).
  if (game.final_whistle_at) await callOffWhistle(ctx, game)
  return { ok: true }
}

/**
 * Undo kejar (fair-play §1.4): a marshal or the organiser undoes a wrong catch. Only the runner's latest catch,
 * only while it still holds them, and only during the chase (a pending final whistle keeps the chase open). The
 * runner goes back to free without using their one escape, and the catch drops out of awards and stats.
 */
const undoKejar: Action = async (ctx, body) => {
  const loaded = await loadGame(ctx, body)
  const marshal = await requireMarshal(ctx, loaded, body)
  // Bring the game up to date first: a hold that ran out with nobody polling has ended the game, so the Kejar win is final.
  await advance(ctx, loaded)
  const game = await loadGame(ctx, body)
  const eventId = str(body.eventId)
  const events = await ctx.store.events(game.id)
  const catching = events.find((e) => e.id === eventId && (e.type === 'caught' || (e.type === 'arrested' && e.data.route === 'catch')))
  const target = catching && (await ctx.store.players(game.id)).find((p) => p.id === catching.target_id)
  const chasing = phaseAt(game, ctx.now).phase === 'chasing'
  if (catching?.type === 'arrested') {
    // A catch that fired Super Ring (new power-ups §6.2): ends the live house arrest, lifts that chaser's lock (the
    // reader skips locks whose arrest ended 'undone') and gives the card back, still switched on.
    const a = target?.arrest
    if (!target || !a || !chasing || undoableArrestId(target) !== eventId || !(await ctx.store.endArrest(target.id, a.firedAt))) {
      return { ok: false, reason: 'not-undoable' }
    }
    await ctx.store.updatePowerUp(a.ringId, { used_at: null })
    await ctx.store.addEvent({ game_id: game.id, type: 'arrest-ended', actor_id: marshal?.id ?? null, target_id: target.id, data: { outcome: 'undone', firedAt: a.firedAt } })
  } else {
    const undoable = !!target && chasing && undoableCatchId(target, events) === eventId
    // Atomic, so two marshals tapping at once (or a racing release) free the runner only once.
    if (!undoable || !(await ctx.store.releaseCaught(target.id, catching.actor_id!, iso(ctx.now)))) {
      return { ok: false, reason: 'not-undoable' }
    }
  }
  // An undone house arrest's line names nobody: the feed never said who Super Ring saved.
  const arrest = catching.type === 'arrested' ? { arrest: true } : {}
  await ctx.store.addEvent({ game_id: game.id, type: 'kejar-undone', actor_id: marshal?.id ?? null, target_id: target.id, data: { eventId, who: who(target), ...arrest } })
  const name = await marshalName(ctx, game, body, marshal)
  await ctx.store.addEvent({ game_id: game.id, type: 'handled', actor_id: marshal?.id ?? null, target_id: null, data: { eventId, name } })
  await ctx.store.addSafetyRecord({
    game_id: game.id,
    type: 'kejar-undone',
    player_id: marshal?.id ?? null,
    target_id: target.id,
    lat: null,
    lng: null,
    data: { game_code: game.code, by: marshal?.name ?? 'Organiser', target_name: target.name },
  })
  await callOffWhistle(ctx, game)
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
  // The removed runner may have been the last one still free: the final whistle (fair-play §1.4).
  const phase = phaseAt(game, ctx.now).phase
  if (phase === 'hiding' || phase === 'chasing') await allOutCheck(ctx, game, 'removed')
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
    return await lookupParks(query, osmDeps(ctx))
  } catch {
    throw new ActionError(502, 'Park search is down right now. Try again in a minute.')
  }
}

/** Malaysia and a margin: enough to refuse nonsense without caring about borders. */
const inMalaysia = (c: LatLng) => c.lat >= -1 && c.lat <= 8 && c.lng >= 95 && c.lng <= 121

const nearbyParks: Action = async (ctx, body) => {
  await requireAnyOrganiser(ctx, body)
  if (!isLatLng(body.center) || !inMalaysia(body.center)) throw new ActionError(400, 'Invalid centre')
  const skip = Array.isArray(body.skip) ? body.skip.filter((x): x is string => typeof x === 'string').slice(0, 50) : []
  return { nearby: await lookupNearby(body.center, new Set(skip), osmDeps(ctx)) }
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
  await wipeExpired(ctx)
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
  // Switching to Full re-picks each side's legendary (new power-ups design §6.1), as Core let go of every card.
  const toFull = body.mode === 'full' && loaded.settings.mode !== 'full'
  const settings = settingsFrom({ ...loaded.settings, mode: body.mode }, toFull ? ctx.rng : undefined)
  await ctx.store.updateGame(loaded.id, { settings })
  if (settings.mode !== 'full') {
    for (const kind of LEGENDARY_KINDS) await releaseCard(ctx, loaded, kind)
    return { ok: true }
  }
  // A card the old pick still holds (a game left in Full from before Core released it) goes before the new pick's.
  if (toFull) for (const kind of LEGENDARY_KINDS) if (settings.legendaries[kind] !== 'stash') await releaseCard(ctx, loaded, kind)
  const fresh = (await ctx.store.gameByCode(loaded.code)) ?? { ...loaded, settings }
  const { notices } = await settleAllLobbyCards(ctx, fresh, organiser.organisation_id)
  return notices.length ? { ok: true, notice: notices.join(' ') } : { ok: true }
}

/**
 * The organiser's planned start (home upgrades design): from now up to 24 hours ahead, or null to clear. It only
 * informs the players' home countdown; the organiser still taps start.
 */
const setStartTime: Action = async (ctx, body) => {
  const loaded = await loadGame(ctx, body)
  await requireOrganiser(ctx, loaded, body)
  requireLobby(loaded, ctx.now)
  let startsAt: string | null = null
  if (body.startsAt !== null) {
    const t = typeof body.startsAt === 'string' ? Date.parse(body.startsAt) : NaN
    if (!Number.isFinite(t) || t < ctx.now || t > ctx.now + 24 * 60 * 60_000) throw new ActionError(400, 'Pick a start time in the next 24 hours')
    startsAt = new Date(t).toISOString()
  }
  await ctx.store.updateGame(loaded.id, { settings: settingsFrom({ ...loaded.settings, startsAt }) })
  return { ok: true }
}

export const actions = {
  create,
  setKit,
  setMode,
  setStartTime,
  startBriefing,
  briefOpened,
  briefReady,
  join,
  setRoles,
  start,
  linkTag,
  state,
  location,
  catch: catchAction,
  jailbreak,
  pullReel,
  settle,
  subscribe,
  claim,
  usePowerup,
  grabPick,
  dropDatoSeri,
  dropBomoh,
  dropRing,
  dropHijau,
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
  undoKejar,
  removePlayer,
  searchParks,
  nearbyParks,
  parkFeatures,
  saveArena,
  listArenas,
  deleteArena,
  recheckWater,
  createOrganiserInvite,
  redeemOrganiserInvite,
  createMarshalInvite,
  redeemMarshalInvite,
  createPhoneMove,
  redeemPhoneMove,
} satisfies Record<string, Action>

export type ActionName = keyof typeof actions
