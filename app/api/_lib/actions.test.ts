// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { MIN, T0 } from '../../shared/fixtures.js'
import { BONUS_SEQ_BASE } from '../../shared/clock.js'
import { cardAt, deckFor } from '../../shared/deck.js'
import { distanceM, distanceToEdgeM, offset } from '../../shared/geo.js'
import { floodPlanOf } from '../../shared/flood.js'
import { inPlayArea } from '../../shared/playArea.js'
import { bomohQr, datoQr, hijauQr, JAIL_QR, ringQr, slipQr, stationQr, tagQr } from '../../shared/ids.js'
import { seeded } from '../../shared/testing.js'
import type { PowerUpKind, Role } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { PHONE_MOVE_TTL_MS } from '../../shared/invites.js'
import { RESCUE_HOLD_MS } from '../../shared/penjara.js'
import { ActionError, actions, MAX_PLAYERS_PER_GAME, STASH_MISS_LIMIT, WIPE_AFTER_MS, type ActionName } from './actions.js'
import { hashToken } from './secrets.js'
import { computeResults } from '../../shared/results.js'
import { MemoryStore } from './store.js'

const CENTER = { lat: 3.0, lng: 101.0 }
let now: number
let store: MemoryStore
let pushes: { endpoint: string; payload: unknown }[]
let pushFails = false
/** Replies the fake OpenStreetMap services give, in order; an Error is thrown instead. */
let osmReplies: unknown[]
let osmCalls: string[]
/**
 * Draws the next action's rng hands out before its usual seeded(7) ones, used up as they're drawn. A legendary pick
 * is create's (and a switch to Full's) first draw, so `[0.9, 0.9]` picks Super Ring and Mak Kau Hijau.
 */
let forcedDraws: number[] = []
const rngOf = () => {
  const rest = seeded(7)
  return () => (forcedDraws.length ? forcedDraws.shift()! : rest())
}

const run = <T = any>(action: ActionName, body: object) =>
  actions[action](
    {
      store,
      now,
      rng: rngOf(),
      push: async (sub, payload) => {
        if (pushFails) throw new Error('push down')
        pushes.push({ endpoint: sub.endpoint!, payload: JSON.parse(payload) })
      },
      fetchJson: async (url) => {
        osmCalls.push(url)
        const r = osmReplies.shift()
        if (r instanceof Error || r === undefined) throw r ?? new Error('no fake reply')
        return r
      },
    },
    body,
  ) as Promise<T>

async function rejects(p: Promise<unknown>, status: number, message?: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  )
  expect(err).toBeInstanceOf(ActionError)
  expect(err.status).toBe(status)
  if (message) expect(err.message).toContain(message)
}

let organiserSeq = 0

async function createOrganiser() {
  const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(now).toISOString() })
  const organiserToken = `test-organiser-token-${++organiserSeq}`
  await store.createOrganiser({
    organisation_id: org.id,
    name: 'Owner',
    created_at: new Date(now).toISOString(),
    session_token_hash: hashToken(organiserToken),
    session_created_at: new Date(now).toISOString(),
  })
  return organiserToken
}

/**
 * A game started on a printed colour card before the Tupperware (spec §6, release ruling): its stash holds one of the
 * organisation's cards and that card's code, hidden at `spot` (null: not yet hidden). `create` no longer hands cards
 * out, so a test of the kept legacy claim path writes the stash here.
 */
async function legacyCard(code: string, legendary: 'dato' | 'ring' | 'bomoh' | 'hijau', spot: { lat: number; lng: number } | null, letter = 'A') {
  const game = (await store.gameByCode(code))!
  const org = (await store.organiserById(game.organiser_id))!.organisation_id
  const card = (await store.secretCards(org)).find((c) => c.legendary === legendary && c.letter === letter)!
  const stash = { code: card.code, card: { id: card.id, letter: card.letter }, lat: spot?.lat ?? null, lng: spot?.lng ?? null, claimedBy: null, claimedAt: null }
  await store.updateGame(game.id, { [`${legendary}_stash`]: stash })
}

beforeEach(() => {
  now = T0
  store = new MemoryStore(() => now)
  pushes = []
  pushFails = false
  osmReplies = []
  osmCalls = []
  forcedDraws = []
})

/** Creates a game with Ben (chaser), Aina #07 and Hafiz #03 (runners), all subscribed to push. */
async function readyGame(settings: object = {}, extra: object = {}) {
  const organiserToken = await createOrganiser()
  const { code } = await run('create', { arenaId: 'around-me', center: CENTER, settings, organiserToken, ...extra })
  const join = async (name: string) => {
    const r = await run('join', { code, name, accepted: true })
    await run('subscribe', { code, token: r.token, subscription: { endpoint: `https://push/${name}` } })
    return r
  }
  const ben = await join('Ben')
  const aina = await join('Aina')
  const hafiz = await join('Hafiz')
  const roles: Record<string, Role> = { [ben.playerId]: 'chaser', [aina.playerId]: 'runner', [hafiz.playerId]: 'runner' }
  await run('setRoles', { code, organiserToken, roles })
  await run('linkTag', { code, token: aina.token, tagId: 7 })
  await run('linkTag', { code, token: hafiz.token, tagId: 3 })
  return { code, organiserToken, ben, aina, hafiz }
}

const at = (dLatM: number) => ({ lat: CENTER.lat + dLatM / 111_195, lng: CENTER.lng, accuracy_m: 8 })

/**
 * A Penjara scan starts the 10-second rescue (rules §9a): this one holds it to the end and polls, so it frees
 * everyone eligible. `now` is left at the end of the hold.
 */
async function breakOut(code: string, token: string, extra: object = {}) {
  const r = await run('jailbreak', { code, token, qr: JAIL_QR, ...extra })
  if (r.ok) {
    now += RESCUE_HOLD_MS
    await run('state', { code, token })
  }
  return r
}

/** Both runners keep Kejar open (a location every minute), so they never miss a check-in. */
async function keepCheckingIn(g: { code: string; aina: { token: string }; hafiz: { token: string } }, fromMin: number, toMin: number) {
  for (let m = fromMin; m <= toMin; m++) {
    now = T0 + m * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
  }
}

describe('joining', () => {
  it('create then join returns a token and player', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
    const r = await run('join', { code, name: 'Aina', accepted: true })
    expect(r.token).toHaveLength(43)
    expect(r.playerId).toBeTruthy()
  })

  it('join without accepting the terms is rejected (400)', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    await rejects(run('join', { code, name: 'Aina', accepted: false }), 400, 'Accept')
  })

  it('rejoin with stored token returns the same player', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    const first = await run('join', { code, name: 'Aina', accepted: true })
    const again = await run('join', { code, name: 'Aina', accepted: true, token: first.token })
    expect(again).toEqual(first)
    expect((await store.players((await store.gameByCode(code))!.id)).length).toBe(1)
  })

  it('unknown game code is a 404', async () => {
    await rejects(run('join', { code: 'NOPE22', name: 'A', accepted: true }), 404, 'Game not found')
  })
})

describe('lobby cap, location gap and accuracy', () => {
  const fill = async (gameId: string, n: number) => {
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      const p = await store.addPlayer({
        game_id: gameId, name: `P${i}`, role: null, tag_id: null, accepted_at: new Date(now).toISOString(),
        caught_at: null, caught_by: null, jailed: false, freed_once: false, freed_at: null, push: null,
        removed_at: null, outside: false, left_start: false, reel_pulled_at: null, token_hash: `h${i}`,
      })
      ids.push(p.id)
    }
    return ids
  }
  const rowCount = () => (store as any).locs.length as number

  it('the lobby holds 40 players, and the 41st gets This game is full', async () => {
    expect(MAX_PLAYERS_PER_GAME).toBe(40)
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    await fill((await store.gameByCode(code))!.id, 40)
    await rejects(run('join', { code, name: 'Forty-one', accepted: true }), 409, 'This game is full')
  })

  it('refuses to join a full lobby', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    const first = await run('join', { code, name: 'Aina', accepted: true })
    await fill((await store.gameByCode(code))!.id, MAX_PLAYERS_PER_GAME - 1)
    await rejects(run('join', { code, name: 'Late', accepted: true }), 409, 'This game is full')
    expect(await run('join', { code, name: 'Aina', accepted: true, token: first.token })).toEqual(first)
  })

  it('removed players do not count towards the cap', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    const ids = await fill((await store.gameByCode(code))!.id, MAX_PLAYERS_PER_GAME)
    await rejects(run('join', { code, name: 'Late', accepted: true }), 409, 'This game is full')
    await run('removePlayer', { code, organiserToken, playerId: ids[0] })
    expect(await run('join', { code, name: 'Late', accepted: true })).toMatchObject({ playerId: expect.any(String) })
  })

  it('drops a location sent within 2 s of the last one', async () => {
    const g = await readyGame()
    await run('location', { code: g.code, token: g.aina.token, ...at(0) })
    now += 1_000
    await run('location', { code: g.code, token: g.aina.token, ...at(5) })
    expect(rowCount()).toBe(1)
    now += 1_000
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    expect(rowCount()).toBe(2)
  })

  it('a scan right after a location still records its own fix', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    now += 500
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7), ...at(3) })
    const latest = (store as any).locs.filter((l: any) => l.player_id === g.ben.playerId).at(-1)
    expect(latest.lat).toBeCloseTo(at(3).lat, 8)
  })

  it('refuses a location with a nonsense accuracy', async () => {
    const g = await readyGame()
    for (const accuracy_m of [-5, NaN, Infinity]) {
      await rejects(run('location', { code: g.code, token: g.aina.token, ...at(0), accuracy_m }), 400, 'Invalid location')
    }
    await run('location', { code: g.code, token: g.aina.token, ...at(0), accuracy_m: 90_000 })
    expect((store as any).locs.at(-1).accuracy_m).toBe(5_000)
  })

  it('clamps the accuracy sent with a scan instead of refusing it', async () => {
    const g = await readyGame()
    const stored: number[] = []
    for (const accuracy_m of [-5, NaN, Infinity, 90_000, 12]) {
      now += 1_000
      await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7), ...at(0), accuracy_m }).catch(() => undefined)
      stored.push((store as any).locs.filter((l: any) => l.player_id === g.ben.playerId).at(-1).accuracy_m)
    }
    expect(stored).toEqual([0, 0, 0, 5_000, 12])
  })

  it('the first fix inside a check-in window always lands, even within 2 s of the last one', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    const alertAt = T0 + 10 * MIN - 60_000 // hide 5 + ping 5, minus the 60 s scheduled alert
    now = alertAt - 1_000
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    now = alertAt + 500 // the phone re-sends its last fix on the first poll after the alert
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    expect(rowCount()).toBe(2)
    // Inside the window, once that first fix has landed, the gap applies again.
    now += 1_000
    await run('location', { code: g.code, token: g.aina.token, ...at(21) })
    expect(rowCount()).toBe(2)
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.checkin?.state).toBe('in')
  })

  it('outside a check-in window the 2 s gap still applies during the chase', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    now += 1_500
    await run('location', { code: g.code, token: g.aina.token, ...at(21) })
    expect(rowCount()).toBe(1)
  })

  it('the first fix inside a bonus (Flare) ping window always lands too', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    const game = (await store.gameByCode(g.code))!
    const alertAt = T0 + 7 * MIN
    await store.addBonusPing(game.id, BONUS_SEQ_BASE + 1, new Date(alertAt).toISOString(), new Date(alertAt + 30_000).toISOString())
    now = alertAt - 1_000
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    now = alertAt + 500
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    expect(rowCount()).toBe(2)
  })
})

describe('organiser controls', () => {
  it('start refuses lopsided teams with the validateTeams messages (409)', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    const a = await run('join', { code, name: 'Aina', accepted: true })
    const b = await run('join', { code, name: 'Hafiz', accepted: true })
    await run('setRoles', { code, organiserToken, roles: { [a.playerId]: 'runner', [b.playerId]: 'runner' } })
    await rejects(run('start', { code, organiserToken }), 409, 'Need at least 1 chaser')
  })

  it("start refuses when a runner has no tag (409 'Runner Aina has no tag')", async () => {
    const g = await readyGame()
    await store.updatePlayers([{ id: g.aina.playerId, patch: { tag_id: null } }])
    await rejects(run('start', { code: g.code, organiserToken: g.organiserToken }), 409, 'Runner Aina has no tag')
  })

  it("linkTag refuses a tag already linked (409 'Tag 07 is already taken')", async () => {
    const g = await readyGame()
    await rejects(run('linkTag', { code: g.code, token: g.hafiz.token, tagId: 7 }), 409, 'Tag 07 is already taken')
  })

  it('non-host cannot setRoles or start (403)', async () => {
    const g = await readyGame()
    await rejects(run('setRoles', { code: g.code, organiserToken: 'wrong', roles: { [g.aina.playerId]: 'chaser' } }), 403)
    await rejects(run('start', { code: g.code, organiserToken: g.aina.token }), 403)
  })

  it("another organiser's valid session cannot setRoles or start this game (403)", async () => {
    const gameA = await readyGame()
    const gameB = await readyGame()
    await rejects(run('setRoles', { code: gameA.code, organiserToken: gameB.organiserToken, roles: { [gameA.aina.playerId]: 'chaser' } }), 403, 'Organiser only')
    await rejects(run('start', { code: gameA.code, organiserToken: gameB.organiserToken }), 403, 'Organiser only')
  })

  it('the organiser picks each side, and hears about lopsided teams', async () => {
    const g = await readyGame()
    const r = await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [g.hafiz.playerId]: 'chaser' } })
    expect(r.roles).toMatchObject({ [g.hafiz.playerId]: 'chaser', [g.aina.playerId]: 'runner' })
    expect(r.problems).toEqual(['Need at least 2 runners', 'More chasers than runners'])
  })

  it('a player can only be Dikejar or Kejar: marshals come from the invite link', async () => {
    const g = await readyGame()
    await rejects(run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [g.aina.playerId]: 'marshal' } }), 400)
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    await rejects(run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [siti.playerId]: 'runner' } }), 400)
  })

  it('there is no random shuffle any more', async () => {
    const g = await readyGame()
    await rejects(run('setRoles', { code: g.code, organiserToken: g.organiserToken, shuffle: true }), 400)
  })
})

describe('pings and check-ins', () => {
  it('state at the first alert time pushes once to runners with subscriptions in push mode', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 10 * MIN - 30_000 // hide 5 + ping 5, minus 30 s
    await run('state', { code: g.code, token: g.ben.token })
    await run('state', { code: g.code, token: g.aina.token })
    expect(pushes.map((p) => p.endpoint).sort()).toEqual(['https://push/Aina', 'https://push/Hafiz'])
    expect(pushes[0].payload).toEqual({ type: 'checkin', code: g.code, seq: 1, revealAt: T0 + 10 * MIN })
  })

  it('schedule mode never pushes', async () => {
    const g = await readyGame({ checkinMode: 'schedule' })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 10 * MIN
    await run('state', { code: g.code, token: g.ben.token })
    expect(pushes).toEqual([])
  })

  it('state never returns runner positions to a chaser except fuzzed at reveal', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 6 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(100) })
    let v = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(v.dots.filter((d) => d.kind === 'runner')).toEqual([])
    now = T0 + 10 * MIN
    v = await run<View>('state', { code: g.code, token: g.ben.token })
    const runner = v.dots.find((d) => d.kind === 'runner')!
    expect(runner.fuzzy).toBe(true)
    expect(runner.label).toBe('#07')
  })
})

describe('catching and jail', () => {
  async function chasing() {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    return g
  }

  it('catch flow: chaser scans runner tag → runner jailed, event caught, second scan already-caught', async () => {
    const g = await chasing()
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({
      ok: true,
      flagged: false,
      runnerId: g.aina.playerId,
      label: '#07 Aina',
    })
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.me.jailed).toBe(true)
    expect(v.feed[0].text).toBe('Ben caught #07.')
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({
      ok: false,
      reason: 'already-caught',
    })
  })

  it('jailbreak flow frees jailed runners once', async () => {
    const g = await chasing()
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) }) // jail is at the centre
    expect(await breakOut(g.code, g.hafiz.token)).toEqual({ ok: true, rescue: 'started', endsAt: now })
    expect((await store.players((await store.gameByCode(g.code))!.id)).find((p) => p.id === g.aina.playerId)).toMatchObject({ jailed: false, freed_once: true })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
    expect(await run('jailbreak', { code: g.code, token: g.hafiz.token, qr: JAIL_QR })).toEqual({
      ok: false,
      reason: 'nobody-to-free',
    })
  })

  it('jailbreak sets freed_at on everyone it frees', async () => {
    const g = await chasing()
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
    await breakOut(g.code, g.hafiz.token)
    const game = await store.gameByCode(g.code)
    const players = await store.players(game!.id)
    expect(players.find((p) => p.id === g.aina.playerId)!.freed_at).toBe(new Date(now).toISOString())
    expect(players.find((p) => p.id === g.hafiz.playerId)!.freed_at).toBeNull()
  })

  it('rejects a jail scan of something that is not the jail code', async () => {
    const g = await chasing()
    await rejects(run('jailbreak', { code: g.code, token: g.hafiz.token, qr: tagQr(3) }), 400)
  })

  it('game ends exactly once and chasers win when everyone is caught', async () => {
    const g = await chasing()
    await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
    // The final whistle holds the end for 60 s (fair-play §1.4).
    expect((await run<View>('state', { code: g.code, token: g.ben.token })).phase).toBe('chasing')
    now += 61_000
    const v = await run<View>('state', { code: g.code, token: g.ben.token })
    await run('state', { code: g.code, token: g.ben.token })
    expect(v.phase).toBe('ended')
    expect(v.results?.winner).toBe('chasers')
    const events = await store.events((await store.gameByCode(g.code))!.id)
    expect(events.filter((e) => e.type === 'ended')).toHaveLength(1)
  })

  it('runners win when time runs out', async () => {
    const g = await chasing()
    await keepCheckingIn(g, 8, 50)
    now = T0 + 51 * MIN
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.phase).toBe('ended')
    expect(v.results?.winner).toBe('runners')
  })
})

describe('the 10-second rescue at Penjara (rules §9a)', () => {
  /**
   * A Full game in the chase at +7 min: Ben chases; Aina #07 and Hafiz #03 are in Penjara; Wei #14 and Mei #21
   * are free. Ben is at the centre (Penjara), Wei and Mei 10 m from it.
   */
  async function inPenjara(settings: object = {}) {
    const g = await readyGame({ mode: 'full', ...settings })
    const join = async (name: string, tagId: number) => {
      const r = await run('join', { code: g.code, name, accepted: true })
      await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [r.playerId]: 'runner' } })
      await run('linkTag', { code: g.code, token: r.token, tagId })
      return r
    }
    const wei = await join('Wei', 14)
    const mei = await join('Mei', 21)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    const jailed = { jailed: true, caught_at: new Date(now).toISOString(), caught_by: g.ben.playerId }
    await store.updatePlayers([g.aina, g.hafiz].map((p) => ({ id: p.playerId, patch: jailed })))
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    return { ...g, wei, mei, gameId }
  }
  type G = Awaited<ReturnType<typeof inPenjara>>
  const scan = (g: G, token: string) => run('jailbreak', { code: g.code, token, qr: JAIL_QR, ...at(10) })
  const jailedIds = async (g: G) => (await store.players(g.gameId)).filter((p) => p.jailed).map((p) => p.id)
  const poll = (g: G) => run<View>('state', { code: g.code, organiserToken: g.organiserToken })
  const events = async (g: G, type: string) => (await store.events(g.gameId)).filter((e) => e.type === type)

  it('a scan at Penjara starts a rescue, frees nobody yet, and tells everyone', async () => {
    const g = await inPenjara()
    const t = now
    expect(await scan(g, g.wei.token)).toEqual({ ok: true, rescue: 'started', endsAt: t + RESCUE_HOLD_MS })
    expect(await jailedIds(g)).toEqual([g.aina.playerId, g.hafiz.playerId])
    expect(await events(g, 'rescue-started')).toMatchObject([{ actor_id: g.wei.playerId, data: { who: 'Wei #14' } }])
    const rescue = { by: g.wei.playerId, byName: 'Wei', endsAt: t + RESCUE_HOLD_MS, joiners: [] }
    for (const who of [{ token: g.aina.token }, { token: g.wei.token }, { organiserToken: g.organiserToken }]) {
      expect((await run<View>('state', { code: g.code, ...who })).rescue).toEqual(rescue)
    }
    const ben = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(ben.rescue).toEqual({ endsAt: t + RESCUE_HOLD_MS }) // a chaser is never told who
    expect(ben.feed[0]).toMatchObject({ text: 'Rescue starting at Penjara!', means: 'Catch them in 10 s and nobody gets out.', act: true })
  })

  it('a poll at +10 s frees everyone eligible and posts the jailbreak', async () => {
    const g = await inPenjara()
    await scan(g, g.wei.token)
    now += 9_999
    await poll(g)
    expect(await jailedIds(g)).toHaveLength(2)
    now += 1
    const v = await poll(g)
    expect(await jailedIds(g)).toEqual([])
    expect(v.rescue).toBeNull()
    expect(v.feed[0].text).toBe('Jailbreak! 2 Dikejar free.')
    expect(await events(g, 'jailbreak')).toMatchObject([{ actor_id: g.wei.playerId, data: { freed: 2 } }])
    const freed = (await store.players(g.gameId)).filter((p) => p.id === g.aina.playerId || p.id === g.hafiz.playerId)
    expect(freed.every((p) => p.freed_once && p.freed_at === new Date(now).toISOString())).toBe(true)
    // Settled once: another poll frees and posts nothing more.
    now += 5_000
    await poll(g)
    expect(await events(g, 'jailbreak')).toHaveLength(1)
  })

  it('catching the rescuer at +5 s fails it: the catch counts and nobody gets out (Review Focus 1)', async () => {
    const g = await inPenjara()
    await scan(g, g.wei.token)
    now += 5_000
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(14) })).toMatchObject({ ok: true })
    expect((await store.gameByCode(g.code))!.rescue).toBeNull()
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.feed[0].text).toBe('Rescue failed. Nobody gets out.')
    expect(v.rescue).toBeNull()
    now += 10_000
    await poll(g)
    expect(await jailedIds(g)).toEqual([g.aina.playerId, g.hafiz.playerId, g.wei.playerId])
    expect(await events(g, 'jailbreak')).toEqual([])
    expect(await events(g, 'rescue-failed')).toHaveLength(1)
  })

  it('a second scan at +3 s joins: the hold keeps its time, and success still comes at +10 s (Review Focus 3)', async () => {
    const g = await inPenjara()
    const t = now
    await scan(g, g.wei.token)
    now = t + 3_000
    expect(await scan(g, g.mei.token)).toEqual({ ok: true, rescue: 'joined', endsAt: t + RESCUE_HOLD_MS })
    expect((await store.gameByCode(g.code))!.rescue).toEqual({ by: g.wei.playerId, startedAt: new Date(t).toISOString(), joiners: [g.mei.playerId] })
    expect(await events(g, 'rescue-started')).toHaveLength(1)
    now = t + 9_000
    await poll(g)
    expect(await jailedIds(g)).toHaveLength(2)
    now = t + RESCUE_HOLD_MS
    await poll(g)
    expect(await jailedIds(g)).toEqual([])
  })

  it('catching the first rescuer fails the rescue even with a joiner still close (Review Focus 3)', async () => {
    const g = await inPenjara()
    await scan(g, g.wei.token)
    now += 3_000
    await scan(g, g.mei.token)
    now += 2_000
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(14) })
    now += 10_000
    await poll(g)
    expect(await jailedIds(g)).toEqual([g.aina.playerId, g.hafiz.playerId, g.wei.playerId])
    expect(await events(g, 'rescue-failed')).toHaveLength(1)
  })

  it('a 2-minute pause at +4 s freezes the hold: after resuming it still needs 6 s more (Review Focus 2)', async () => {
    const g = await inPenjara()
    const t = now
    await scan(g, g.wei.token)
    now = t + 4_000
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now = t + 4_000 + 2 * MIN
    const during = await poll(g)
    expect(await jailedIds(g)).toHaveLength(2)
    expect(during.rescue!.endsAt - during.now).toBe(6_000)
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    expect((await poll(g)).rescue!.endsAt).toBe(now + 6_000)
    now += 5_999
    await poll(g)
    expect(await jailedIds(g)).toHaveLength(2)
    now += 1
    await poll(g)
    expect(await jailedIds(g)).toEqual([])
  })

  it('the clock running out during the hold ends the game with no jailbreak (Review Focus 2)', async () => {
    const g = await inPenjara({ lengthMin: 15 }) // the chase ends at +20 min
    for (let m = 8; m <= 19; m++) {
      now = T0 + m * MIN
      await run('location', { code: g.code, token: g.wei.token, ...at(10) })
      await run('location', { code: g.code, token: g.mei.token, ...at(10) })
    }
    now = T0 + 20 * MIN - 5_000
    expect(await scan(g, g.wei.token)).toMatchObject({ ok: true, rescue: 'started' })
    now = T0 + 20 * MIN + 5_000
    const v = await poll(g)
    expect(v.phase).toBe('ended')
    expect(v.rescue).toBeNull()
    expect((await store.gameByCode(g.code))!.rescue).toBeNull()
    expect(await jailedIds(g)).toEqual([g.aina.playerId, g.hafiz.playerId])
    expect(await events(g, 'jailbreak')).toEqual([])
  })

  it("Dato Seri's Settle during a hold still frees at once; the hold then frees whoever is left", async () => {
    const g = await inPenjara()
    const dato = await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'dato', station: null })
    await scan(g, g.wei.token)
    now += 2_000
    await store.updatePlayers([{ id: g.mei.playerId, patch: { jailed: true, caught_by: g.ben.playerId, caught_at: new Date(now).toISOString() } }])
    expect(await run('settle', { code: g.code, token: g.aina.token, qr: JAIL_QR, targetIds: [g.hafiz.playerId], ...at(10) })).toEqual({
      ok: true,
      freedIds: [g.aina.playerId, g.hafiz.playerId],
    })
    expect(await jailedIds(g)).toEqual([g.mei.playerId])
    expect((await store.powerUps(g.gameId)).find((u) => u.id === dato.id)!.used_at).not.toBeNull()
    now += 8_000
    expect((await poll(g)).feed[0].text).toBe('Jailbreak! 1 Dikejar free.')
    expect(await jailedIds(g)).toEqual([])
  })

  it("the rescuer's fixes are the heartbeat: none is dropped by the location gap, and one clearly outside fails it", async () => {
    const g = await inPenjara()
    const t = now
    await scan(g, g.wei.token)
    for (const ms of [1_500, 3_000, 4_500]) {
      now = t + ms
      await run('location', { code: g.code, token: g.wei.token, ...at(12) })
    }
    const weiFixes = (await store.positions(g.gameId, new Date(t).toISOString()))[g.wei.playerId]
    expect(weiFixes).toHaveLength(4) // the scan's own fix, then every 1.5 s
    // A poor fix (accuracy 50 m) far away is ignored...
    now = t + 6_000
    await run('location', { code: g.code, token: g.wei.token, ...at(60), accuracy_m: 50 })
    expect((await store.gameByCode(g.code))!.rescue).not.toBeNull()
    // ...but a good one 60 m away fails the rescue at once.
    now = t + 7_500
    await run('location', { code: g.code, token: g.wei.token, ...at(60), accuracy_m: 5 })
    expect((await store.gameByCode(g.code))!.rescue).toBeNull()
    expect((await poll(g)).feed[0].text).toBe('Rescue failed. Nobody gets out.')
    expect(await jailedIds(g)).toHaveLength(2)
    // Still free, so they can try again.
    now = t + 9_000
    expect(await scan(g, g.wei.token)).toMatchObject({ ok: true, rescue: 'started' })
  })

  it('a fix sent during a safety pause is not judged after resuming: still holding, then success', async () => {
    const g = await inPenjara()
    const t = now
    await scan(g, g.wei.token)
    now = t + 4_000
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    // Phones keep sending while paused. The resumed window starts inside the pause, so this 60 m fix lands in it.
    now = t + 4_000 + 118_000
    expect(await run('location', { code: g.code, token: g.wei.token, ...at(60), accuracy_m: 5 })).toEqual({ ok: true })
    now = t + 4_000 + 2 * MIN
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    const resumed = now
    await poll(g)
    expect((await store.gameByCode(g.code))!.rescue).not.toBeNull()
    expect(await jailedIds(g)).toHaveLength(2)
    expect(await events(g, 'rescue-failed')).toEqual([])
    now = resumed + 6_000
    await poll(g)
    expect(await events(g, 'rescue-failed')).toEqual([])
    expect(await jailedIds(g)).toEqual([])
  })

  it('a rescuer who goes out some other way (Luar Garisan, removed) fails the rescue at the next poll', async () => {
    const g = await inPenjara()
    await scan(g, g.wei.token)
    now += 3_000
    await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.wei.playerId })
    now += 1_000
    await poll(g)
    expect((await store.gameByCode(g.code))!.rescue).toBeNull()
    expect(await events(g, 'rescue-failed')).toHaveLength(1)
    now += 10_000
    await poll(g)
    expect(await jailedIds(g)).toHaveLength(2)
  })
})

describe('long games', () => {
  /** Mimics Supabase's default 1,000-row response cap on any bulk position read. */
  class CappedStore extends MemoryStore {
    async positions(gameId: string, sinceIso: string) {
      const all = await super.positions(gameId, sinceIso)
      let budget = 1000
      const out: typeof all = {}
      for (const [id, list] of Object.entries(all)) {
        out[id] = list.slice(0, Math.max(0, budget))
        budget -= out[id].length
      }
      return out
    }
  }

  it('marshals still see the latest position after thousands of location updates', async () => {
    store = new CappedStore(() => now)
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    for (let i = 0; i < 1200; i++) {
      now = T0 + 6 * MIN + i * 2000
      await run('location', { code: g.code, token: g.ben.token, ...at(i) })
      // The runners send a location every 2 minutes (every 60th 2 s step), so nobody is auto-jailed and the game keeps going.
      if (i % 60 === 0) {
        await run('location', { code: g.code, token: g.aina.token, ...at(20) })
        await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
      }
    }
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    const ben = v.dots.find((d) => d.id === g.ben.playerId)!
    expect(ben.lat).toBeCloseTo(CENTER.lat + 1199 / 111_195, 6)
  })
})

describe('fresh locations sent with scans', () => {
  it("records the chaser's current coordinates sent with a catch", async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    now = T0 + 9 * MIN // the chaser's streamed fix is missing; the scan carries a fresh one
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7), ...at(0) })).toMatchObject({ ok: true })
  })

  it('rejects a jailbreak from an old position near the jail', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
    now = T0 + 12 * MIN
    expect(await run('jailbreak', { code: g.code, token: g.hafiz.token, qr: JAIL_QR })).toEqual({
      ok: false,
      reason: 'too-far-from-jail',
    })
    expect(await run('jailbreak', { code: g.code, token: g.hafiz.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true })
  })
})

describe('choosing the play area', () => {
  it('builds the circle at the chosen centre and size', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, radiusM: 300, organiserToken })
    const g = (await store.gameByCode(code))!
    const { distanceM } = await import('../../shared/geo.js')
    expect(distanceM(CENTER, g.arena.boundary[0])).toBeCloseTo(300, 0)
  })

  it('defaults to 200 m', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken })
    const { distanceM } = await import('../../shared/geo.js')
    expect(distanceM(CENTER, (await store.gameByCode(code))!.arena.boundary[0])).toBeCloseTo(200, 0)
  })

  it('rejects a play area smaller than 100 m or larger than 500 m', async () => {
    const organiserToken = await createOrganiser()
    await rejects(run('create', { arenaId: 'around-me', center: CENTER, radiusM: 50, organiserToken }), 400, 'Play area')
    await rejects(run('create', { arenaId: 'around-me', center: CENTER, radiusM: 900, organiserToken }), 400, 'Play area')
  })
})

describe('power-up stations', () => {
  const S1 = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const atS1 = { lat: S1.lat, lng: S1.lng, accuracy_m: 8 }

  async function chasingWithStation() {
    const g = await readyGame({}, { stations: [S1] })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const game = (await store.gameByCode(g.code))!
    return { ...g, gameId: game.id }
  }

  async function give(gameId: string, playerId: string, kind: PowerUpKind) {
    return store.addPowerUp({ game_id: gameId, player_id: playerId, kind, station: 1 })
  }

  it('create keeps the stations placed on the map', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, stations: [S1], organiserToken })
    expect((await store.gameByCode(code))!.arena.stations).toEqual([S1])
  })

  it('create rejects a station outside the play area (400)', async () => {
    const organiserToken = await createOrganiser()
    const far = { lat: CENTER.lat + 400 / 111_195, lng: CENTER.lng }
    await rejects(run('create', { arenaId: 'around-me', center: CENTER, stations: [far], organiserToken }), 400, 'inside the play area')
  })

  it('claim at a station gives the player a power-up for their role and logs a pickup', async () => {
    const g = await chasingWithStation()
    const r = await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })
    expect(r.ok).toBe(true)
    expect(['decoy', 'shield', 'cloak']).toContain(r.kind)
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.hand).toHaveLength(1)
    expect(v.feed[0].text).toBe('Aina picked up a power-up')
  })

  it('a Core game only ever deals Durian and Ponteng to runners, in deck order', async () => {
    const g = await chasingWithStation()
    const r = await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })
    const seed = (await store.gameByCode(g.code))!.deck_seed
    expect(r.kind).toBe(cardAt(`${seed}:runner`, deckFor('core', 'runner', 1), 0))
    expect(['shield', 'cloak']).toContain(r.kind)
  })

  it("the deck's order comes from a secret seed that no player ever sees", async () => {
    const g = await chasingWithStation()
    const seed = (await store.gameByCode(g.code))!.deck_seed
    expect(seed).toMatch(/^.{16,}$/)
    expect(seed).not.toContain(g.gameId)
    for (const token of [g.aina.token, g.ben.token]) {
      expect(JSON.stringify(await run('state', { code: g.code, token }))).not.toContain(seed!)
    }
  })

  it('a second claim while the slot is full is refused and draws nothing', async () => {
    const g = await chasingWithStation()
    await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'cloak', station: 9 })
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })).toEqual({
      ok: false,
      reason: 'hand-full',
      busyKind: 'cloak',
      busyRunning: false,
    })
    expect((await store.gameByCode(g.code))!.runner_draws ?? 0).toBe(0)
  })

  it('two runners claiming different stations at the same moment draw different cards', async () => {
    const S2 = { lat: CENTER.lat - 100 / 111_195, lng: CENTER.lng }
    const g = await readyGame({}, { stations: [S1, S2] })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await Promise.all([
      run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 }),
      run('claim', { code: g.code, token: g.hafiz.token, qr: stationQr(2), lat: S2.lat, lng: S2.lng, accuracy_m: 8 }),
    ])
    expect((await store.gameByCode(g.code))!.runner_draws).toBe(2)
  })

  it('a game started before decks existed still deals cards', async () => {
    const g = await chasingWithStation()
    await store.updateGame(g.gameId, { runner_sets: null, chaser_sets: null })
    const r = await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })
    expect(r.ok).toBe(true)
  })

  it('claim from far away is rejected and gives nothing', async () => {
    const g = await chasingWithStation()
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...at(0) })).toEqual({
      ok: false,
      reason: 'too-far',
    })
  })

  it('usePowerup rejects a used, foreign or jailed use', async () => {
    const g = await chasingWithStation()
    const decoy = await give(g.gameId, g.aina.playerId, 'decoy')
    expect(await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: decoy.id })).toEqual({ ok: true, kind: 'decoy' })
    expect(await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: decoy.id })).toEqual({
      ok: false,
      reason: 'already-used',
    })
    const cloak = await give(g.gameId, g.aina.playerId, 'cloak')
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: cloak.id })).toEqual({
      ok: false,
      reason: 'not-yours',
    })
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
    expect(await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: cloak.id })).toEqual({
      ok: false,
      reason: 'cannot-use',
    })
  })

  it("a Mat Rempit bonus reveal doesn't make an on-time check-in look missed", async () => {
    const g = await chasingWithStation()
    now = T0 + 9 * MIN + 40_000 // inside ping 1's window (alert 9:15, reveal 10:00)
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    now = T0 + 10 * MIN + 5_000
    await run('state', { code: g.code, token: g.ben.token })
    const flare = await give(g.gameId, g.ben.playerId, 'flare')
    now = T0 + 10 * MIN + 10_000
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: flare.id })).toMatchObject({ ok: true })
    now = T0 + 10 * MIN + 20_000 // "Check in now": Aina sends a fresh fix for the bonus ping
    await run('location', { code: g.code, token: g.aina.token, ...at(25) })
    now = T0 + 13 * MIN
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.checkin).toMatchObject({ state: 'early', missedInRow: 0 })
  })

  it('flare adds a bonus ping that pushes now and reveals in 30 s', async () => {
    const g = await chasingWithStation()
    const flare = await give(g.gameId, g.ben.playerId, 'flare')
    pushes = []
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: flare.id })).toEqual({ ok: true, kind: 'flare' })
    await run('state', { code: g.code, token: g.ben.token })
    expect(pushes.map((p) => p.payload)).toContainEqual({ type: 'checkin', code: g.code, seq: BONUS_SEQ_BASE, revealAt: now + 30_000 })
    now += 30_000
    const v = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(v.lastRevealAt).toBe(now)
    expect(v.feed.map((f) => f.text)).toContain('A Kejar used Mat Rempit.')
  })

  it('flare with under 30 s left is too-late and not spent', async () => {
    const g = await chasingWithStation()
    const flare = await give(g.gameId, g.ben.playerId, 'flare')
    await keepCheckingIn(g, 8, 49)
    now = T0 + 50 * MIN - 20_000
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: flare.id })).toEqual({
      ok: false,
      reason: 'too-late',
    })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === flare.id)!.used_at).toBeNull()
  })

  it('an active shield blocks the next catch once, then the runner can be caught', async () => {
    const g = await chasingWithStation()
    const shield = await give(g.gameId, g.aina.playerId, 'shield')
    await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: shield.id })
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({ ok: false, reason: 'shielded', name: 'Aina' })
    const v = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(v.feed[0].text).toBe('#07 blocked a catch with Durian.')
    // The same chaser can't camp the runner: a rescan is locked out for the game.
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({ ok: false, reason: 'durian-locked', name: 'Aina' })
  })
})

describe('review fixes', () => {
  const S1 = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const atS1 = { lat: S1.lat, lng: S1.lng, accuracy_m: 8 }
  async function chasingWithStation() {
    const g = await readyGame({}, { stations: [S1] })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    return { ...g, gameId: (await store.gameByCode(g.code))!.id }
  }
  const give = (gameId: string, playerId: string, kind: PowerUpKind) =>
    store.addPowerUp({ game_id: gameId, player_id: playerId, kind, station: 1 })

  it('after a Flare, later pings still show runners where they checked in', async () => {
    const g = await chasingWithStation()
    const flare = await give(g.gameId, g.ben.playerId, 'flare')
    await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: flare.id })
    now += 30_000
    await run('location', { code: g.code, token: g.aina.token, ...at(50) })
    await run('state', { code: g.code, token: g.ben.token }) // flare reveal
    now = T0 + 10 * MIN - 5_000
    await run('location', { code: g.code, token: g.aina.token, ...at(150) }) // checks in for the scheduled ping
    now = T0 + 10 * MIN + 1_000
    await run('state', { code: g.code, token: g.ben.token }) // scheduled reveal
    now = T0 + 10 * MIN + 20_000
    await run('location', { code: g.code, token: g.aina.token, ...at(250) }) // runs on after the ping
    const v = await run<View>('state', { code: g.code, token: g.ben.token })
    const dot = v.dots.find((d) => d.id === g.aina.playerId)!
    expect(dot.missed).toBeUndefined()
    expect(Math.abs((dot.lat - CENTER.lat) * 111_195 - 150)).toBeLessThan(20)
  })

  it('a double-tapped power-up is used only once', async () => {
    const g = await chasingWithStation()
    const decoy = await give(g.gameId, g.aina.playerId, 'decoy')
    const results = await Promise.all([
      run('usePowerup', { code: g.code, token: g.aina.token, powerupId: decoy.id }),
      run('usePowerup', { code: g.code, token: g.aina.token, powerupId: decoy.id }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const events = await store.events(g.gameId)
    expect(events.filter((e) => e.type === 'used')).toHaveLength(1)
  })

  it('two Mat Rempits at the same moment: one works, the other is refused and not spent', async () => {
    const g = await chasingWithStation()
    const [f1, f2] = [await give(g.gameId, g.ben.playerId, 'flare'), await give(g.gameId, g.ben.playerId, 'flare')]
    const results = await Promise.all([
      run('usePowerup', { code: g.code, token: g.ben.token, powerupId: f1.id }),
      run('usePowerup', { code: g.code, token: g.ben.token, powerupId: f2.id }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'flare-pending', readyInMs: 30_000 + 3 * MIN })
    expect((await store.pings(g.gameId)).filter((p) => p.seq >= BONUS_SEQ_BASE)).toHaveLength(1)
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'flare' && u.used_at === null)).toHaveLength(1)
  })

  it('a team waits for the surprise ping, then 3 minutes, before the next Mat Rempit', async () => {
    const g = await chasingWithStation()
    const [f1, f2] = [await give(g.gameId, g.ben.playerId, 'flare'), await give(g.gameId, g.ben.playerId, 'flare')]
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: f1.id })).toEqual({ ok: true, kind: 'flare' })
    // Ben's own first Mat Rempit is still running, which is refused before the team-wide check (Nasi Lemak KFC).
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: f2.id })).toEqual({ ok: false, reason: 'effect-running' })
    now += 30_000 // the surprise ping reveals
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    now += 60_000
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: f2.id })).toEqual({
      ok: false,
      reason: 'flare-cooldown',
      readyInMs: 120_000,
    })
    now += 120_000
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: f2.id })).toEqual({ ok: true, kind: 'flare' })
  })


  it('two players scanning one station at the same moment: only one gets a power-up', async () => {
    const g = await chasingWithStation()
    const results = await Promise.all([
      run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 }),
      run('claim', { code: g.code, token: g.hafiz.token, qr: stationQr(1), ...atS1 }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: 'locked' })
    expect(await store.powerUps(g.gameId)).toHaveLength(1)
  })

  it('a double-tapped claim gives only one power-up', async () => {
    const g = await chasingWithStation()
    const results = await Promise.all([
      run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 }),
      run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await store.powerUps(g.gameId)).toHaveLength(1)
  })

  it('one Shield blocks only one of two simultaneous catches', async () => {
    const g = await chasingWithStation()
    const shield = await give(g.gameId, g.aina.playerId, 'shield')
    await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: shield.id })
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    const results = await Promise.all([
      run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) }),
      run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) }),
    ])
    expect(results.map((r) => (r.ok ? 'caught' : r.reason)).sort()).toEqual(['caught', 'shielded'])
  })

  it('Durian locks the stung chaser off that runner for the game and gives others a 15 s head start', async () => {
    const g = await readyGame({}, { stations: [S1] })
    const kim = await run('join', { code: g.code, name: 'Kim', accepted: true })
    await run('setRoles', {
      code: g.code,
      organiserToken: g.organiserToken,
      roles: { [g.ben.playerId]: 'chaser', [kim.playerId]: 'chaser', [g.aina.playerId]: 'runner', [g.hafiz.playerId]: 'runner' },
    })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    const shield = await give(gameId, g.aina.playerId, 'shield')
    await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: shield.id })
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({ ok: false, reason: 'shielded', name: 'Aina' })
    now += 5_000
    await run('location', { code: g.code, token: kim.token, ...at(0) })
    expect(await run('catch', { code: g.code, token: kim.token, tagQr: tagQr(7) })).toEqual({ ok: false, reason: 'durian-head-start', name: 'Aina' })
    now += 11_000
    await run('location', { code: g.code, token: kim.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    expect(await run('catch', { code: g.code, token: kim.token, tagQr: tagQr(7) })).toMatchObject({ ok: true })
    // Simulate a marshal undo (Task 5): the runner is free again. Ben is still locked out, 20 min on.
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: false } }])
    now += 20 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({ ok: false, reason: 'durian-locked', name: 'Aina' })
  })
})

describe('Toyol and Ah Long', () => {
  const S1 = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  async function chasing() {
    const g = await readyGame({}, { stations: [S1] })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    return { ...g, gameId: (await store.gameByCode(g.code))!.id }
  }
  let station = 0
  // The unique index is one claim per player per station, so cards given to one player use different stations.
  const give = async (gameId: string, playerId: string, kind: PowerUpKind, patch: object = {}) => {
    const row = await store.addPowerUp({ game_id: gameId, player_id: playerId, kind, station: (station++ % 8) + 1 })
    if (Object.keys(patch).length) await store.updatePowerUp(row.id, patch)
    return row
  }
  const use = (g: { code: string }, token: string, powerupId: string) => run('usePowerup', { code: g.code, token, powerupId })

  it('Toyol removes a card from a chaser without giving it to the runner', async () => {
    const g = await chasing()
    const flare = await give(g.gameId, g.ben.playerId, 'flare')
    const toyol = await give(g.gameId, g.aina.playerId, 'toyol')
    const r = await use(g, g.aina.token, toyol.id)
    // The thief learns only that it worked, never whose card or what it was (power-ups §6.2).
    expect(r).toEqual({ ok: true, kind: 'toyol' })
    const rows = await store.powerUps(g.gameId)
    expect(rows.find((u) => u.id === flare.id)!.taken_at).not.toBeNull()
    expect(rows.filter((u) => u.player_id === g.aina.playerId && u.id !== toyol.id)).toHaveLength(0)
    expect(rows.find((u) => u.id === toyol.id)!.used_at).not.toBeNull()
    const vBen = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(vBen.hand).toEqual([])
    expect(vBen.feed[0].text).toBe('Toyol took your Mat Rempit!')
    const vAina = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(vAina.feed[0].text).toBe('Toyol stole a power-up!')
    expect(vAina.hand).toEqual([])
    expect(vAina.activePowerUp).toBeNull()
  })

  it('a taken card frees the victim to claim again', async () => {
    const g = await chasing()
    await give(g.gameId, g.ben.playerId, 'flare')
    const toyol = await give(g.gameId, g.aina.playerId, 'toyol')
    await use(g, g.aina.token, toyol.id)
    const r = await run('claim', { code: g.code, token: g.ben.token, qr: stationQr(1), lat: S1.lat, lng: S1.lng, accuracy_m: 8 })
    expect(r.ok).toBe(true)
  })

  it('Toyol with nothing to steal refuses and keeps the card', async () => {
    const g = await chasing()
    const toyol = await give(g.gameId, g.aina.playerId, 'toyol')
    expect(await use(g, g.aina.token, toyol.id)).toEqual({ ok: false, reason: 'nothing-to-steal' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === toyol.id)!.used_at).toBeNull()
    expect((await store.events(g.gameId)).filter((e) => e.type === 'stolen')).toHaveLength(0)
  })

  it('never takes a sealed, Dato Seri, used or already-taken card', async () => {
    const g = await chasing()
    await give(g.gameId, g.ben.playerId, 'flare', { sealed: true })
    await give(g.gameId, g.ben.playerId, 'dato')
    await give(g.gameId, g.ben.playerId, 'focus', { used_at: new Date(now).toISOString() })
    await give(g.gameId, g.ben.playerId, 'focus', { taken_at: new Date(now).toISOString() })
    const toyol = await give(g.gameId, g.aina.playerId, 'toyol')
    expect(await use(g, g.aina.token, toyol.id)).toEqual({ ok: false, reason: 'nothing-to-steal' })
  })

  it('Ah Long takes from a free runner and the feed says so without names', async () => {
    const g = await chasing()
    const along = await give(g.gameId, g.ben.playerId, 'along')
    const durian = await give(g.gameId, g.aina.playerId, 'shield')
    const r = await use(g, g.ben.token, along.id)
    expect(r).toEqual({ ok: true, kind: 'along' })
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).feed[0].text).toBe('Ah Long took your Durian!')
    expect((await run<View>('state', { code: g.code, token: g.ben.token })).feed[0].text).toBe('Ah Long came to collect!')
  })

  it('Ah Long never takes from a jailed runner', async () => {
    const g = await chasing()
    const along = await give(g.gameId, g.ben.playerId, 'along')
    await give(g.gameId, g.hafiz.playerId, 'shield')
    await store.updatePlayers([{ id: g.hafiz.playerId, patch: { jailed: true } }])
    expect(await use(g, g.ben.token, along.id)).toEqual({ ok: false, reason: 'nothing-to-steal' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === along.id)!.used_at).toBeNull()
  })

  it('two simultaneous Toyols never take the same card, and only one is spent', async () => {
    const g = await chasing()
    await give(g.gameId, g.ben.playerId, 'flare')
    const t1 = await give(g.gameId, g.aina.playerId, 'toyol')
    const t2 = await give(g.gameId, g.hafiz.playerId, 'toyol')
    const [a, b] = await Promise.all([use(g, g.aina.token, t1.id), use(g, g.hafiz.token, t2.id)])
    expect([a, b].filter((r) => r.ok)).toHaveLength(1)
    const rows = await store.powerUps(g.gameId)
    expect(rows.filter((u) => u.taken_at)).toHaveLength(1)
    expect(rows.filter((u) => u.kind === 'toyol' && u.used_at)).toHaveLength(1)
  })

  it('a card that was taken can no longer be used by its owner', async () => {
    const g = await chasing()
    const flare = await give(g.gameId, g.ben.playerId, 'flare')
    const toyol = await give(g.gameId, g.aina.playerId, 'toyol')
    await use(g, g.aina.token, toyol.id)
    expect(await use(g, g.ben.token, flare.id)).toEqual({ ok: false, reason: 'taken' })
    expect(await store.markUsed(flare.id)).toBe(false)
  })

  it('a double-tapped Toyol takes one card', async () => {
    const g = await chasing()
    await give(g.gameId, g.ben.playerId, 'flare')
    await give(g.gameId, g.ben.playerId, 'focus')
    const t = await give(g.gameId, g.aina.playerId, 'toyol')
    const rs = await Promise.all([use(g, g.aina.token, t.id), use(g, g.aina.token, t.id)])
    expect(rs.filter((r) => r.ok)).toHaveLength(1)
    expect((await store.powerUps(g.gameId)).filter((u) => u.taken_at)).toHaveLength(1)
  })
})

describe('Cheese Ais', () => {
  const S1 = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const stamp = (ms: number) => new Date(ms).toISOString()
  /** Ben, Kim and Lee chase; Aina and Hafiz run. The chase has begun. */
  async function chasing() {
    const g = await readyGame({ mode: 'full' }, { stations: [S1] })
    const kim = await run('join', { code: g.code, name: 'Kim', accepted: true })
    const lee = await run('join', { code: g.code, name: 'Lee', accepted: true })
    const wei = await run('join', { code: g.code, name: 'Wei', accepted: true })
    await run('setRoles', {
      code: g.code,
      organiserToken: g.organiserToken,
      roles: {
        [g.ben.playerId]: 'chaser',
        [kim.playerId]: 'chaser',
        [lee.playerId]: 'chaser',
        [g.aina.playerId]: 'runner',
        [g.hafiz.playerId]: 'runner',
        [wei.playerId]: 'runner',
      },
    })
    await run('linkTag', { code: g.code, token: wei.token, tagId: 9 })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    return { ...g, kim, lee, wei, gameId: (await store.gameByCode(g.code))!.id }
  }
  let station = 0
  const give = async (gameId: string, playerId: string, kind: PowerUpKind, patch: object = {}) => {
    const row = await store.addPowerUp({ game_id: gameId, player_id: playerId, kind, station: (station++ % 8) + 1 })
    if (Object.keys(patch).length) await store.updatePowerUp(row.id, patch)
    return row
  }
  const freeze = (g: { code: string }, token: string, powerupId: string, targetId: unknown) =>
    run('usePowerup', { code: g.code, token, powerupId, targetId })
  const playerRow = async (g: { gameId: string }, id: string) => (await store.players(g.gameId)).find((p) => p.id === id)!

  it('freezes the picked chaser for 3 minutes', async () => {
    const g = await chasing()
    const cheese = await give(g.gameId, g.aina.playerId, 'cheese')
    expect(await freeze(g, g.aina.token, cheese.id, g.ben.playerId)).toEqual({ ok: true, kind: 'cheese', name: 'Ben' })
    expect((await playerRow(g, g.ben.playerId)).frozen_until).toBe(stamp(now + 3 * MIN))
    const ev = (await store.events(g.gameId)).find((e) => e.type === 'frozen')!
    expect(ev).toMatchObject({ actor_id: g.aina.playerId, target_id: g.ben.playerId, data: { until: stamp(now + 3 * MIN) } })
    const vBen = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(vBen.frozenUntil).toBe(now + 3 * MIN)
    expect(vBen.feed[0]).toMatchObject({ text: 'Brain freeze! A runner froze your power-up for 3 minutes.', act: true })
    const vKim = await run<View>('state', { code: g.code, token: g.kim.token })
    expect(vKim.frozenUntil).toBeNull()
    expect(vKim.feed[0]).toMatchObject({ text: 'Brain freeze on a Kejar.', act: false })
    const vAina = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(vAina.feed[0].text).toBe('Brain freeze on a Kejar.')
    const vOrg = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(vOrg.feed[0].text).toBe("A Dikejar froze Ben's power-up")
  })

  it("a frozen chaser can't use or claim", async () => {
    const g = await chasing()
    const cheese = await give(g.gameId, g.aina.playerId, 'cheese')
    await freeze(g, g.aina.token, cheese.id, g.ben.playerId)
    const claim = () => run('claim', { code: g.code, token: g.ben.token, qr: stationQr(1), lat: S1.lat, lng: S1.lng, accuracy_m: 8 })
    expect(await claim()).toMatchObject({ ok: false, reason: 'frozen' })
    const flare = await give(g.gameId, g.ben.playerId, 'flare')
    const useFlare = () => run('usePowerup', { code: g.code, token: g.ben.token, powerupId: flare.id })
    expect(await useFlare()).toEqual({ ok: false, reason: 'frozen', frozenForMs: 3 * MIN })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === flare.id)!.used_at).toBeNull()
    now += 3 * MIN
    expect(await useFlare()).toMatchObject({ ok: true, kind: 'flare' })
    expect(await claim()).not.toMatchObject({ reason: 'frozen' })
  })

  it('no stacking: freezing a frozen chaser is refused and the card is kept', async () => {
    const g = await chasing()
    const first = await give(g.gameId, g.aina.playerId, 'cheese')
    const second = await give(g.gameId, g.hafiz.playerId, 'cheese')
    await freeze(g, g.aina.token, first.id, g.ben.playerId)
    expect(await freeze(g, g.hafiz.token, second.id, g.ben.playerId)).toEqual({ ok: false, reason: 'no-target' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === second.id)!.used_at).toBeNull()
    expect((await store.events(g.gameId)).filter((e) => e.type === 'frozen')).toHaveLength(1)
  })

  it('two runners freezing the same chaser at once: one wins', async () => {
    const g = await chasing()
    const a = await give(g.gameId, g.aina.playerId, 'cheese')
    const b = await give(g.gameId, g.hafiz.playerId, 'cheese')
    const rs = await Promise.all([freeze(g, g.aina.token, a.id, g.ben.playerId), freeze(g, g.hafiz.token, b.id, g.ben.playerId)])
    expect(rs.filter((r) => r.ok)).toHaveLength(1)
    expect(rs.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'no-target' }])
    const rows = await store.powerUps(g.gameId)
    expect(rows.filter((u) => u.kind === 'cheese' && u.used_at)).toHaveLength(1)
    expect((await store.events(g.gameId)).filter((e) => e.type === 'frozen')).toHaveLength(1)
  })

  it('refuses a target that is not a live, unfrozen chaser, and keeps the card', async () => {
    const g = await chasing()
    const cheese = await give(g.gameId, g.aina.playerId, 'cheese')
    await store.updatePlayers([
      { id: g.kim.playerId, patch: { disqualified_at: stamp(now) } },
      { id: g.lee.playerId, patch: { removed_at: stamp(now) } },
    ])
    for (const targetId of [g.hafiz.playerId, g.kim.playerId, g.lee.playerId, 'nobody', undefined]) {
      expect(await freeze(g, g.aina.token, cheese.id, targetId)).toEqual({ ok: false, reason: 'no-target' })
    }
    expect((await store.powerUps(g.gameId)).find((u) => u.id === cheese.id)!.used_at).toBeNull()
  })

  it('freezeTargets leaves out frozen, Luar Garisan and removed chasers, and is null without a Cheese Ais', async () => {
    const g = await chasing()
    const view = (token: string) => run<View>('state', { code: g.code, token })
    expect((await view(g.aina.token)).freezeTargets).toBeNull()
    const cheese = await give(g.gameId, g.aina.playerId, 'cheese')
    const names = async () => (await view(g.aina.token)).freezeTargets
    expect(await names()).toEqual([
      { id: g.ben.playerId, name: 'Ben' },
      { id: g.kim.playerId, name: 'Kim' },
      { id: g.lee.playerId, name: 'Lee' },
    ])
    expect((await view(g.hafiz.token)).freezeTargets).toBeNull()
    expect((await view(g.ben.token)).freezeTargets).toBeNull()
    await store.freezeChaser(g.ben.playerId, stamp(now + 3 * MIN))
    expect((await names())!.map((t) => t.name)).toEqual(['Kim', 'Lee'])
    await store.updatePlayers([{ id: g.kim.playerId, patch: { disqualified_at: stamp(now) } }])
    expect((await names())!.map((t) => t.name)).toEqual(['Lee'])
    await store.updatePlayers([{ id: g.lee.playerId, patch: { removed_at: stamp(now) } }])
    expect(await names()).toEqual([])
    // Once the freeze ends Ben is a target again; once the card is used there are no targets at all.
    now += 3 * MIN
    expect((await names())!.map((t) => t.name)).toEqual(['Ben'])
    await freeze(g, g.aina.token, cheese.id, g.ben.playerId)
    expect(await names()).toBeNull()
    expect((await view(g.ben.token)).frozenUntil).toBe(now + 3 * MIN)
  })

  it('an effect switched on before the freeze still lands', async () => {
    const g = await chasing()
    const focus = await give(g.gameId, g.ben.playerId, 'focus')
    const cheese = await give(g.gameId, g.aina.playerId, 'cheese')
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: focus.id })).toMatchObject({ ok: true })
    expect(await freeze(g, g.aina.token, cheese.id, g.ben.playerId)).toMatchObject({ ok: true })
    now = T0 + 9.5 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(400) })
    now = T0 + 10 * MIN
    const v = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(v.dots.find((d) => d.kind === 'runner' && d.id === g.aina.playerId)).toMatchObject({ exact: true, revealedBy: 'focus' })
  })

  it("a frozen chaser's card can still be stolen by Toyol", async () => {
    const g = await chasing()
    const flare = await give(g.gameId, g.ben.playerId, 'flare')
    const cheese = await give(g.gameId, g.aina.playerId, 'cheese')
    const toyol = await give(g.gameId, g.hafiz.playerId, 'toyol')
    await freeze(g, g.aina.token, cheese.id, g.ben.playerId)
    expect(await run('usePowerup', { code: g.code, token: g.hafiz.token, powerupId: toyol.id })).toEqual({ ok: true, kind: 'toyol' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === flare.id)!.taken_at).not.toBeNull()
  })
})

describe('Abang Grab', () => {
  const S1 ={ lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const atS1 = { lat: S1.lat, lng: S1.lng, accuracy_m: 8 }
  async function chasing() {
    const g = await readyGame({ mode: 'full' }, { stations: [S1] })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    return { ...g, gameId: (await store.gameByCode(g.code))!.id }
  }
  let station = 0
  const give = async (gameId: string, playerId: string, kind: PowerUpKind, patch: object = {}) => {
    const row = await store.addPowerUp({ game_id: gameId, player_id: playerId, kind, station: (station++ % 8) + 1 })
    if (Object.keys(patch).length) await store.updatePowerUp(row.id, patch)
    return row
  }
  const use = (g: { code: string }, token: string, powerupId: string) => run('usePowerup', { code: g.code, token, powerupId })
  const pick = (g: { code: string }, token: string, powerupId: string, choice: unknown) =>
    run('grabPick', { code: g.code, token, powerupId, choice })
  const game = async (g: { code: string }) => (await store.gameByCode(g.code))!
  const expectedOffer = async (g: { code: string }, side: 'runner' | 'chaser', first: number) => {
    const row = await game(g)
    const deck = deckFor('full', side, (side === 'runner' ? row.runner_sets : row.chaser_sets)!)
    return [0, 1, 2].map((k) => cardAt(`${row.deck_seed}:${side}`, deck, first + k))
  }

  it('shows the top 3 cards of the holder\'s deck and reserves exactly those 3 draws', async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    const before = (await game(g)).runner_draws ?? 0
    const r = await use(g, g.aina.token, grab.id)
    expect(r).toEqual({ ok: true, kind: 'grab', offer: await expectedOffer(g, 'runner', before) })
    expect((await game(g)).runner_draws).toBe(before + 3)
    expect((await game(g)).chaser_draws ?? 0).toBe(0)
    const row = (await store.powerUps(g.gameId)).find((u) => u.id === grab.id)!
    expect(row.offer).toEqual(r.offer)
    expect(row.used_at).toBeNull() // still in the slot until a card is picked
  })

  it("a chaser's Grab draws from the chasers' deck", async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.ben.playerId, 'grab')
    const r = await use(g, g.ben.token, grab.id)
    expect(r.offer).toEqual(await expectedOffer(g, 'chaser', 0))
    expect((await game(g)).chaser_draws).toBe(3)
  })

  it('opening the Grab twice shows the same offer and never draws again', async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    const a = await use(g, g.aina.token, grab.id)
    const b = await use(g, g.aina.token, grab.id)
    expect(b).toEqual(a)
    expect((await game(g)).runner_draws).toBe(3)
  })

  it('a double-tapped Grab draws once', async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    const [a, b] = await Promise.all([use(g, g.aina.token, grab.id), use(g, g.aina.token, grab.id)])
    expect(a).toEqual(b)
    expect((await game(g)).runner_draws).toBe(3)
  })

  it('while the offer is open the Grab still fills the slot', async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    await use(g, g.aina.token, grab.id)
    const r = await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })
    expect(r).toMatchObject({ ok: false, reason: 'hand-full', busyKind: 'grab' })
  })

  it('picking replaces the Grab with a sealed card of the chosen kind, held not switched on', async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    const { offer } = await use(g, g.aina.token, grab.id)
    const r = await pick(g, g.aina.token, grab.id, 1)
    expect(r).toMatchObject({ ok: true, kind: offer[1] })
    const rows = await store.powerUps(g.gameId)
    expect(rows.find((u) => u.id === grab.id)!.used_at).not.toBeNull()
    const kept = rows.find((u) => u.id === r.powerupId)!
    expect(kept).toMatchObject({ player_id: g.aina.playerId, kind: offer[1], sealed: true, station: null, used_at: null })
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.hand.map((u) => u.id)).toEqual([kept.id])
    expect(v.activePowerUp).toBeNull() // held, not switched on
    expect(v.feed[0].text).toBe('Aina picked up a power-up')
    const claim = await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })
    expect(claim).toMatchObject({ ok: false, reason: 'hand-full', busyKind: offer[1], busyRunning: false })
    expect((await game(g)).runner_draws).toBe(3) // the other two aren't put back, and the full slot drew nothing
  })

  it('refuses a bad pick cleanly and changes nothing', async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    expect(await pick(g, g.aina.token, grab.id, 0)).toEqual({ ok: false, reason: 'no-offer' })
    await use(g, g.aina.token, grab.id)
    expect(await pick(g, g.aina.token, grab.id, 3)).toEqual({ ok: false, reason: 'bad-choice' })
    expect(await pick(g, g.aina.token, grab.id, -1)).toEqual({ ok: false, reason: 'bad-choice' })
    expect(await pick(g, g.aina.token, grab.id, '1')).toEqual({ ok: false, reason: 'bad-choice' })
    expect(await pick(g, g.hafiz.token, grab.id, 0)).toEqual({ ok: false, reason: 'not-yours' })
    const other = await give(g.gameId, g.hafiz.playerId, 'shield')
    expect(await pick(g, g.hafiz.token, other.id, 0)).toEqual({ ok: false, reason: 'no-offer' })
    const rows = await store.powerUps(g.gameId)
    expect(rows).toHaveLength(2)
    expect(rows.find((u) => u.id === grab.id)!.used_at).toBeNull()
    expect((await store.events(g.gameId)).filter((e) => e.type === 'powerup')).toHaveLength(0)
  })

  it('two picks at the same moment deliver one sealed card', async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    await use(g, g.aina.token, grab.id)
    const rs = await Promise.all([pick(g, g.aina.token, grab.id, 0), pick(g, g.aina.token, grab.id, 2)])
    expect(rs.filter((r) => r.ok)).toHaveLength(1)
    expect(rs.find((r) => !r.ok)).toEqual({ ok: false, reason: 'already-used' })
    expect((await store.powerUps(g.gameId)).filter((u) => u.sealed)).toHaveLength(1)
  })

  it('a station claim right after a Grab draws the card after the offered three', async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    await use(g, g.aina.token, grab.id)
    const r = await run('claim', { code: g.code, token: g.hafiz.token, qr: stationQr(1), ...atS1 })
    expect(r.ok).toBe(true)
    expect(r.kind).toBe((await expectedOffer(g, 'runner', 3))[0])
    expect((await game(g)).runner_draws).toBe(4)
  })

  it("Toyol can't take a card Abang Grab delivered", async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.ben.playerId, 'grab')
    await use(g, g.ben.token, grab.id)
    await pick(g, g.ben.token, grab.id, 0)
    const toyol = await give(g.gameId, g.aina.playerId, 'toyol')
    expect(await use(g, g.aina.token, toyol.id)).toEqual({ ok: false, reason: 'nothing-to-steal' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === toyol.id)!.used_at).toBeNull()
  })

  it('refuses in Penjara or outside the chase, without spending the Grab or drawing', async () => {
    const g = await chasing()
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: true } }])
    expect(await use(g, g.aina.token, grab.id)).toEqual({ ok: false, reason: 'cannot-use' })
    const early = await readyGame({ mode: 'full' })
    await run('start', { code: early.code, organiserToken: early.organiserToken })
    const earlyId = (await store.gameByCode(early.code))!.id
    const g2 = await give(earlyId, early.aina.playerId, 'grab')
    expect(await run('usePowerup', { code: early.code, token: early.aina.token, powerupId: g2.id })).toEqual({ ok: false, reason: 'not-chasing' })
    const rows = [...(await store.powerUps(g.gameId)), ...(await store.powerUps(earlyId))]
    expect(rows.every((u) => u.used_at === null && u.offer === null)).toBe(true)
    expect((await game(g)).runner_draws ?? 0).toBe(0)
    expect((await store.gameByCode(early.code))!.runner_draws ?? 0).toBe(0)
  })
})

describe('Nasi Lemak KFC', () => {
  const S1 = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const atS1 = { lat: S1.lat, lng: S1.lng, accuracy_m: 8 }
  const S2 = { lat: CENTER.lat - 100 / 111_195, lng: CENTER.lng }
  const S3 = { lat: CENTER.lat, lng: CENTER.lng + 100 / (111_195 * Math.cos((CENTER.lat * Math.PI) / 180)) }
  const atS2 = { lat: S2.lat, lng: S2.lng, accuracy_m: 8 }
  const atS3 = { lat: S3.lat, lng: S3.lng, accuracy_m: 8 }
  const EXCLUDED: PowerUpKind[] = ['grab', 'combo', 'dato']
  /** Ben, Kim and Lee chase; Aina, Hafiz and Wei run. Full mode, the chase has begun. */
  async function chasing(stations: { lat: number; lng: number }[] = [S1]) {
    const g = await readyGame({ mode: 'full' }, { stations })
    const kim = await run('join', { code: g.code, name: 'Kim', accepted: true })
    const lee = await run('join', { code: g.code, name: 'Lee', accepted: true })
    const wei = await run('join', { code: g.code, name: 'Wei', accepted: true })
    await run('setRoles', {
      code: g.code,
      organiserToken: g.organiserToken,
      roles: {
        [g.ben.playerId]: 'chaser',
        [kim.playerId]: 'chaser',
        [lee.playerId]: 'chaser',
        [g.aina.playerId]: 'runner',
        [g.hafiz.playerId]: 'runner',
        [wei.playerId]: 'runner',
      },
    })
    await run('linkTag', { code: g.code, token: wei.token, tagId: 9 })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    return { ...g, kim, lee, wei, gameId: (await store.gameByCode(g.code))!.id }
  }
  // No station: a given card must not count as a claim at station 1.
  const give = async (gameId: string, playerId: string, kind: PowerUpKind, patch: object = {}) => {
    const row = await store.addPowerUp({ game_id: gameId, player_id: playerId, kind, station: null })
    if (Object.keys(patch).length) await store.updatePowerUp(row.id, patch)
    return row
  }
  const use = (g: { code: string }, token: string, powerupId: string, extra: object = {}) =>
    run('usePowerup', { code: g.code, token, powerupId, ...extra })
  const view = (g: { code: string }, token: string) => run<View>('state', { code: g.code, token })
  /** A doubled card in the player's hand: the card and its twin, made the way a delivery makes them. */
  async function doubled(gameId: string, playerId: string, kind: PowerUpKind) {
    await give(gameId, playerId, 'combo', { used_at: new Date(now).toISOString() })
    const first = await give(gameId, playerId, kind)
    const twin = (await store.applyCombo(playerId, first.id))!
    return { first, twin }
  }
  /** Moves the side's deck to the next draw whose card passes `want`. */
  async function forceDraw(g: { code: string }, side: 'runner' | 'chaser', want: (k: PowerUpKind) => boolean) {
    const row = (await store.gameByCode(g.code))!
    const deck = deckFor('full', side, (side === 'runner' ? row.runner_sets : row.chaser_sets)!)
    const from = (side === 'runner' ? row.runner_draws : row.chaser_draws) ?? 0
    let i = from
    while (!want(cardAt(`${row.deck_seed}:${side}`, deck, i))) i++
    await store.updateGame(row.id, side === 'runner' ? { runner_draws: i } : { chaser_draws: i })
    return cardAt(`${row.deck_seed}:${side}`, deck, i)
  }
  const scan = async (g: { code: string }, chaser: { token: string }, tagId: number, runner: { token: string }) => {
    await run('location', { code: g.code, token: chaser.token, ...at(0) })
    await run('location', { code: g.code, token: runner.token, ...at(10) })
    return run('catch', { code: g.code, token: chaser.token, tagQr: tagQr(tagId) })
  }

  it('using it frees the slot and the next station card arrives doubled', async () => {
    const g = await chasing()
    const combo = await give(g.gameId, g.aina.playerId, 'combo')
    expect(await use(g, g.aina.token, combo.id)).toEqual({ ok: true, kind: 'combo' })
    const ev = (await store.events(g.gameId)).find((e) => e.type === 'used')!
    expect(ev).toMatchObject({ actor_id: g.aina.playerId, data: { kind: 'combo' } })
    let v = await view(g, g.aina.token)
    expect(v.comboReady).toBe(true)
    expect(v.hand).toEqual([])
    expect(v.activePowerUp).toBeNull()
    expect(v.feed.map((f) => f.text).join('|')).not.toMatch(/Nasi|combo/i)
    const kind = await forceDraw(g, 'runner', (k) => !EXCLUDED.includes(k))
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })).toEqual({ ok: true, kind, double: true })
    const mine = (await store.powerUps(g.gameId)).filter((u) => u.player_id === g.aina.playerId && u.kind === kind)
    expect(mine).toHaveLength(2)
    const original = mine.find((u) => u.twin_of === null)!
    expect(mine.find((u) => u.twin_of !== null)!.twin_of).toBe(original.id)
    v = await view(g, g.aina.token)
    expect(v.comboReady).toBe(false)
    expect(v.hand.map((u) => u.kind)).toEqual([kind, kind])
    expect((await view(g, g.hafiz.token)).comboReady).toBe(false)
  })

  it('a Nasi Lemak KFC drawn at a station while combo ready arrives normally and the mark stays', async () => {
    const g = await chasing()
    await give(g.gameId, g.aina.playerId, 'combo', { used_at: new Date(now).toISOString() })
    expect(await forceDraw(g, 'runner', (k) => k === 'combo')).toBe('combo')
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })).toEqual({ ok: true, kind: 'combo' })
    const v = await view(g, g.aina.token)
    expect(v.comboReady).toBe(true)
    expect(v.hand.map((u) => u.kind)).toEqual(['combo'])
  })

  it('a Nasi Lemak KFC picked from an Abang Grab offer while combo ready arrives normally and the mark stays', async () => {
    const g = await chasing()
    await give(g.gameId, g.aina.playerId, 'combo', { used_at: new Date(now).toISOString() })
    await forceDraw(g, 'runner', (k) => k === 'combo')
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    const { offer } = await use(g, g.aina.token, grab.id)
    const choice = (offer as PowerUpKind[]).indexOf('combo')
    expect(choice).toBeGreaterThanOrEqual(0)
    const r = await run('grabPick', { code: g.code, token: g.aina.token, powerupId: grab.id, choice })
    expect(r).toMatchObject({ ok: true, kind: 'combo' })
    expect(r).not.toHaveProperty('double')
    const v = await view(g, g.aina.token)
    expect(v.comboReady).toBe(true)
    expect(v.hand.map((u) => u.kind)).toEqual(['combo'])
  })

  it("using a second Nasi Lemak KFC while combo ready is accepted and spent, frees the slot, and doesn't stack", async () => {
    const g = await chasing([S1, S2])
    await give(g.gameId, g.aina.playerId, 'combo', { used_at: new Date(now).toISOString() })
    await forceDraw(g, 'runner', (k) => k === 'combo')
    await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })
    const second = (await view(g, g.aina.token)).hand[0]
    expect(await use(g, g.aina.token, second.id)).toEqual({ ok: true, kind: 'combo', wasted: true })
    const rows = (await store.powerUps(g.gameId)).filter((u) => u.kind === 'combo')
    expect(rows.find((u) => u.id === second.id)).toMatchObject({ used_at: expect.any(String), consumed_at: expect.any(String) })
    expect(rows.filter((u) => u.used_at && !u.consumed_at)).toHaveLength(1)
    const v = await view(g, g.aina.token)
    expect(v.hand).toEqual([])
    expect(v.comboReady).toBe(true)
    // The slot is free again: a later station claim succeeds, and arrives doubled by the one mark.
    const kind = await forceDraw(g, 'runner', (k) => !EXCLUDED.includes(k))
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(2), ...atS2 })).toEqual({ ok: true, kind, double: true })
  })

  it('only the next one delivered card is doubled after a wasted second combo', async () => {
    const g = await chasing([S1, S2, S3])
    await give(g.gameId, g.aina.playerId, 'combo', { used_at: new Date(now).toISOString() })
    await forceDraw(g, 'runner', (k) => k === 'combo')
    await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })
    const second = (await view(g, g.aina.token)).hand[0]
    expect(await use(g, g.aina.token, second.id)).toMatchObject({ wasted: true })
    const kind = await forceDraw(g, 'runner', (k) => !EXCLUDED.includes(k))
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(2), ...atS2 })).toEqual({ ok: true, kind, double: true })
    for (const u of (await view(g, g.aina.token)).hand) {
      // Clear the slot whatever the (random) card is: a used cloak, decoy or flare stays "running" until a reveal,
      // so mark the pair taken, which frees the slot for any kind.
      await store.updatePowerUp(u.id, { taken_at: new Date(now).toISOString() })
    }
    const next = await forceDraw(g, 'runner', (k) => !EXCLUDED.includes(k))
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(3), ...atS3 })).toEqual({ ok: true, kind: next })
    const v = await view(g, g.aina.token)
    expect(v.hand.map((u) => u.kind)).toEqual([next])
    expect(v.comboReady).toBe(false)
  })

  it('Abang Grab delivers the doubled card', async () => {
    const g = await chasing()
    await give(g.gameId, g.aina.playerId, 'combo', { used_at: new Date(now).toISOString() })
    const grab = await give(g.gameId, g.aina.playerId, 'grab')
    const { offer } = await use(g, g.aina.token, grab.id)
    const choice = (offer as PowerUpKind[]).findIndex((k) => !EXCLUDED.includes(k))
    expect(choice).toBeGreaterThanOrEqual(0)
    const r = await run('grabPick', { code: g.code, token: g.aina.token, powerupId: grab.id, choice })
    expect(r).toMatchObject({ ok: true, kind: offer[choice], double: true })
    const v = await view(g, g.aina.token)
    expect(v.hand.map((u) => u.kind)).toEqual([offer[choice], offer[choice]])
    expect(v.hand.every((u) => u.sealed)).toBe(true)
    expect(v.comboReady).toBe(false)
  })

  it('an excluded card keeps the combo for the card after', async () => {
    const g = await chasing()
    await give(g.gameId, g.aina.playerId, 'combo', { used_at: new Date(now).toISOString() })
    expect(await forceDraw(g, 'runner', (k) => k === 'grab')).toBe('grab')
    const r = await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })
    expect(r).toEqual({ ok: true, kind: 'grab' })
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'grab')).toHaveLength(1)
    expect((await view(g, g.aina.token)).comboReady).toBe(true)
  })

  it("a doubled Gostan can't land both uses on one ping", async () => {
    const g = await chasing()
    const { first, twin } = await doubled(g.gameId, g.aina.playerId, 'decoy')
    expect(await use(g, g.aina.token, first.id)).toEqual({ ok: true, kind: 'decoy' })
    expect(await use(g, g.aina.token, twin.id)).toEqual({ ok: false, reason: 'effect-running' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === twin.id)!.used_at).toBeNull()
    now = T0 + 9.5 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    now = T0 + 10 * MIN + 1_000
    await run('state', { code: g.code, organiserToken: g.organiserToken }) // the scheduled reveal
    expect(await use(g, g.aina.token, twin.id)).toEqual({ ok: true, kind: 'decoy' })
  })

  it("a doubled Mat Rempit's second use still waits for the cooldown", async () => {
    const g = await chasing()
    const { first, twin } = await doubled(g.gameId, g.ben.playerId, 'flare')
    expect(await use(g, g.ben.token, first.id)).toEqual({ ok: true, kind: 'flare' })
    expect(await use(g, g.ben.token, twin.id)).toEqual({ ok: false, reason: 'effect-running' })
    now += 30_000 // the surprise ping reveals
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    expect(await use(g, g.ben.token, twin.id)).toEqual({ ok: false, reason: 'flare-cooldown', readyInMs: 3 * MIN })
    now += 3 * MIN
    expect(await use(g, g.ben.token, twin.id)).toEqual({ ok: true, kind: 'flare' })
  })

  it('a doubled Durian blocks two catches, one after the other', async () => {
    const g = await chasing()
    const { first, twin } = await doubled(g.gameId, g.aina.playerId, 'shield')
    expect(await use(g, g.aina.token, first.id)).toEqual({ ok: true, kind: 'shield' })
    const rows = await store.powerUps(g.gameId)
    expect(rows.find((u) => u.id === twin.id)!.used_at).not.toBeNull() // one tap switches both on
    expect(await use(g, g.aina.token, twin.id)).toEqual({ ok: false, reason: 'already-used' })
    const usedAt = now
    expect((await view(g, g.aina.token)).activeEndsAt).toBe(usedAt + 10 * MIN)
    now += 2 * MIN
    expect(await scan(g, g.ben, 7, g.aina)).toEqual({ ok: false, reason: 'shielded', name: 'Aina' })
    // The first half blocked early: the second runs its own fresh 10 minutes from that block.
    const blockedAt = now
    expect((await view(g, g.aina.token)).activeEndsAt).toBe(blockedAt + 10 * MIN)
    now += 20_000
    expect(await scan(g, g.kim, 7, g.aina)).toEqual({ ok: false, reason: 'shielded', name: 'Aina' })
    now += 20_000
    expect(await scan(g, g.lee, 7, g.aina)).toMatchObject({ ok: true })
    // The second block stings too: Kim stays locked off Aina for the game, even once she's free again.
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: false } }])
    now += 20 * MIN
    expect(await scan(g, g.kim, 7, g.aina)).toEqual({ ok: false, reason: 'durian-locked', name: 'Aina' })
  })

  it('the unused twin keeps the slot busy until the second use', async () => {
    const g = await chasing()
    const { first, twin } = await doubled(g.gameId, g.aina.playerId, 'decoy')
    const claim = () => run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })
    expect(await claim()).toMatchObject({ ok: false, reason: 'hand-full', busyKind: 'decoy', busyRunning: false })
    expect(await use(g, g.aina.token, first.id)).toEqual({ ok: true, kind: 'decoy' })
    now = T0 + 9.5 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    now = T0 + 10 * MIN + 1_000
    await run('state', { code: g.code, organiserToken: g.organiserToken }) // the first half's ping lands
    // The first half is done, but the twin is still held.
    expect(await claim()).toMatchObject({ ok: false, reason: 'hand-full', busyKind: 'decoy', busyRunning: false })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === twin.id)!.used_at).toBeNull()
  })

  it("a doubled Durian's second shield arms when the first runs out unused", async () => {
    const g = await chasing()
    const { twin } = await doubled(g.gameId, g.aina.playerId, 'shield')
    // Tapping the twin row first switches the pair on just the same.
    expect(await use(g, g.aina.token, twin.id)).toEqual({ ok: true, kind: 'shield' })
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'shield' && u.used_at)).toHaveLength(2)
    await keepCheckingIn(g, 8, 17) // ten minutes on, with no catch tried
    now = T0 + 17 * MIN
    // The first half ran out unused: the second shows its own fresh 10 minutes, not 0:00.
    const v = await view(g, g.aina.token)
    expect(v.shieldActive).toBe(true)
    expect(v.activeEndsAt).toBe(T0 + 27 * MIN)
    expect(await scan(g, g.ben, 7, g.aina)).toEqual({ ok: false, reason: 'shielded', name: 'Aina' })
    now += 20_000
    expect(await scan(g, g.kim, 7, g.aina)).toMatchObject({ ok: true })
  })

  it('one stolen half: the other still works and the slot frees after it', async () => {
    const g = await chasing()
    await doubled(g.gameId, g.aina.playerId, 'shield')
    const along = await give(g.gameId, g.ben.playerId, 'along')
    expect(await use(g, g.ben.token, along.id)).toEqual({ ok: true, kind: 'along' })
    const left = (await view(g, g.aina.token)).hand
    expect(left).toHaveLength(1)
    expect(await use(g, g.aina.token, left[0].id)).toEqual({ ok: true, kind: 'shield' })
    expect((await view(g, g.aina.token)).shieldActive).toBe(true)
    expect(await scan(g, g.kim, 7, g.aina)).toEqual({ ok: false, reason: 'shielded', name: 'Aina' })
    expect((await view(g, g.aina.token)).activePowerUp).toBeNull()
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })).toMatchObject({ ok: true })
  })

  it.each(['original', 'twin'] as const)('one stolen half (%s taken): the other arms at once and frees the slot', async (taken) => {
    const g = await chasing()
    const pair = await doubled(g.gameId, g.aina.playerId, 'shield')
    const [gone, kept] = taken === 'original' ? [pair.first, pair.twin] : [pair.twin, pair.first]
    await store.updatePowerUp(gone.id, { taken_at: new Date(now).toISOString() }) // what Toyol / Ah Long leave behind
    expect(await use(g, g.aina.token, kept.id)).toEqual({ ok: true, kind: 'shield' })
    expect((await view(g, g.aina.token)).shieldActive).toBe(true)
    expect(await scan(g, g.kim, 7, g.aina)).toEqual({ ok: false, reason: 'shielded', name: 'Aina' })
    expect((await view(g, g.aina.token)).activePowerUp).toBeNull()
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...atS1 })).toMatchObject({ ok: true })
  })
})

describe('Tee And Gee', () => {
  /** Ben, Kim and Lee chase; Aina, Hafiz and Wei run. Full mode, the chase has begun. */
  async function chasing() {
    const g = await readyGame({ mode: 'full' })
    const kim = await run('join', { code: g.code, name: 'Kim', accepted: true })
    const lee = await run('join', { code: g.code, name: 'Lee', accepted: true })
    const wei = await run('join', { code: g.code, name: 'Wei', accepted: true })
    await run('setRoles', {
      code: g.code,
      organiserToken: g.organiserToken,
      roles: {
        [g.ben.playerId]: 'chaser',
        [kim.playerId]: 'chaser',
        [lee.playerId]: 'chaser',
        [g.aina.playerId]: 'runner',
        [g.hafiz.playerId]: 'runner',
        [wei.playerId]: 'runner',
      },
    })
    await run('linkTag', { code: g.code, token: wei.token, tagId: 9 })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    return { ...g, kim, lee, wei, gameId: (await store.gameByCode(g.code))!.id }
  }
  const give = async (gameId: string, playerId: string, kind: PowerUpKind) =>
    store.addPowerUp({ game_id: gameId, player_id: playerId, kind, station: null })
  const playCard = (g: { code: string }, token: string, powerupId: string, extra: object = {}) =>
    run('usePowerup', { code: g.code, token, powerupId, ...extra })
  const view = (g: { code: string }, token: string) => run<View>('state', { code: g.code, token })
  const loc = (g: { code: string }, token: string, dLatM: number) => run('location', { code: g.code, token, ...at(dLatM) })
  const dotOf = (v: View, id: string) => v.dots.find((d) => d.kind === 'runner' && d.id === id)
  const GATE_TEXT = 'A Kejar set a toll gate.'

  /** Ben stands at `at(0)` and sets the gate, then walks off; Aina checks in at `ainaAt`, Hafiz at 80 m. */
  async function gateThenReveal(g: Awaited<ReturnType<typeof chasing>>) {
    const toll = await give(g.gameId, g.ben.playerId, 'toll')
    await loc(g, g.ben.token, 0)
    expect(await playCard(g, g.ben.token, toll.id)).toEqual({ ok: true, kind: 'toll' })
    return toll
  }
  async function checkInAndReveal(g: Awaited<ReturnType<typeof chasing>>, ainaAt = 30) {
    now = T0 + 8 * MIN
    await loc(g, g.ben.token, 300)
    now = T0 + 9.5 * MIN
    await loc(g, g.aina.token, ainaAt)
    await loc(g, g.hafiz.token, 80)
    now = T0 + 10 * MIN
  }

  it('a runner who checks in within 40 m of the gate shows exactly at the next reveal', async () => {
    const g = await chasing()
    const toll = await gateThenReveal(g)
    await checkInAndReveal(g)
    const v = await view(g, g.ben.token)
    expect(dotOf(v, g.aina.playerId)).toMatchObject({ exact: true, revealedBy: 'toll' })
    const hafiz = dotOf(v, g.hafiz.playerId)!
    expect(hafiz.fuzzy).toBe(true)
    expect(hafiz.revealedBy).toBeNull()
    // The gate stayed where Ben used it, not where he walked to.
    const row = (await store.powerUps(g.gameId)).find((u) => u.id === toll.id)!
    expect(row.spot!.lat).toBeCloseTo(at(0).lat, 6)
    expect(row.spot!.lng).toBeCloseTo(at(0).lng, 6)
    const ev = (await store.events(g.gameId)).find((e) => e.type === 'used')!
    expect(ev).toMatchObject({ actor_id: g.ben.playerId, data: { kind: 'toll' } })
  })

  it("is refused with no-location when the chaser's last fix is over 60 s old, and the card is kept", async () => {
    const g = await chasing()
    const toll = await give(g.gameId, g.ben.playerId, 'toll')
    await loc(g, g.ben.token, 0)
    now += 61_000
    expect(await playCard(g, g.ben.token, toll.id)).toEqual({ ok: false, reason: 'no-location' })
    const row = (await store.powerUps(g.gameId)).find((u) => u.id === toll.id)!
    expect(row.used_at).toBeNull()
    expect(row.spot).toBeNull()
    expect((await store.events(g.gameId)).filter((e) => e.type === 'used')).toHaveLength(0)
    // A fresh fix makes it work, with the same card.
    await loc(g, g.ben.token, 0)
    expect(await playCard(g, g.ben.token, toll.id)).toEqual({ ok: true, kind: 'toll' })
  })

  it('Ponteng beats the gate', async () => {
    const g = await chasing()
    await gateThenReveal(g)
    const cloak = await give(g.gameId, g.aina.playerId, 'cloak')
    expect(await playCard(g, g.aina.token, cloak.id)).toEqual({ ok: true, kind: 'cloak' })
    await checkInAndReveal(g)
    const v = await view(g, g.ben.token)
    expect(dotOf(v, g.aina.playerId)).toBeUndefined()
    expect(v.feed.map((f) => f.text)).toContain('#07 never checked in')
  })

  it('Gostan beats the gate', async () => {
    const g = await chasing()
    await gateThenReveal(g)
    const decoy = await give(g.gameId, g.aina.playerId, 'decoy')
    expect(await playCard(g, g.aina.token, decoy.id)).toEqual({ ok: true, kind: 'decoy' })
    await checkInAndReveal(g)
    const dot = dotOf(await view(g, g.ben.token), g.aina.playerId)!
    // Drawn at the decoy spot, well away from where Aina really is.
    expect(distanceM(dot, at(30))).toBeGreaterThanOrEqual(100)
  })

  it('runners never see the gate', async () => {
    const g = await chasing()
    await gateThenReveal(g)
    const vAina = await view(g, g.aina.token)
    expect(vAina.tollGates).toEqual([])
    expect(vAina.feed.map((f) => f.text).join('|')).not.toMatch(/toll|Tee And Gee/i)
    const vBen = await view(g, g.ben.token)
    expect(vBen.tollGates).toHaveLength(1)
    expect(vBen.tollGates[0].lat).toBeCloseTo(at(0).lat, 6)
    expect(vBen.feed[0]).toMatchObject({
      text: GATE_TEXT,
      label: 'Tee And Gee',
      means: 'Dikejar checking in near it show exactly at the next ping.',
    })
    // The whole chasing team sees it.
    expect((await view(g, g.kim.token)).tollGates).toHaveLength(1)
  })

  it('the gate leaves the chasers view once the reveal lands', async () => {
    const g = await chasing()
    await gateThenReveal(g)
    await checkInAndReveal(g)
    expect((await view(g, g.ben.token)).tollGates).toEqual([])
  })

  it('marshals and the organiser get no gates, and a plain feed line', async () => {
    const g = await chasing()
    await gateThenReveal(g)
    const vOrg = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(vOrg.tollGates).toEqual([])
    expect(vOrg.feed[0].text).toBe('A Kejar used Tee And Gee')
  })

  it("a frozen chaser's toll gate still lands", async () => {
    const g = await chasing()
    await gateThenReveal(g)
    const cheese = await give(g.gameId, g.aina.playerId, 'cheese')
    expect(await playCard(g, g.aina.token, cheese.id, { targetId: g.ben.playerId })).toMatchObject({ ok: true, kind: 'cheese' })
    await checkInAndReveal(g)
    const v = await view(g, g.ben.token)
    expect(dotOf(v, g.aina.playerId)).toMatchObject({ exact: true, revealedBy: 'toll' })
  })

  it('a doubled Tee And Gee sets its second gate only after the first one lands', async () => {
    const g = await chasing()
    await give(g.gameId, g.ben.playerId, 'combo').then((c) => store.updatePowerUp(c.id, { used_at: new Date(now).toISOString() }))
    const first = await give(g.gameId, g.ben.playerId, 'toll')
    const twin = (await store.applyCombo(g.ben.playerId, first.id))!
    await loc(g, g.ben.token, 0)
    expect(await playCard(g, g.ben.token, first.id)).toEqual({ ok: true, kind: 'toll' })
    // The twin waits for the first gate's reveal (a doubled card's second use never lands on the same ping).
    expect(await playCard(g, g.ben.token, twin.id)).toEqual({ ok: false, reason: 'effect-running' })
    expect((await view(g, g.ben.token)).tollGates).toHaveLength(1)
    await checkInAndReveal(g)
    await view(g, g.ben.token)
    now += 30_000
    await loc(g, g.ben.token, 100)
    expect(await playCard(g, g.ben.token, twin.id)).toEqual({ ok: true, kind: 'toll' })
    const gates = (await view(g, g.ben.token)).tollGates
    expect(gates).toHaveLength(1)
    expect(gates[0].lat).toBeCloseTo(at(100).lat, 6)
  })
})

describe('cloak secrecy at the ping', () => {
  it('the ping count leaves out a cloaked runner', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    now = T0 + 7 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(40) })
    const cloak = await store.addPowerUp({ game_id: gameId, player_id: g.aina.playerId, kind: 'cloak', station: 1 })
    await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: cloak.id })
    now = T0 + 10 * MIN
    const v = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(v.feed.map((f) => f.text)).toContain('Ping: 1 Dikejar seen, 1 missed check-in.')
    expect((await store.events(gameId)).find((e) => e.type === 'ping')?.data).toMatchObject({ seen: 1, missed: 1 })
  })
})

/** readyGame plus Siti as a subscribed marshal, started, 2 minutes into the chase. */
async function safetyGame(settings: object = {}) {
  const g = await readyGame(settings)
  const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
  const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
  await run('subscribe', { code: g.code, token: siti.token, subscription: { endpoint: 'https://push/Siti' } })
  await run('start', { code: g.code, organiserToken: g.organiserToken })
  now = T0 + 7 * MIN
  pushes = []
  const gameId = (await store.gameByCode(g.code))!.id
  return { ...g, siti, gameId }
}

describe('late pings and auto-jail', () => {
  const poll = async (g: { code: string; organiserToken: string }, min: number) => {
    now = T0 + min * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
  }
  const checkIn = async (g: { code: string; aina: { token: string }; hafiz: { token: string } }, min: number) => {
    now = T0 + min * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
  }
  const hafizJailed = async (g: { gameId: string; hafiz: { playerId: string } }) =>
    (await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed
  /** Both runners check in for pings 1 and 2, with every alert polled on time. */
  async function onTimeStart(settings: object = {}) {
    const g = await safetyGame(settings)
    await poll(g, 9.25)
    await checkIn(g, 9.75)
    await poll(g, 10)
    await poll(g, 14.25)
    await checkIn(g, 14.75)
    await poll(g, 15)
    return g
  }

  it('(a) two misses with on-time alerts auto-jail, as before', async () => {
    const g = await safetyGame()
    await poll(g, 9.25)
    await poll(g, 10)
    await poll(g, 14.25)
    expect(await hafizJailed(g)).toBe(false)
    await poll(g, 15)
    expect(await hafizJailed(g)).toBe(true)
  })

  it('(b) a ping alerted late is skipped: it is neither a miss nor a reset', async () => {
    const g = await onTimeStart()
    await poll(g, 19.25)
    await poll(g, 20) // ping 3 missed
    await poll(g, 25 - 24 / 60) // ping 4's alert first goes out with 24 s to go
    await poll(g, 25)
    expect(await hafizJailed(g)).toBe(false)
    await poll(g, 29.25)
    await poll(g, 30) // ping 5 missed: pings 3 and 5 are the last two that counted
    expect(await hafizJailed(g)).toBe(true)
    const jailed = (await store.events(g.gameId)).find((e) => e.type === 'auto-jailed' && e.target_id === g.hafiz.playerId)!
    // (e) the skipped ping is not in the list the jailed runner sees
    expect((jailed.data.checkins as { revealAt: number }[]).map((c) => c.revealAt)).toEqual([T0 + 15 * MIN, T0 + 20 * MIN, T0 + 30 * MIN])
  })

  it('(c) nobody polls between ping 4 alert and reveal: ping 4 is skipped, nobody is jailed there', async () => {
    const g = await onTimeStart()
    await poll(g, 18.9)
    await poll(g, 20)
    await poll(g, 24)
    expect(await hafizJailed(g)).toBe(false)
    await poll(g, 25)
    expect(await hafizJailed(g)).toBe(false)
  })

  it('(d) in schedule mode with no pushes, two misses still auto-jail', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    await poll(g, 10)
    await poll(g, 15)
    expect(pushes).toEqual([])
    expect(await hafizJailed(g)).toBe(true)
  })

  it('L2: a pause and resume after an alert went out does not move its stored alert time', async () => {
    const g = await safetyGame()
    await poll(g, 9.25)
    const before = (await store.pings(g.gameId)).find((p) => p.seq === 1)!
    expect(before.alerted).toBe(true)
    now = T0 + 9.5 * MIN
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 12 * MIN
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    const after = (await store.pings(g.gameId)).find((p) => p.seq === 1)!
    expect(after.alert_at).toBe(before.alert_at)
    expect(after.reveal_at).not.toBe(before.reveal_at)
  })
})

describe('game mode', () => {
  it('defaults to Core, and Full can be chosen', async () => {
    const core = await readyGame()
    expect((await store.gameByCode(core.code))!.settings.mode).toBe('core')
    const full = await readyGame({ mode: 'full' })
    expect((await store.gameByCode(full.code))!.settings.mode).toBe('full')
  })

  it('chaserSnapshot defaults to false and can be turned on at creation', async () => {
    const off = await readyGame()
    expect((await store.gameByCode(off.code))!.settings.chaserSnapshot).toBe(false)
    const on = await readyGame({ mode: 'full', chaserSnapshot: true })
    expect((await store.gameByCode(on.code))!.settings.chaserSnapshot).toBe(true)
  })

  it('a Core game always has the chaser snapshot off, even if the switch was sent on (rules §3)', async () => {
    const core = await readyGame({ mode: 'core', chaserSnapshot: true })
    expect((await store.gameByCode(core.code))!.settings.chaserSnapshot).toBe(false)
  })

  it('rejects a chaserSnapshot that is not true or false', async () => {
    const organiserToken = await createOrganiser()
    await rejects(
      run('create', { arenaId: 'around-me', center: CENTER, settings: { chaserSnapshot: 'yes' }, organiserToken }),
      400,
      'Chaser snapshot must be on or off',
    )
  })

  it('rejects an unknown mode', async () => {
    const organiserToken = await createOrganiser()
    await rejects(run('create', { arenaId: 'around-me', center: CENTER, settings: { mode: 'party' }, organiserToken }), 400, 'Unknown game mode')
  })

  describe('endgame switches', () => {
    const stored = async (settings: object) => (await store.gameByCode((await readyGame(settings)).code))!.settings.endgames

    it('default to all four on, Banjir Kilat included', async () => {
      expect(await stored({ mode: 'full' })).toEqual({ bomba: 'on', hebat: 'on', pkp: 'on', banjir: 'on' })
    })

    it("keep Core's hidden switches as given, since rollEndgame ignores them there", async () => {
      expect(await stored({ mode: 'core', endgames: { bomba: 'off', hebat: 'on', pkp: 'off' } })).toEqual({ bomba: 'off', hebat: 'on', pkp: 'off', banjir: 'on' })
      expect(await stored({ mode: 'core' })).toEqual({ bomba: 'on', hebat: 'on', pkp: 'on', banjir: 'on' })
    })

    it('a Core game switched to Full keeps Hang Hebat and PKP on', async () => {
      const g = await readyGame({ mode: 'core' })
      await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'full' })
      expect((await store.gameByCode(g.code))!.settings.endgames).toEqual({ bomba: 'on', hebat: 'on', pkp: 'on', banjir: 'on' })
    })

    /** A lobby game stored before the switches existed: its settings have no `endgames` at all. */
    const preDeploy = async () => {
      const g = await readyGame({ mode: 'core' })
      const row = (await store.gameByCode(g.code))!
      const { endgames: _drop, ...old } = row.settings
      await store.updateGame(row.id, { settings: old })
      return g
    }

    it('stay absent on a game stored without them when the organiser switches mode', async () => {
      const g = await preDeploy()
      await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'full' })
      const settings = (await store.gameByCode(g.code))!.settings
      expect(settings.mode).toBe('full')
      expect(settings.endgames).toBeUndefined()
    })

    it('stay absent on a game stored without them when the organiser sets a start time', async () => {
      const g = await preDeploy()
      await run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt: new Date(now + 60 * MIN).toISOString() })
      const settings = (await store.gameByCode(g.code))!.settings
      expect(settings.startsAt).toBe(new Date(now + 60 * MIN).toISOString())
      expect(settings.endgames).toBeUndefined()
    })

    it('store what a Full game asks for, and only the four keys', async () => {
      expect(await stored({ mode: 'full', endgames: { bomba: 'off', hebat: 'on', pkp: 'off', extra: 'on' } })).toEqual({ bomba: 'off', hebat: 'on', pkp: 'off', banjir: 'on' })
    })

    it('store Banjir Kilat as sent, on or off', async () => {
      expect((await stored({ mode: 'full', endgames: { banjir: 'off' } }))!.banjir).toBe('off')
      expect((await stored({ mode: 'full', endgames: { banjir: 'on' } }))!.banjir).toBe('on')
    })

    it('reject a bad value', async () => {
      const organiserToken = await createOrganiser()
      for (const endgames of [{ bomba: 'yes' }, { hebat: 'maybe' }, { pkp: true }, 'on', null, []]) {
        await rejects(run('create', { arenaId: 'around-me', center: CENTER, settings: { endgames }, organiserToken }), 400, 'Unknown endgame setting')
      }
    })
  })

  it('start stores how many deck sets each side gets', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    expect(await store.gameByCode(g.code)).toMatchObject({ runner_sets: 1, chaser_sets: 1 })
  })
})

describe('pause and resume', () => {
  it('organiser and marshal can pause; a runner gets 403 Marshals only', async () => {
    const g = await safetyGame()
    await rejects(run('pause', { code: g.code, token: g.aina.token }), 403, 'Marshals only')
    expect(await run('pause', { code: g.code, token: g.siti.token })).toEqual({ ok: true })
    expect(await run('resume', { code: g.code, organiserToken: g.organiserToken })).toEqual({ ok: true })
  })

  it('a second pause or resume changes nothing', async () => {
    const g = await safetyGame()
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    expect(await run('pause', { code: g.code, token: g.siti.token })).toEqual({ ok: false })
    now += 60_000
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    expect(await run('resume', { code: g.code, token: g.siti.token })).toEqual({ ok: false })
    const events = await store.events(g.gameId)
    expect(events.filter((e) => e.type === 'paused')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'resumed')).toHaveLength(1)
    expect((await store.gameByCode(g.code))!.pauses).toHaveLength(1)
  })

  it('while paused, catch / jailbreak / claim / usePowerup answer paused', async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    const paused = { ok: false, reason: 'paused' }
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual(paused)
    expect(await run('jailbreak', { code: g.code, token: g.hafiz.token, qr: JAIL_QR })).toEqual(paused)
    expect(await run('claim', { code: g.code, token: g.hafiz.token, qr: stationQr(1) })).toEqual(paused)
    expect(await run('usePowerup', { code: g.code, token: g.hafiz.token, powerupId: 'u1' })).toEqual(paused)
  })

  it('a 2-minute pause makes the game end 2 minutes later', async () => {
    const g = await safetyGame()
    const before = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now += 2 * MIN
    const during = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(during.paused).toBe(true)
    expect(during.endsAt! - during.now).toBe(before.endsAt! - before.now)
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    const after = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(after.paused).toBe(false)
    expect(after.endsAt).toBe(before.endsAt! + 2 * MIN)
  })

  it('pause in the lobby or after the end is refused 409', async () => {
    const g = await readyGame()
    await rejects(run('pause', { code: g.code, organiserToken: g.organiserToken }), 409)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 51 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('pause', { code: g.code, organiserToken: g.organiserToken }), 409)
  })
})

describe('SOS and reports', () => {
  it('SOS pushes every subscribed marshal and writes a safety record', async () => {
    const g = await safetyGame()
    expect(await run('sos', { code: g.code, token: g.aina.token, ...at(30) })).toMatchObject({ ok: true, notified: 1 })
    expect(pushes).toEqual([{ endpoint: 'https://push/Siti', payload: { type: 'alert', code: g.code, text: 'SOS from Aina #07' } }])
    expect(store.safetyRows).toEqual([
      expect.objectContaining({ type: 'sos', player_id: g.aina.playerId, lat: at(30).lat, lng: at(30).lng }),
    ])
  })

  it('repeat SOS within 30 s sends nothing new', async () => {
    const g = await safetyGame()
    await run('sos', { code: g.code, token: g.aina.token })
    now += 10_000
    await run('sos', { code: g.code, token: g.aina.token })
    await run('sos', { code: g.code, token: g.aina.token })
    expect((await store.events(g.gameId)).filter((e) => e.type === 'sos')).toHaveLength(1)
    expect(pushes).toHaveLength(1)
    now += 21_000
    await run('sos', { code: g.code, token: g.aina.token })
    expect((await store.events(g.gameId)).filter((e) => e.type === 'sos')).toHaveLength(2)
    expect(pushes).toHaveLength(2)
  })

  it('SOS returns its id, and the same one on a repeat', async () => {
    const g = await safetyGame()
    const first = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    const sosEvent = (await store.events(g.gameId)).find((e) => e.type === 'sos')!
    expect(first).toEqual({ ok: true, notified: 1, sosId: sosEvent.id })
    now += 10_000
    expect(await run('sos', { code: g.code, token: g.aina.token })).toMatchObject({ ok: true, repeat: true, sosId: sosEvent.id })
  })

  it('SOS details on your own recent SOS update the alert and add one safety record, with no new push', async () => {
    const g = await safetyGame()
    const { sosId } = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    pushes = []
    expect(await run('sosDetails', { code: g.code, token: g.aina.token, sosId, reason: 'dispute', withId: g.ben.playerId })).toEqual({ ok: true })
    const v = await run<View>('state', { code: g.code, token: g.siti.token })
    expect(v.alerts.map((a) => a.text)).toContain('SOS from Aina #07: Catch dispute with Ben')
    expect(store.safetyRows).toHaveLength(2)
    expect(store.safetyRows[1]).toMatchObject({ type: 'sos', player_id: g.aina.playerId, target_id: g.ben.playerId, data: expect.objectContaining({ follows: sosId, reason: 'dispute', with_name: 'Ben' }) })
    expect(pushes).toEqual([])
  })

  it('the same SOS details twice write once', async () => {
    const g = await safetyGame()
    const { sosId } = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    const details = { code: g.code, token: g.aina.token, sosId, reason: 'hurt' }
    expect(await run('sosDetails', details)).toEqual({ ok: true })
    expect(await run('sosDetails', details)).toEqual({ ok: true })
    expect((await store.events(g.gameId)).filter((e) => e.type === 'sos-details')).toHaveLength(1)
    expect(store.safetyRows).toHaveLength(2)
  })

  it("SOS details refuse someone else's SOS and one older than 5 minutes", async () => {
    const g = await safetyGame()
    const { sosId } = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    expect(await run('sosDetails', { code: g.code, token: g.hafiz.token, sosId, reason: 'hurt' })).toEqual({ ok: false, reason: 'not-yours' })
    now += 6 * MIN
    expect(await run('sosDetails', { code: g.code, token: g.aina.token, sosId, reason: 'hurt' })).toEqual({ ok: false, reason: 'not-yours' })
  })

  it('SOS details reject an unknown reason or a stranger', async () => {
    const g = await safetyGame()
    const { sosId } = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    await rejects(run('sosDetails', { code: g.code, token: g.aina.token, sosId, reason: 'bored' }), 400)
    await rejects(run('sosDetails', { code: g.code, token: g.aina.token, sosId, reason: 'unsafe', withId: 'nobody' }), 400)
  })

  it('SOS works while paused and from jail, but not in the lobby', async () => {
    const lobby = await readyGame()
    await rejects(run('sos', { code: lobby.code, token: lobby.aina.token }), 409)
    const g = await safetyGame()
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    expect(await run('sos', { code: g.code, token: g.ben.token })).toMatchObject({ ok: true })
  })

  it('report validates reason, note length and target', async () => {
    const g = await safetyGame()
    const base = { code: g.code, token: g.hafiz.token, targetId: g.ben.playerId, reason: 'unsafe' }
    await rejects(run('report', { ...base, reason: 'rude' }), 400)
    await rejects(run('report', { ...base, note: 'x'.repeat(141) }), 400)
    await rejects(run('report', { ...base, targetId: g.hafiz.playerId }), 400)
    await rejects(run('report', { ...base, targetId: 'nobody' }), 400)
    expect(await run('report', { ...base, note: '  pushed me  ', ...at(10) })).toEqual({ ok: true, notified: 1 })
    expect(pushes[0].payload).toEqual({ type: 'alert', code: g.code, text: 'Hafiz #03 reported Ben: Unsafe play: pushed me' })
    expect(store.safetyRows[0]).toMatchObject({ type: 'report', player_id: g.hafiz.playerId, target_id: g.ben.playerId })
  })

  it('report is refused in the lobby, but still works once the game has ended', async () => {
    const lobby = await readyGame()
    await rejects(run('report', { code: lobby.code, token: lobby.aina.token, targetId: lobby.ben.playerId, reason: 'unsafe' }), 409)
    const g = await safetyGame()
    now = T0 + 51 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken }) // advances the game to 'ended'
    expect(await run('report', { code: g.code, token: g.aina.token, targetId: g.ben.playerId, reason: 'dispute', note: '' })).toEqual({ ok: true, notified: 1 })
  })

  it('rate validates the rating range and note length, and works once ended', async () => {
    const g = await safetyGame()
    now = T0 + 51 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const base = { code: g.code, token: g.aina.token }
    await rejects(run('rate', { ...base, rating: 0 }), 400)
    await rejects(run('rate', { ...base, rating: 6 }), 400)
    await rejects(run('rate', { ...base, rating: 3.5 }), 400)
    await rejects(run('rate', { ...base, rating: 4, note: 'x'.repeat(141) }), 400)
    expect(await run('rate', { ...base, rating: 4, note: 'fun!' })).toEqual({ ok: true })
    expect(await run('rate', { code: g.code, token: g.hafiz.token, rating: 5, note: '' })).toEqual({ ok: true })
    const events = await store.events(g.gameId)
    expect(events.filter((e) => e.type === 'rated')).toHaveLength(2)
  })

  it('rate is refused before the game ends: in the lobby, the hide phase and the chase', async () => {
    const lobby = await readyGame()
    await rejects(run('rate', { code: lobby.code, token: lobby.aina.token, rating: 4 }), 409)
    await run('start', { code: lobby.code, organiserToken: lobby.organiserToken })
    now = T0 + 1 * MIN // still hiding
    await rejects(run('rate', { code: lobby.code, token: lobby.aina.token, rating: 4 }), 409)
    const g = await safetyGame() // 2 minutes into the chase
    await rejects(run('rate', { code: g.code, token: g.aina.token, rating: 4 }), 409)
    expect((await store.events(g.gameId)).filter((e) => e.type === 'rated')).toEqual([])
  })

  it("marshals and the organiser see post-end reports and ratings in their view, but players don't", async () => {
    const g = await safetyGame()
    now = T0 + 51 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken }) // ends the game
    await run('rate', { code: g.code, token: g.aina.token, rating: 4, note: 'fun!' })
    await run('report', { code: g.code, token: g.aina.token, targetId: g.ben.playerId, reason: 'dispute', note: 'after the fact' })
    const marshalView = await run<View>('state', { code: g.code, token: g.siti.token })
    expect(marshalView.ratings).toEqual([expect.objectContaining({ name: 'Aina #07', rating: 4, note: 'fun!' })])
    expect(marshalView.reports).toEqual([expect.objectContaining({ name: 'Aina #07', targetName: 'Ben', reason: 'dispute', note: 'after the fact' })])
    const hostView = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(hostView.ratings).toHaveLength(1)
    expect(hostView.reports).toHaveLength(1)
    const playerView = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(playerView.ratings).toEqual([])
    expect(playerView.reports).toEqual([])
  })

  it('marshals see alerts; runners and chasers see none', async () => {
    const g = await safetyGame()
    await run('sos', { code: g.code, token: g.aina.token, ...at(30) })
    const host = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    const marshal = await run<View>('state', { code: g.code, token: g.siti.token })
    expect(host.alerts.map((a) => a.text)).toEqual(['SOS from Aina #07'])
    expect(marshal.alerts).toHaveLength(1)
    expect((await run<View>('state', { code: g.code, token: g.ben.token })).alerts).toEqual([])
    expect((await run<View>('state', { code: g.code, token: g.hafiz.token })).alerts).toEqual([])
  })

  it('SOS and reports stay out of the public feed', async () => {
    const g = await safetyGame()
    await run('sos', { code: g.code, token: g.aina.token })
    await run('report', { code: g.code, token: g.hafiz.token, targetId: g.ben.playerId, reason: 'other' })
    const feed = (await run<View>('state', { code: g.code, token: g.ben.token })).feed.map((f) => f.text).join(' | ')
    expect(feed).not.toMatch(/SOS|report/i)
  })

  it('players can report anyone else in the game', async () => {
    const g = await safetyGame()
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.reportable.map((p) => p.name).sort()).toEqual(['Ben', 'Hafiz', 'Siti'])
  })

  it('handleAlert marks it handled', async () => {
    const g = await safetyGame()
    await run('sos', { code: g.code, token: g.aina.token })
    const [alert] = (await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts
    await rejects(run('handleAlert', { code: g.code, token: g.ben.token, eventId: alert.id, outcome: 'sorted' }), 403)
    expect(await run('handleAlert', { code: g.code, token: g.siti.token, eventId: alert.id, outcome: 'sorted' })).toEqual({ ok: true })
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts[0].handled).toBe(true)
  })

  it('closing an SOS with an outcome writes it to the alert and the safety record', async () => {
    const g = await safetyGame()
    await run('sos', { code: g.code, token: g.aina.token })
    const [alert] = (await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts
    expect(await run('handleAlert', { code: g.code, token: g.siti.token, eventId: alert.id, outcome: 'sorted' })).toEqual({ ok: true })
    const events = await store.events(g.gameId)
    expect(events.find((e) => e.type === 'handled')?.data.outcome).toBe('sorted')
    const after = (await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts[0]
    expect(after).toMatchObject({ handled: true, outcome: 'sorted' })
    expect(store.safetyRows.at(-1)).toMatchObject({ type: 'sos', player_id: g.siti.playerId, data: expect.objectContaining({ event_id: alert.id, outcome: 'sorted' }) })
  })

  it('an SOS cannot be closed without an outcome, or with one that is not a takeover chip', async () => {
    const g = await safetyGame()
    const { sosId } = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    const rowsBefore = store.safetyRows.length
    await rejects(run('handleAlert', { code: g.code, token: g.siti.token, eventId: sosId }), 400)
    await rejects(run('handleAlert', { code: g.code, token: g.siti.token, eventId: sosId, outcome: '' }), 400)
    await rejects(run('handleAlert', { code: g.code, token: g.siti.token, eventId: sosId, outcome: 'whatever' }), 400)
    await rejects(run('handleAlert', { code: g.code, token: g.siti.token, eventId: sosId, outcome: 'x'.repeat(5000) }), 400)
    await rejects(run('handleAlert', { code: g.code, organiserToken: g.organiserToken, eventId: sosId }), 400)
    expect((await store.events(g.gameId)).filter((e) => e.type === 'handled')).toEqual([])
    expect(store.safetyRows).toHaveLength(rowsBefore)
    for (const outcome of ['first-aid', 'left', 'false-alarm']) {
      const other = await run<{ sosId: string }>('sos', { code: g.code, token: g.hafiz.token })
      now += 31_000
      expect(await run('handleAlert', { code: g.code, token: g.siti.token, eventId: other.sosId, outcome })).toEqual({ ok: true })
    }
  })

  it("the safety record for a closed alert carries the closed event's real type, and only for safety events", async () => {
    const g = await safetyGame()
    await run('report', { code: g.code, token: g.hafiz.token, targetId: g.ben.playerId, reason: 'other' })
    const [report] = (await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts
    expect(await run('handleAlert', { code: g.code, token: g.siti.token, eventId: report.id, outcome: 'sorted' })).toEqual({ ok: true })
    expect(store.safetyRows.at(-1)).toMatchObject({ type: 'report', data: expect.objectContaining({ event_id: report.id, outcome: 'sorted' }) })
    const outside = await store.addEvent({ game_id: g.gameId, type: 'outside', actor_id: g.aina.playerId, target_id: null, data: { who: 'Aina #07' } })
    const rowsBefore = store.safetyRows.length
    expect(await run('handleAlert', { code: g.code, token: g.siti.token, eventId: outside.id, outcome: 'sorted' })).toEqual({ ok: true })
    expect(store.safetyRows).toHaveLength(rowsBefore)
  })

  it('records who closed an alert, the organiser included', async () => {
    const g = await safetyGame()
    const first = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    const second = await run<{ sosId: string }>('sos', { code: g.code, token: g.hafiz.token })
    await run('handleAlert', { code: g.code, token: g.siti.token, eventId: first.sosId, outcome: 'sorted' })
    await run('handleAlert', { code: g.code, organiserToken: g.organiserToken, eventId: second.sosId, outcome: 'false-alarm' })
    const alerts = (await run<View>('state', { code: g.code, token: g.siti.token })).alerts
    expect(alerts.find((a) => a.id === first.sosId)?.closedByName).toBe('Siti')
    expect(alerts.find((a) => a.id === second.sosId)?.closedByName).toBe('Owner')
  })

  it('handleAlert without an outcome still works for non-SOS alerts, unchanged', async () => {
    const g = await safetyGame()
    await run('report', { code: g.code, token: g.hafiz.token, targetId: g.ben.playerId, reason: 'other' })
    const rowsBefore = store.safetyRows.length
    const [alert] = (await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts
    expect(await run('handleAlert', { code: g.code, token: g.siti.token, eventId: alert.id })).toEqual({ ok: true })
    const after = (await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts[0]
    expect(after).toMatchObject({ handled: true, outcome: null })
    expect(store.safetyRows).toHaveLength(rowsBefore)
  })

  it('a second marshal can still respond after the first', async () => {
    const g = await readyGame()
    const dinaInvite = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const dina = await run('redeemMarshalInvite', { code: g.code, inviteToken: dinaInvite.inviteToken, name: 'Dina' })
    const sitiInvite = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken: sitiInvite.inviteToken, name: 'Siti' })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    const { sosId } = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    expect(await run('respondToSos', { code: g.code, token: siti.token, eventId: sosId })).toEqual({ ok: true })
    expect(await run('respondToSos', { code: g.code, token: dina.token, eventId: sosId })).toEqual({ ok: true })
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.alerts.find((a) => a.id === sosId)?.respondingName).toBe('Dina')
  })

  it('the organiser tapping "I\'m going" shows their name, rather than blanking an earlier marshal\'s', async () => {
    const g = await safetyGame()
    const { sosId } = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    await run('respondToSos', { code: g.code, token: g.siti.token, eventId: sosId })
    expect(await run('respondToSos', { code: g.code, organiserToken: g.organiserToken, eventId: sosId })).toEqual({ ok: true })
    const v = await run<View>('state', { code: g.code, token: g.siti.token })
    expect(v.alerts.find((a) => a.id === sosId)?.respondingName).toBe('Owner')
  })

  it("an organiser from another game can't respond to this game's SOS", async () => {
    const g = await safetyGame()
    const other = await readyGame()
    const { sosId } = await run<{ sosId: string }>('sos', { code: g.code, token: g.aina.token })
    await rejects(run('respondToSos', { code: g.code, organiserToken: other.organiserToken, eventId: sosId }), 403)
  })
})

describe('organiser invites', () => {
  it('an organiser invites a peer, who redeems it and can then create a game', async () => {
    const ownerToken = await createOrganiser()
    const { inviteToken } = await run('createOrganiserInvite', { organiserToken: ownerToken, name: 'Partner' })
    const redeemed = await run('redeemOrganiserInvite', { inviteToken })
    expect(redeemed.name).toBe('Partner')
    expect(redeemed.organiserToken).toHaveLength(43)
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, organiserToken: redeemed.organiserToken })
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
  })

  it('refuses to redeem the same invite twice', async () => {
    const ownerToken = await createOrganiser()
    const { inviteToken } = await run('createOrganiserInvite', { organiserToken: ownerToken, name: 'Partner' })
    await run('redeemOrganiserInvite', { inviteToken })
    await rejects(run('redeemOrganiserInvite', { inviteToken }), 410, 'already been used')
  })

  it('refuses an invite past its 48-hour expiry', async () => {
    const ownerToken = await createOrganiser()
    const { inviteToken } = await run('createOrganiserInvite', { organiserToken: ownerToken, name: 'Partner' })
    now += 48 * 60 * 60 * 1000
    await rejects(run('redeemOrganiserInvite', { inviteToken }), 410, 'expired')
  })

  it('refuses createOrganiserInvite without a valid organiser session', async () => {
    await rejects(run('createOrganiserInvite', { organiserToken: 'wrong', name: 'Partner' }), 403)
  })

  it('re-links an existing organiser to a new device instead of creating a second one', async () => {
    const ownerToken = await createOrganiser()
    const { inviteToken: firstInvite } = await run('createOrganiserInvite', { organiserToken: ownerToken, name: 'Partner' })
    const partner = await run('redeemOrganiserInvite', { inviteToken: firstInvite })
    // Partner's own phone dies; the owner (any organiser could do this — true peers) sends a re-link invite.
    const { inviteToken: relinkInvite } = await run('createOrganiserInvite', {
      organiserToken: ownerToken,
      organiserId: partner.organiserId,
      name: 'Partner',
    })
    const relinked = await run('redeemOrganiserInvite', { inviteToken: relinkInvite })
    expect(relinked.organiserId).toBe(partner.organiserId)
    // The old phone's session no longer works.
    await rejects(run('createOrganiserInvite', { organiserToken: partner.organiserToken, name: 'Someone else' }), 403)
    // The new phone's session does.
    await run('createOrganiserInvite', { organiserToken: relinked.organiserToken, name: 'Someone else' })
  })

  it('refuses to re-link an organiser from a different organisation', async () => {
    const ownerAToken = await createOrganiser()
    const ownerBToken = await createOrganiser()
    const { inviteToken } = await run('createOrganiserInvite', { organiserToken: ownerAToken, name: 'Partner A' })
    const partnerA = await run('redeemOrganiserInvite', { inviteToken })
    await rejects(
      run('createOrganiserInvite', { organiserToken: ownerBToken, organiserId: partnerA.organiserId, name: 'x' }),
      404,
    )
  })
})

describe('marshal invites', () => {
  it('an organiser pre-assigns a marshal, who joins directly with that role', async () => {
    const g = await readyGame()
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const joined = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    expect(joined.token).toHaveLength(43)
    const players = await store.players((await store.gameByCode(g.code))!.id)
    expect(players.find((p) => p.id === joined.playerId)).toMatchObject({ name: 'Siti', role: 'marshal' })
  })

  it('refuses a marshal invite once the game has started', async () => {
    const g = await readyGame()
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' }), 410)
  })

  it('refuses createMarshalInvite from a non-organiser', async () => {
    const g = await readyGame()
    await rejects(run('createMarshalInvite', { code: g.code, organiserToken: 'wrong' }), 403)
  })

  it('refuses to redeem the same marshal invite twice', async () => {
    const g = await readyGame()
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    await rejects(run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Second' }), 410)
  })

  it('refuses to redeem a marshal invite against a different game', async () => {
    const gameA = await readyGame()
    const gameB = await readyGame()
    const { inviteToken } = await run('createMarshalInvite', { code: gameA.code, organiserToken: gameA.organiserToken })
    await rejects(run('redeemMarshalInvite', { code: gameB.code, inviteToken, name: 'Intruder' }), 404)
    // The invite must still be unredeemed and work on the correct game.
    const joined = await run('redeemMarshalInvite', { code: gameA.code, inviteToken, name: 'Siti' })
    expect(joined.token).toHaveLength(43)
  })
})

describe('Banjir Kilat: the flood (design 2026-11-16)', () => {
  type G = Awaited<ReturnType<typeof banjirGame>>
  const iso = (ms: number) => new Date(ms).toISOString()
  async function banjirGame() {
    const g = await readyGame({ mode: 'full', endgames: { bomba: 'off', hebat: 'off', pkp: 'off', banjir: 'on' } })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    return { ...g, gameId }
  }
  const poll = (g: G, ms: number, who: object = { organiserToken: g.organiserToken }) => {
    now = ms
    return run<View>('state', { code: g.code, ...who })
  }
  const row = async (g: G) => (await store.gameByCode(g.code))!
  const player = async (g: G, id: string) => (await store.players(g.gameId)).find((p) => p.id === id)!
  /** A spot inside the play area but in the water once the water has fully risen (well clear of the edge). */
  async function wetSpot(g: G) {
    const game = await row(g)
    const plan = floodPlanOf(game)
    for (let k = 0; k < 16; k++) {
      const p = offset(plan.center, plan.rf + 40, (k * Math.PI) / 8)
      if (inPlayArea(p, game.arena) && distanceToEdgeM(p, game.arena.boundary) > 40) return { lat: p.lat, lng: p.lng, accuracy_m: 8 }
    }
    throw new Error('no wet spot')
  }
  const dry = async (g: G) => {
    const c = floodPlanOf(await row(g)).center
    return { lat: c.lat, lng: c.lng, accuracy_m: 8 }
  }
  const FULL = T0 + 48 * MIN + 10_000 // all four rises done (2:00 left was the last)

  it('rolls when it is the only one on, reveals at 10 minutes left, and shows the flood', async () => {
    const g = await banjirGame()
    expect((await row(g)).endgame!.kind).toBe('banjir')
    expect((await poll(g, T0 + 39 * MIN)).endgame).toBeNull()
    pushes = []
    const v = await poll(g, T0 + 40 * MIN)
    expect(v.endgame?.kind).toBe('banjir')
    expect(v.endgame?.flood?.step).toBe(0)
    expect(v.endgame?.flood?.next?.at).toBe(T0 + 42 * MIN)
    expect(pushes.some((p) => /Banjir kilat/.test((p.payload as { body?: string }).body ?? ''))).toBe(true)
    const later = await poll(g, FULL)
    expect(later.endgame?.flood?.step).toBe(4)
    expect(later.feed.map((f) => f.text)).toEqual(expect.arrayContaining(['The water rose.', "The water's rising. Dry land shrinks in 60 s."]))
  })

  it('a runner in the water gets 30 s, then goes to Penjara for the flood', async () => {
    const g = await banjirGame()
    await poll(g, T0 + 40 * MIN)
    const wet = await wetSpot(g)
    now = FULL
    pushes = []
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    expect((await player(g, g.aina.playerId)).flooded_at).toBeTruthy()
    expect(pushes.map((p) => p.endpoint)).toContain('https://push/Aina')
    expect((await poll(g, FULL + 5_000, { token: g.aina.token })).wetUntil).toBe(FULL + 30_000)
    now = FULL + 20_000
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    expect((await player(g, g.aina.playerId)).jailed).toBe(false)
    now = FULL + 31_000
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    const aina = await player(g, g.aina.playerId)
    expect(aina.jailed).toBe(true)
    expect(aina.flooded_at ?? null).toBeNull()
    const v = await poll(g, FULL + 32_000, { token: g.aina.token })
    expect(v.jailReason).toBe('banjir')
    const marshal = await poll(g, FULL + 32_000)
    expect(marshal.feed.map((f) => f.text)).toContain('#07 got caught in the flood, sent to Penjara.')
  })

  it('getting back on dry land clears the 30 s; chasers and the water before the first rise never count', async () => {
    const g = await banjirGame()
    await poll(g, T0 + 40 * MIN)
    const wet = await wetSpot(g)
    now = T0 + 41 * MIN // revealed, but no rise yet
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    expect((await player(g, g.aina.playerId)).flooded_at ?? null).toBeNull()
    now = FULL
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    now = FULL + 10_000
    await run('location', { code: g.code, token: g.aina.token, ...(await dry(g)) })
    expect((await player(g, g.aina.playerId)).flooded_at ?? null).toBeNull()
    now = FULL + 40_000
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    expect((await player(g, g.aina.playerId)).jailed).toBe(false)
    await run('location', { code: g.code, token: g.ben.token, ...wet })
    expect((await player(g, g.ben.playerId)).flooded_at ?? null).toBeNull()
  })

  it('a water timer from before a catch never carries over: a freed runner gets a fresh 30 s', async () => {
    const g = await banjirGame()
    await poll(g, T0 + 40 * MIN)
    const wet = await wetSpot(g)
    now = FULL
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    // Caught and rescued with no fix in between (phone in a pocket).
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: true, caught_at: iso(FULL + 5_000), caught_by: g.ben.playerId } }])
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: false, freed_at: iso(FULL + 20_000) } }])
    now = FULL + 40_000
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    const aina = await player(g, g.aina.playerId)
    expect(aina.jailed).toBe(false)
    expect(aina.flooded_at).toBe(iso(FULL + 40_000))
  })

  it('a pause freezes the 30 s instead of wiping it', async () => {
    const g = await banjirGame()
    await poll(g, T0 + 40 * MIN)
    const wet = await wetSpot(g)
    now = FULL
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    now = FULL + 20_000
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now = FULL + 60_000
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    expect((await player(g, g.aina.playerId)).flooded_at).toBe(iso(FULL))
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    now = FULL + 65_000 // 25 s in the water, not counting the 40 s pause
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    expect((await player(g, g.aina.playerId)).jailed).toBe(false)
    now = FULL + 72_000 // 32 s
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    expect((await player(g, g.aina.playerId)).jailed).toBe(true)
  })

  it('a station under water is closed', async () => {
    const g = await banjirGame()
    await poll(g, T0 + 40 * MIN)
    const wet = await wetSpot(g)
    const game = await row(g)
    await store.updateGame(game.id, { arena: { ...game.arena, stations: [{ lat: wet.lat, lng: wet.lng }] } })
    now = FULL
    await run('location', { code: g.code, token: g.aina.token, ...wet })
    const r = await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...wet })
    expect(r).toEqual(expect.objectContaining({ ok: false, reason: 'flooded' }))
  })
})

describe('cancelling a game', () => {
  it('the organiser cancels a lobby: every view says cancelled and shows nothing of the game', async () => {
    const g = await readyGame()
    expect(await run('cancelGame', { code: g.code, organiserToken: g.organiserToken })).toEqual({ ok: true })
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.cancelled).toBe(true)
    expect(v.roster).toEqual([])
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).cancelled).toBe(true)
  })

  it('every other action is refused with 410 once cancelled', async () => {
    const g = await readyGame()
    await run('cancelGame', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('start', { code: g.code, organiserToken: g.organiserToken }), 410, 'cancelled')
    await rejects(run('join', { code: g.code, name: 'Late', accepted: true }), 410)
  })

  it('mid-game: the game stops with no results, and every player is told', async () => {
    const g = await safetyGame()
    expect(await run('cancelGame', { code: g.code, organiserToken: g.organiserToken })).toEqual({ ok: true })
    const v = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(v.cancelled).toBe(true)
    expect(v.results ?? null).toBeNull()
    await rejects(run('location', { code: g.code, token: g.aina.token, ...at(0) }), 410)
    await rejects(run('rate', { code: g.code, token: g.aina.token, stars: 5 }), 410)
    const told = pushes.filter((p) => (p.payload as { text?: string }).text === `The organiser cancelled game ${g.code}.`).map((p) => p.endpoint)
    expect(told).toEqual(expect.arrayContaining(['https://push/Ben', 'https://push/Aina', 'https://push/Hafiz', 'https://push/Siti']))
  })

  it('only the organiser can cancel, a second cancel is harmless, and an ended game cannot be', async () => {
    const g = await safetyGame()
    await rejects(run('cancelGame', { code: g.code, token: g.siti.token }), 403)
    await run('cancelGame', { code: g.code, organiserToken: g.organiserToken })
    expect(await run('cancelGame', { code: g.code, organiserToken: g.organiserToken })).toEqual({ ok: true })
    const done = await safetyGame()
    now = T0 + 200 * MIN
    await rejects(run('cancelGame', { code: done.code, organiserToken: done.organiserToken }), 409, 'already ended')
  })
})

describe('removing a player', () => {
  it('a removed runner is refused with 403 except state, which shows removed_at', async () => {
    const g = await safetyGame()
    expect(await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.aina.playerId })).toEqual({ ok: true })
    await rejects(run('location', { code: g.code, token: g.aina.token, ...at(0) }), 403, 'You were removed from this game')
    await rejects(run('sos', { code: g.code, token: g.aina.token }), 403)
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.me.removed_at).toBeTruthy()
    expect(store.safetyRows).toEqual([expect.objectContaining({ type: 'removed', target_id: g.aina.playerId })])
    const feed = (await run<View>('state', { code: g.code, token: g.ben.token })).feed.map((f) => f.text)
    expect(feed).toContain('Aina left the game')
  })

  it('only marshals can remove, and only once', async () => {
    const g = await safetyGame()
    await rejects(run('removePlayer', { code: g.code, token: g.ben.token, playerId: g.aina.playerId }), 403)
    await run('removePlayer', { code: g.code, token: g.siti.token, playerId: g.aina.playerId })
    expect(await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.aina.playerId })).toEqual({ ok: false })
  })

  it("a removed runner can't be caught", async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.aina.playerId })
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({ ok: false, reason: 'unknown-tag' })
  })

  it('removing the last free runner while the rest are jailed ends the game', async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
    await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.hafiz.playerId })
    // The final whistle holds the end for 60 s (fair-play §1.4).
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).phase).toBe('chasing')
    now += 61_000
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.phase).toBe('ended')
    expect(v.results?.winner).toBe('chasers')
  })

  it('removing the last free runner while others are jailed starts the final whistle instead of ending at once (audit L1)', async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
    await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.hafiz.playerId })
    const events = await store.events(g.gameId)
    expect(events.filter((e) => e.type === 'final-whistle')).toHaveLength(1)
    expect(events.find((e) => e.type === 'final-whistle')!.data).toEqual({ cause: 'removed' })
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.feed.map((f) => f.text)).toContain('No Dikejar left free! Final whistle in 60 s.')
    expect(v.phase).toBe('chasing')
    expect(v.results).toBeFalsy()
  })

  it('removing every runner does not end the game early; at time-up it is a Kejar win', async () => {
    const g = await safetyGame()
    await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.aina.playerId })
    await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.hafiz.playerId })
    expect((await store.events(g.gameId)).filter((e) => e.type === 'final-whistle')).toHaveLength(0)
    now += 61_000
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.phase).toBe('chasing')
    expect(v.results).toBeFalsy()
    // No runner is left free, so when the clock runs out the Kejar win stands.
    now = T0 + 3 * 60 * MIN
    const over = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(over.phase).toBe('ended')
    expect(over.results?.winner).toBe('chasers')
  })
})

describe('Luar Garisan', () => {
  const RUNNER_WARN = "Eh, you're outside the play area! Balik within 30 seconds or you're out."
  const CHASER_WARN = "Eh, you're outside the play area! Balik within 30 seconds or you're out."
  const RUNNER_OUT = 'Luar Garisan lah! You left the play area, so no winning this round. You can still play along.'
  const CHASER_OUT = "Luar Garisan lah! You left the play area, so no winning this round, and your catches don't count."
  const evs = async (gameId: string, type: string) => (await store.events(gameId)).filter((e) => e.type === type)
  const notices = (name: string) => pushes.filter((p) => p.endpoint === `https://push/${name}` && (p.payload as any).type === 'notice')
  const player = async (gameId: string, id: string) => (await store.players(gameId)).find((p) => p.id === id)!
  const report = async (g: { code: string }, token: string, m: number, stepMs = 30_000) => {
    now += stepMs
    await run('location', { code: g.code, token, ...at(m) })
  }

  it('warns a runner on the first report more than 20 m outside, and pushes the runner warning', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 100)
    await report(g, g.aina.token, 240)
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(1)
    expect((await evs(g.gameId, 'out-warned'))[0].data).toEqual({ who: 'Aina #07' })
    expect(notices('Aina').map((p) => p.payload)).toEqual([{ type: 'notice', code: g.code, title: 'Outside the play area', body: RUNNER_WARN }])
    const me = await player(g.gameId, g.aina.playerId)
    expect(me.out_warned_at).toBeTruthy()
    expect(me.disqualified_at).toBeFalsy()
  })

  it('disqualifies on the second consecutive report outside', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240)
    await report(g, g.aina.token, 250)
    const out = await evs(g.gameId, 'luar-garisan')
    expect(out).toHaveLength(1)
    expect(out[0].data).toEqual({ who: 'Aina #07' })
    expect(out[0].actor_id).toBe(g.aina.playerId)
    expect((await player(g.gameId, g.aina.playerId)).disqualified_at).toBe(new Date(now).toISOString())
    expect(notices('Aina').map((p) => (p.payload as any).body)).toEqual([RUNNER_WARN, RUNNER_OUT])
    await report(g, g.aina.token, 260)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(1)
  })

  it('a report back within 20 m in between resets the streak', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240)
    await report(g, g.aina.token, 210) // 10 m outside: counts as inside
    expect((await player(g.gameId, g.aina.playerId)).out_warned_at).toBeFalsy()
    await report(g, g.aina.token, 240)
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(2)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(0)
    expect((await player(g.gameId, g.aina.playerId)).disqualified_at).toBeFalsy()
  })

  it('two outside reports 1 s apart give a warning only', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240)
    await report(g, g.aina.token, 250, 3_000) // a re-sent fix a few seconds later
    await report(g, g.aina.token, 250, 1_000)
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(1)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(0)
    expect((await player(g.gameId, g.aina.playerId)).disqualified_at).toBeFalsy()
  })

  it('disqualifies only 30 s or more after the warning', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240) // warned
    await report(g, g.aina.token, 250, 29_000)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(0)
    await report(g, g.aina.token, 250, 1_000) // exactly 30 s after the warning
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(1)
    expect((await player(g.gameId, g.aina.playerId)).disqualified_at).toBe(new Date(now).toISOString())
  })

  it('a warning does not survive Penjara', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240) // warned
    await store.catchRunner(g.aina.playerId, g.ben.playerId)
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: false, freed_once: true } }])
    await report(g, g.aina.token, 240)
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(2)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(0)
  })

  it('uses the chaser copy for chasers', async () => {
    const g = await safetyGame()
    await report(g, g.ben.token, 240)
    await report(g, g.ben.token, 250)
    expect(notices('Ben').map((p) => (p.payload as any).body)).toEqual([CHASER_WARN, CHASER_OUT])
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(1)
  })

  it('stays disqualified after coming back inside', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240)
    await report(g, g.aina.token, 250)
    await report(g, g.aina.token, 100)
    await report(g, g.aina.token, 50)
    expect((await player(g.gameId, g.aina.playerId)).disqualified_at).toBeTruthy()
  })

  it('never warns or disqualifies while the game is paused, in the lobby, or after it ends', async () => {
    const g = await safetyGame()
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    await report(g, g.aina.token, 240)
    await report(g, g.aina.token, 250)
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(0)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(0)
    expect(notices('Aina')).toEqual([])
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 24 * 60 * MIN
    await report(g, g.aina.token, 240)
    await report(g, g.aina.token, 250)
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(0)
    const lobby = await readyGame()
    const lobbyId = (await store.gameByCode(lobby.code))!.id
    await report(lobby, lobby.aina.token, 240)
    await report(lobby, lobby.aina.token, 250)
    expect(await evs(lobbyId, 'out-warned')).toHaveLength(0)
    expect(await evs(lobbyId, 'luar-garisan')).toHaveLength(0)
  })

  it('never warns or disqualifies a jailed runner, a marshal, or a removed player', async () => {
    const g = await safetyGame()
    await store.updatePlayers([{ id: g.hafiz.playerId, patch: { jailed: true } }])
    await report(g, g.hafiz.token, 240)
    await report(g, g.hafiz.token, 250)
    await report(g, g.siti.token, 240)
    await report(g, g.siti.token, 250)
    await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.aina.playerId })
    pushes = []
    await report(g, g.aina.token, 240).catch(() => {})
    await report(g, g.aina.token, 250).catch(() => {})
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(0)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(0)
    expect(notices('Hafiz')).toEqual([])
    expect(notices('Siti')).toEqual([])
    expect(notices('Aina')).toEqual([])
  })

  const reportAcc = async (g: { code: string }, token: string, m: number, accuracy_m: number, stepMs = 30_000) => {
    now += stepMs
    await run('location', { code: g.code, token, ...at(m), accuracy_m })
  }

  it('a warning given before a pause does not carry over: the first outside report after resume warns afresh', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240) // warned
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now += 5 * MIN
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    expect((await player(g.gameId, g.aina.playerId)).out_warned_at).toBeFalsy()
    await report(g, g.aina.token, 240)
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(2)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(0)
    expect((await player(g.gameId, g.aina.playerId)).disqualified_at).toBeFalsy()
  })

  it('resume leaves a disqualification alone', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240)
    await report(g, g.aina.token, 250)
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    expect((await player(g.gameId, g.aina.playerId)).disqualified_at).toBeTruthy()
  })

  it('two outside fixes at 120 m accuracy, 30 s apart, do nothing', async () => {
    const g = await safetyGame()
    await reportAcc(g, g.aina.token, 240, 120)
    await reportAcc(g, g.aina.token, 250, 120)
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(0)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(0)
    expect(notices('Aina')).toEqual([])
    // The marshal outside alert is unchanged (R1).
    expect(await evs(g.gameId, 'outside')).toHaveLength(1)
  })

  it('a good fix still warns, and a fix at exactly 50 m counts', async () => {
    const g = await safetyGame()
    await reportAcc(g, g.aina.token, 240, 50)
    expect(await evs(g.gameId, 'out-warned')).toHaveLength(1)
  })

  it('a poor fix between a warning and a good outside fix does not clear the warning', async () => {
    const g = await safetyGame()
    await reportAcc(g, g.aina.token, 240, 8) // warned
    await reportAcc(g, g.aina.token, 100, 120, 5_000) // inside, but too poor to clear
    expect((await player(g.gameId, g.aina.playerId)).out_warned_at).toBeTruthy()
    await reportAcc(g, g.aina.token, 250, 8, 30_000)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(1)
  })

  it('a failing push does not stop the event or the end of the game', async () => {
    const g = await safetyGame()
    await store.catchRunner(g.hafiz.playerId, g.ben.playerId)
    await report(g, g.aina.token, 240)
    const failing = (body: object) =>
      actions.location(
        {
          store,
          now,
          rng: seeded(7),
          push: async () => {
            throw new Error('push service down')
          },
          fetchJson: async () => {
            throw new Error('no fake reply')
          },
        },
        body,
      )
    now += 30_000
    await expect(failing({ code: g.code, token: g.aina.token, ...at(250) })).resolves.toEqual({ ok: true })
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(1)
    expect(await evs(g.gameId, 'final-whistle')).toHaveLength(1)
    now += 61_000
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    expect(await evs(g.gameId, 'ended')).toHaveLength(1)
  })

  it('keeps the existing marshal outside alert', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240)
    await report(g, g.aina.token, 250)
    await report(g, g.aina.token, 260)
    expect(await evs(g.gameId, 'outside')).toHaveLength(1)
    expect((await evs(g.gameId, 'outside'))[0].data).toEqual({ who: 'Aina #07' })
  })

  const disqualify = (id: string) => store.updatePlayers([{ id, patch: { disqualified_at: new Date(now).toISOString() } }])

  it('the game ends when the last free runner is disqualified, and the chasers win', async () => {
    const g = await safetyGame()
    await store.catchRunner(g.hafiz.playerId, g.ben.playerId)
    await report(g, g.aina.token, 240)
    expect(await evs(g.gameId, 'ended')).toHaveLength(0)
    await report(g, g.aina.token, 250)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(1)
    // The final whistle holds the end for 60 s (fair-play §1.4).
    expect(await evs(g.gameId, 'final-whistle')).toHaveLength(1)
    expect((await evs(g.gameId, 'final-whistle'))[0].data).toEqual({ cause: 'luar-garisan' })
    expect(await evs(g.gameId, 'ended')).toHaveLength(0)
    now += 61_000
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const ended = await evs(g.gameId, 'ended')
    expect(ended).toHaveLength(1)
    expect(ended[0].data).toEqual({ winner: 'chasers' })
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.phase).toBe('ended')
    expect(v.results?.winner).toBe('chasers')
    await report(g, g.aina.token, 260)
    expect(await evs(g.gameId, 'ended')).toHaveLength(1)
  })

  it('the game goes on while another runner is free', async () => {
    const g = await safetyGame()
    await report(g, g.aina.token, 240)
    await report(g, g.aina.token, 250)
    expect(await evs(g.gameId, 'luar-garisan')).toHaveLength(1)
    expect(await evs(g.gameId, 'ended')).toHaveLength(0)
  })

  it("a disqualified chaser's catch is refused", async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await disqualify(g.ben.playerId)
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({ ok: false, reason: 'disqualified' })
    expect((await player(g.gameId, g.aina.playerId)).jailed).toBe(false)
    expect(await evs(g.gameId, 'caught')).toHaveLength(0)
  })

  it('a disqualified runner cannot be caught', async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await disqualify(g.aina.playerId)
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({ ok: false, reason: 'already-out' })
    expect((await player(g.gameId, g.aina.playerId)).jailed).toBe(false)
    expect(await evs(g.gameId, 'caught')).toHaveLength(0)
  })

  it('a disqualified runner gets no check-in pushes', async () => {
    const g = await safetyGame()
    await disqualify(g.aina.playerId)
    now = T0 + 10 * MIN - 30_000
    pushes = []
    await run('state', { code: g.code, token: g.ben.token })
    const checkins = pushes.filter((p) => (p.payload as any).type === 'checkin').map((p) => p.endpoint)
    expect(checkins).toEqual(['https://push/Hafiz'])
  })

  it('a disqualified runner is never auto-jailed', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    await disqualify(g.aina.playerId)
    now = T0 + 20 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    expect(await evs(g.gameId, 'auto-jailed').then((es) => es.map((e) => e.target_id))).not.toContain(g.aina.playerId)
    const aina = await player(g.gameId, g.aina.playerId)
    expect(aina.jailed).toBe(false)
    expect(aina.disqualified_at).toBeTruthy()
  })

  it('a disqualified player cannot claim or use power-ups, jailbreak or Settle', async () => {
    const g = await safetyGame()
    const decoy = await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'decoy', station: 1 })
    await disqualify(g.aina.playerId)
    await disqualify(g.ben.playerId)
    const refused = { ok: false, reason: 'disqualified' }
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...at(0) })).toEqual(refused)
    expect(await run('claim', { code: g.code, token: g.ben.token, qr: stationQr(1), ...at(0) })).toEqual(refused)
    expect(await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: decoy.id })).toEqual(refused)
    expect(await run('grabPick', { code: g.code, token: g.aina.token, powerupId: decoy.id, choice: 0 })).toEqual(refused)
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(0) })).toEqual(refused)
    expect(await run('settle', { code: g.code, token: g.aina.token, qr: JAIL_QR, targetIds: [], ...at(0) })).toEqual(refused)
    expect((await store.powerUps(g.gameId)).find((u) => u.id === decoy.id)!.used_at).toBeNull()
  })

  it('Ah Long and Toyol cannot take from a disqualified player, and the Ah Long is not spent', async () => {
    const g = await safetyGame()
    const along = await store.addPowerUp({ game_id: g.gameId, player_id: g.ben.playerId, kind: 'along', station: 1 })
    await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'shield', station: 2 })
    await store.addPowerUp({ game_id: g.gameId, player_id: g.hafiz.playerId, kind: 'shield', station: 3 })
    await disqualify(g.aina.playerId)
    await disqualify(g.hafiz.playerId)
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: along.id })).toEqual({ ok: false, reason: 'nothing-to-steal' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === along.id)!.used_at).toBeNull()
    await disqualify(g.ben.playerId)
    expect(await store.stealFrom(g.gameId, 'chaser')).toBeNull()
  })

  it('jailbreak and Settle never free or count a disqualified player', async () => {
    const g = await safetyGame()
    await disqualify(g.aina.playerId)
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) }) // at Penjara
    expect(await run('jailbreak', { code: g.code, token: g.hafiz.token, qr: JAIL_QR })).toEqual({ ok: false, reason: 'nobody-to-free' })
    expect((await player(g.gameId, g.aina.playerId)).freed_once).toBe(false)
  })
})

describe('automatic alerts', () => {
  const kinds = async (code: string, organiserToken: string) =>
    (await run<View>('state', { code, organiserToken })).alerts.map((a) => a.kind)
  // around-me arenas are 200 m circles around CENTER; at(m) is m metres north of it.

  it('boundary jitter alerts once per real exit', async () => {
    const g = await safetyGame()
    const go = async (m: number) => {
      now += 5_000
      await run('location', { code: g.code, token: g.aina.token, ...at(m) })
    }
    await go(100) // inside
    await go(210) // 10 m outside: GPS noise
    expect(await kinds(g.code, g.organiserToken)).toEqual([])
    await go(240) // clearly outside
    await go(260)
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts.map((a) => a.text)).toEqual([
      'Aina #07 left the play area',
    ])
    await go(150) // back inside
    await go(240) // out again
    expect(await kinds(g.code, g.organiserToken)).toEqual(['outside', 'outside'])
  })

  it('a chaser walking off during hiding alerts once; the same during the chase does not', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 1 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(30) })
    expect(await kinds(g.code, g.organiserToken)).toEqual([])
    await run('location', { code: g.code, token: g.ben.token, ...at(100) })
    await run('location', { code: g.code, token: g.ben.token, ...at(120) })
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.alerts.map((a) => a.text)).toEqual(['Ben left the start early'])
    now = T0 + 7 * MIN
    await run('location', { code: g.code, token: g.hafiz.token, ...at(0) })
    await run('location', { code: g.code, token: g.ben.token, ...at(150) })
    expect(await kinds(g.code, g.organiserToken)).toEqual(['left-start'])
  })

  it('a runner who skips pings 1 and 2 is auto-jailed at ping 2, and the last one out ends the game', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    // Aina checks in for ping 1 (reveal at +10), Hafiz never does.
    now = T0 + 9.75 * MIN // inside ping 1's 45 s window
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    now = T0 + 10 * MIN
    expect(await kinds(g.code, g.organiserToken)).toEqual([])
    now = T0 + 15 * MIN
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.alerts.map((a) => a.text)).toEqual(['Hafiz #03 missed 2 check-ins, sent to Penjara'])
    const hafiz = (await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!
    expect(hafiz.jailed).toBe(true)
    expect(hafiz.caught_by).toBeNull()
    const events = await store.events(g.gameId)
    expect(events.some((e) => e.type === 'auto-jailed' && e.target_id === g.hafiz.playerId)).toBe(true)
    expect(events.some((e) => e.type === 'missed')).toBe(false)
    // Ping 3 (+20): Aina has now missed 2 in a row too, and she was the last runner free.
    now = T0 + 20 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    // Her screen shows the check-ins it was judged on: ping 1 on time, then pings 2 and 3 missed.
    const aina = (await store.events(g.gameId)).find((e) => e.type === 'auto-jailed' && e.target_id === g.aina.playerId)!
    expect(aina.data.checkins).toEqual([
      { revealAt: T0 + 10 * MIN, ok: true },
      { revealAt: T0 + 15 * MIN, ok: false },
      { revealAt: T0 + 20 * MIN, ok: false },
    ])
    expect(events.find((e) => e.type === 'auto-jailed')!.data.checkins).toEqual([
      { revealAt: T0 + 10 * MIN, ok: false },
      { revealAt: T0 + 15 * MIN, ok: false },
    ])
    // The final whistle holds the end for 60 s (fair-play §1.4).
    expect((await store.events(g.gameId)).find((e) => e.type === 'final-whistle')!.data).toEqual({ cause: 'auto-jail' })
    expect((await store.gameByCode(g.code))!.winner).toBeNull()
    now = T0 + 21 * MIN + 1_000
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    expect((await store.gameByCode(g.code))!.winner).toBe('chasers')
  })

  it('a runner freed just before a reveal does not inherit misses from before they were freed', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    const missedTexts = async () =>
      (await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts
        .map((a) => a.text)
        .filter((t) => t.includes('missed'))
    // Hafiz never checks in. He is caught at +12 and freed by Aina at +13.
    now = T0 + 9.75 * MIN // inside ping 1's 45 s window
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    now = T0 + 12 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
    now = T0 + 13 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    expect(await breakOut(g.code, g.aina.token)).toMatchObject({ ok: true })
    now = T0 + 14.75 * MIN // Aina checks in for ping 2
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    // Ping 2 (+15): only one miss since his release, so nothing yet.
    now = T0 + 15 * MIN
    expect(await missedTexts()).toEqual([])
    // Ping 3 (+20): his second miss since release, so he is auto-jailed, and stays there:
    // he has used his one escape.
    now = T0 + 20 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    expect(await missedTexts()).toContain('Hafiz #03 missed 2 check-ins, sent to Penjara')
    expect((await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(true)
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR })).toEqual({
      ok: false,
      reason: 'nobody-to-free',
    })
  })

  it('a missed bonus (Mat Rempit) ping never counts towards auto-jail', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    // Two bonus pings land between the scheduled ones; Hafiz ignores both.
    await store.addBonusPing(g.gameId, BONUS_SEQ_BASE, new Date(T0 + 11 * MIN).toISOString(), new Date(T0 + 11.5 * MIN).toISOString())
    await store.addBonusPing(g.gameId, BONUS_SEQ_BASE + 1, new Date(T0 + 16 * MIN).toISOString(), new Date(T0 + 16.5 * MIN).toISOString())
    for (const m of [9.9, 14.9, 19.9]) {
      now = T0 + m * MIN
      await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
      await run('location', { code: g.code, token: g.aina.token, ...at(10) })
      now = T0 + (m + 2) * MIN
      await run('state', { code: g.code, organiserToken: g.organiserToken })
    }
    expect((await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(false)
  })

  it('a location sent before the 60 s window does not count as a check-in', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    for (const m of [10, 15]) {
      now = T0 + m * MIN - 65_000 // 65 s before each reveal: just outside the window
      await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
      now = T0 + m * MIN - 20_000
      await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    }
    now = T0 + 15 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const ps = await store.players(g.gameId)
    expect(ps.find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(true)
    expect(ps.find((p) => p.id === g.aina.playerId)!.jailed).toBe(false)
  })

  it('a ping whose alert came before the release never counts towards auto-jail', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    const hafizJailed = async () => {
      await run('state', { code: g.code, organiserToken: g.organiserToken })
      return (await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed
    }
    const ainaChecksIn = async (m: number) => {
      now = T0 + m * MIN - 20_000
      await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    }
    // Hafiz never checks in. He is caught at +12 and freed at +15 min - 10 s: after ping 2's alert.
    await ainaChecksIn(10)
    now = T0 + 12 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
    await ainaChecksIn(15)
    now = T0 + 15 * MIN - 20_000
    expect(await breakOut(g.code, g.aina.token)).toMatchObject({ ok: true })
    now = T0 + 15 * MIN
    expect(await hafizJailed()).toBe(false)
    // Ping 2 doesn't count (its alert came before the release), so ping 3 is only his first miss.
    await ainaChecksIn(20)
    now = T0 + 20 * MIN
    expect(await hafizJailed()).toBe(false)
    await ainaChecksIn(25)
    now = T0 + 25 * MIN
    expect(await hafizJailed()).toBe(true)
  })

  describe('undoing an auto-jail', () => {
    /** Hafiz misses pings 1 and 2 and is auto-jailed at +15; Aina keeps checking in. */
    async function autoJailed() {
      const g = await safetyGame({ checkinMode: 'schedule' })
      for (const m of [10, 15]) {
        now = T0 + m * MIN - 20_000
        await run('location', { code: g.code, token: g.aina.token, ...at(10) })
      }
      now = T0 + 15 * MIN
      const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
      const alert = v.alerts.find((a) => a.kind === 'auto-jail')!
      return { ...g, eventId: alert.id }
    }
    const hafiz = async (gameId: string, id: string) => (await store.players(gameId)).find((p) => p.id === id)!

    it('frees the runner without using their one escape, and closes the alert', async () => {
      const g = await autoJailed()
      now = T0 + 15 * MIN + 10_000
      expect(await run('undoAutoJail', { code: g.code, organiserToken: g.organiserToken, eventId: g.eventId })).toEqual({ ok: true })
      const h = await hafiz(g.gameId, g.hafiz.playerId)
      expect(h.jailed).toBe(false)
      expect(h.freed_once).toBe(false)
      expect(h.freed_at).toBe(new Date(now).toISOString())
      const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
      expect(v.alerts.find((a) => a.id === g.eventId)!.handled).toBe(true)
      expect(v.feed[0].text).toBe('#03 is back in the game (marshal)')
      expect(store.safetyRows.at(-1)).toMatchObject({ type: 'auto-jail-undone', target_id: g.hafiz.playerId, data: { by: 'Organiser', target_name: 'Hafiz' } })
    })

    it('restarts the count: his next miss is only the first', async () => {
      const g = await autoJailed()
      now = T0 + 15 * MIN + 10_000
      await run('undoAutoJail', { code: g.code, token: g.siti.token, eventId: g.eventId })
      for (const m of [20, 25]) {
        now = T0 + m * MIN - 20_000
        await run('location', { code: g.code, token: g.aina.token, ...at(10) })
        now = T0 + m * MIN
        await run('state', { code: g.code, organiserToken: g.organiserToken })
        expect((await hafiz(g.gameId, g.hafiz.playerId)).jailed).toBe(m === 25)
      }
    })

    it("can't undo a chaser's catch", async () => {
      const g = await safetyGame()
      await run('location', { code: g.code, token: g.ben.token, ...at(0) })
      await run('location', { code: g.code, token: g.aina.token, ...at(10) })
      await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
      const caught = (await store.events(g.gameId)).find((e) => e.type === 'caught')!
      expect(await run('undoAutoJail', { code: g.code, organiserToken: g.organiserToken, eventId: caught.id })).toEqual({
        ok: false,
        reason: 'not-undoable',
      })
    })

    it("can't undo once the runner has been freed some other way", async () => {
      const g = await autoJailed()
      now = T0 + 15 * MIN + 10_000
      await run('location', { code: g.code, token: g.aina.token, ...at(10) })
      await breakOut(g.code, g.aina.token)
      expect(await run('undoAutoJail', { code: g.code, organiserToken: g.organiserToken, eventId: g.eventId })).toEqual({
        ok: false,
        reason: 'not-undoable',
      })
    })

    it('is for marshals only', async () => {
      const g = await autoJailed()
      await rejects(run('undoAutoJail', { code: g.code, token: g.aina.token, eventId: g.eventId }), 403, 'Marshals only')
    })

    it('two marshals undoing at the same moment free the runner once', async () => {
      const g = await autoJailed()
      const results = await Promise.all([
        run('undoAutoJail', { code: g.code, organiserToken: g.organiserToken, eventId: g.eventId }),
        run('undoAutoJail', { code: g.code, token: g.siti.token, eventId: g.eventId }),
      ])
      expect(results.filter((r) => r.ok)).toHaveLength(1)
      expect((await store.events(g.gameId)).filter((e) => e.type === 'auto-jail-undone')).toHaveLength(1)
      expect(store.safetyRows.filter((r) => r.type === 'auto-jail-undone')).toHaveLength(1)
    })

    it('only works once', async () => {
      const g = await autoJailed()
      await run('undoAutoJail', { code: g.code, organiserToken: g.organiserToken, eventId: g.eventId })
      expect(await run('undoAutoJail', { code: g.code, organiserToken: g.organiserToken, eventId: g.eventId })).toEqual({
        ok: false,
        reason: 'not-undoable',
      })
    })
  })

  it('a check-in just before a pause still counts after the pause', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    // Hafiz misses ping 1. For ping 2 (+15) he checks in at -30 s, then a 5-minute pause starts at -20 s.
    now = T0 + 9.75 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    now = T0 + 15 * MIN - 30_000
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    now = T0 + 15 * MIN - 20_000
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 20 * MIN - 20_000
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 20 * MIN // ping 2's reveal, moved by the pause
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    expect((await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(false)
  })

  it('no check-in is missed while the game is paused', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    // Aina checks in for ping 1; Hafiz never checks in. Paused from +14 to +20, so ping 2 moves to +21.
    now = T0 + 9 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    now = T0 + 14 * MIN
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 20 * MIN
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 21 * MIN - 1000
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    expect((await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(false)
    now = T0 + 21 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    expect((await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(true)
  })

  it('a catch on a runner who never sent a location counts and raises no alert', async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    now = T0 + 7 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    const r = await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
    expect(r).toMatchObject({ ok: true, flagged: false })
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.alerts).toEqual([])
  })

  /** Hafiz's last fix is `ageS` seconds old when Ben scans his armband from `distM` metres away (accuracy 8 m each). */
  async function catchHafizWithFixAge(ageS: number, distM = 10) {
    const g = await safetyGame()
    const scanAt = now
    now = scanAt - ageS * 1000
    await run('location', { code: g.code, token: g.hafiz.token, ...at(distM) })
    now = scanAt
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    pushes = []
    const r = await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    return { g, r, v }
  }

  it('an ordinary catch (3 min old fix, 100 m away) records no alert and sends no push', async () => {
    const { r, v } = await catchHafizWithFixAge(180, 100)
    expect(r).toMatchObject({ ok: true, flagged: false })
    expect(pushes.filter((p) => (p.payload as any).type === 'notice')).toEqual([])
    expect(v.alerts).toEqual([])
  })

  it('an implausible catch is refused: no caught event and the runner stays free', async () => {
    // Limit with a 3 min old fix is 50 + 8 + 8 + 1080 = 1146 m.
    const { g, r } = await catchHafizWithFixAge(180, 1300)
    expect(r).toEqual({ ok: false, reason: 'implausible' })
    expect((await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(false)
    expect((await store.events(g.gameId)).filter((e) => e.type === 'caught')).toEqual([])
    expect(pushes.filter((p) => (p.payload as any).type === 'notice')).toEqual([])
  })

  it('a borderline catch tells the runner and flags it for marshals', async () => {
    // 1000 m is over 80% of 1146 m but within it.
    const { g, r, v } = await catchHafizWithFixAge(180, 1000)
    expect(r).toMatchObject({ ok: true, flagged: true })
    const toHafiz = pushes.filter((p) => p.endpoint === 'https://push/Hafiz')
    expect(toHafiz).toEqual([
      {
        endpoint: 'https://push/Hafiz',
        payload: { type: 'notice', code: g.code, title: 'Kena tangkap!', body: 'Ben caught you. Not you? Tap to tell a marshal.', url: `/g/${g.code}?dispute=1` },
      },
    ])
    expect(pushes.filter((p) => (p.payload as any).type === 'notice')).toHaveLength(1)
    // (Hafiz's 1000 m-off fix also put him outside the play area; only the catch alert matters here.)
    expect(v.alerts.map((a) => a.text).filter((t) => t.startsWith('Check catch'))).toEqual(['Check catch: #03 by Ben (far from their last spot)'])
  })

  it('a catch on a fresh runner location sends no push and no alert', async () => {
    const { r, v } = await catchHafizWithFixAge(10)
    expect(r).toMatchObject({ ok: true, flagged: false })
    expect(pushes.filter((p) => (p.payload as any).type === 'notice')).toEqual([])
    expect(v.alerts).toEqual([])
  })

  it('a runner with no fix at all gets no push', async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    pushes = []
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
    expect(pushes.filter((p) => (p.payload as any).type === 'notice')).toEqual([])
  })

  it('a catch blocked by a shield sends no push', async () => {
    const g = await safetyGame()
    const shield = await store.addPowerUp({ game_id: g.gameId, player_id: g.hafiz.playerId, kind: 'shield', station: 3 })
    await run('usePowerup', { code: g.code, token: g.hafiz.token, powerupId: shield.id })
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    pushes = []
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })).toEqual({ ok: false, reason: 'shielded', name: 'Hafiz' })
    expect(pushes.filter((p) => (p.payload as any).type === 'notice')).toEqual([])
  })

  it('a failing push never undoes the catch (borderline catch)', async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    const scanAt = now
    now = scanAt - 180_000
    await run('location', { code: g.code, token: g.hafiz.token, ...at(1000) })
    now = scanAt
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    pushFails = true
    try {
      const r = await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
      expect(r).toMatchObject({ ok: true })
    } finally {
      pushFails = false
    }
    expect((await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(true)
  })
})

describe('review fixes: safety', () => {
  it('a removed player polling state gets no positions, alerts, feed or players', async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.siti.token, ...at(5) })
    await run('sos', { code: g.code, token: g.hafiz.token, ...at(40) })
    now = T0 + 11 * MIN
    for (const who of [g.ben, g.aina, g.siti]) {
      await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: who.playerId })
      const v = await run<View>('state', { code: g.code, token: who.token })
      expect(v.me.removed_at).toBeTruthy()
      expect(v.dots).toEqual([])
      expect(v.alerts).toEqual([])
      expect(v.feed).toEqual([])
      expect(v.roster).toEqual([])
      expect(v.reportable).toEqual([])
      expect(v.stations).toEqual([])
    }
  })

  it('the organiser can turn on alerts and gets SOS pushes', async () => {
    const g = await safetyGame()
    await run('subscribe', { code: g.code, organiserToken: g.organiserToken, subscription: { endpoint: 'https://push/organiser' } })
    const r = await run('sos', { code: g.code, token: g.aina.token })
    expect(r).toMatchObject({ ok: true, notified: 2 })
    expect(pushes.map((p) => p.endpoint).sort()).toEqual(['https://push/Siti', 'https://push/organiser'])
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).me.push).toEqual({ endpoint: 'https://push/organiser' })
  })

  it('SOS says when no marshal could be reached', async () => {
    const g = await safetyGame()
    await store.updatePlayers([{ id: g.siti.playerId, patch: { push: null } }])
    expect(await run('sos', { code: g.code, token: g.aina.token })).toMatchObject({ ok: true, notified: 0 })
  })

  it('safety records keep the game code and names, so they make sense after the game is wiped', async () => {
    const g = await safetyGame()
    await run('sos', { code: g.code, token: g.aina.token })
    await run('report', { code: g.code, token: g.hafiz.token, targetId: g.ben.playerId, reason: 'unsafe' })
    await run('removePlayer', { code: g.code, token: g.siti.token, playerId: g.ben.playerId })
    const [sos, report, removed] = store.safetyRows
    expect(sos.data).toMatchObject({ game_code: g.code, name: 'Aina #07' })
    expect(report.data).toMatchObject({ game_code: g.code, name: 'Hafiz #03', target_name: 'Ben', reason: 'unsafe' })
    expect(removed.data).toMatchObject({ game_code: g.code, by: 'Siti', target_name: 'Ben' })
  })
})

describe('saved arenas', () => {
  const M = 111_195
  /** dx metres east, dy metres north of CENTER. */
  const pt = (dx: number, dy: number) => ({ lat: CENTER.lat + dy / M, lng: CENTER.lng + dx / (M * Math.cos((CENTER.lat * Math.PI) / 180)) })
  const rect = (x0: number, y0: number, x1: number, y1: number) => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)]
  const lake = rect(-50, -50, 50, 50)
  const draft = (over: object = {}) => ({
    name: 'Test Park',
    source: 'osm',
    osmRef: 'way/1',
    outline: rect(-200, -200, 200, 200),
    circle: null,
    water: [lake],
    toilets: [],
    waterChecked: true,
    jail: pt(100, 100),
    start: pt(-100, 100),
    stations: [pt(150, 0), pt(-150, 0)],
    ...over,
  })

  it('saved arena round trip', async () => {
    const organiserToken = await createOrganiser()
    const { arenaId } = await run('saveArena', { organiserToken, draft: draft() })
    const { arenas } = await run('listArenas', { organiserToken })
    expect(arenas).toHaveLength(1)
    expect(arenas[0]).toMatchObject({ id: arenaId, name: 'Test Park', waterChecked: true, problems: [] })
    expect(arenas[0].draft).toMatchObject({ name: 'Test Park', osmRef: 'way/1', jail: pt(100, 100) })
    expect(Math.abs(arenas[0].areaHa - 15)).toBeLessThan(0.3)
    const { code } = await run('create', { organiserToken, savedArenaId: arenaId })
    const game = (await store.gameByCode(code))!
    expect(game.arena.stations).toEqual([pt(150, 0), pt(-150, 0)])
    expect(game.arena.holes).toHaveLength(1)
  })

  it('arenas are scoped to the organisation', async () => {
    const mine = await createOrganiser()
    const theirs = await createOrganiser()
    const { arenaId } = await run('saveArena', { organiserToken: mine, draft: draft() })
    await rejects(run('create', { organiserToken: theirs, savedArenaId: arenaId }), 404, 'Arena not found')
    await rejects(run('saveArena', { organiserToken: theirs, arenaId, draft: draft({ name: 'Mine now' }) }), 404)
    await rejects(run('deleteArena', { organiserToken: theirs, arenaId }), 404)
    await rejects(run('recheckWater', { organiserToken: theirs, arenaId }), 404)
    expect((await run('listArenas', { organiserToken: theirs })).arenas).toEqual([])
    await rejects(run('listArenas', {}), 403)
  })

  it('per-game overrides change the game, not the saved arena', async () => {
    const organiserToken = await createOrganiser()
    const { arenaId } = await run('saveArena', { organiserToken, draft: draft() })
    const { code } = await run('create', { organiserToken, savedArenaId: arenaId, overrides: { jail: pt(-100, -100), stations: [pt(0, 150)] } })
    const game = (await store.gameByCode(code))!
    expect(game.arena.jail).toEqual(pt(-100, -100))
    expect(game.arena.stations).toEqual([pt(0, 150)])
    expect(game.arena.start).toEqual(pt(-100, 100))
    const saved = (await store.arenaById(arenaId))!
    expect(saved.arena.jail).toEqual(pt(100, 100))
    expect(saved.arena.stations).toHaveLength(2)
    await rejects(
      run('create', { organiserToken, savedArenaId: arenaId, overrides: { jail: pt(0, 0) } }),
      400,
      'Penjara must be inside the play area',
    )
  })

  it('editing or deleting a saved arena leaves existing games alone', async () => {
    const organiserToken = await createOrganiser()
    const { arenaId } = await run('saveArena', { organiserToken, draft: draft() })
    const { code } = await run('create', { organiserToken, savedArenaId: arenaId })
    const before = (await store.gameByCode(code))!.arena
    await run('saveArena', { organiserToken, arenaId, draft: draft({ name: 'Renamed', stations: [] }) })
    expect((await store.arenaById(arenaId))!.name).toBe('Renamed')
    await run('deleteArena', { organiserToken, arenaId })
    expect(await store.arenaById(arenaId)).toBeNull()
    expect((await store.gameByCode(code))!.arena).toEqual(before)
  })

  it('standing in the lake counts as outside the play area', async () => {
    const g = await readyGame({}, { draft: draft() })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    const kinds = async () => (await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts.map((a) => a.kind)
    await run('location', { code: g.code, token: g.aina.token, ...pt(0, 40), accuracy_m: 5 }) // 10 m into the lake
    expect(await kinds()).toEqual([])
    await run('location', { code: g.code, token: g.aina.token, ...pt(0, 20), accuracy_m: 5 }) // 30 m in
    expect(await kinds()).toEqual(['outside'])
    await run('location', { code: g.code, token: g.aina.token, ...pt(0, 100), accuracy_m: 5 }) // back on land
    await run('location', { code: g.code, token: g.aina.token, ...pt(0, 15), accuracy_m: 5 }) // in again
    expect(await kinds()).toEqual(['outside', 'outside'])
  })

  it('recheckWater clears the flag and reports misplaced points', async () => {
    const organiserToken = await createOrganiser()
    const { arenaId } = await run('saveArena', {
      organiserToken,
      draft: draft({ water: [], waterChecked: false, jail: pt(0, 0) }),
    })
    expect((await run('listArenas', { organiserToken })).arenas[0].waterChecked).toBe(false)
    const geometry = (r: { lat: number; lng: number }[]) => [...r, r[0]].map((p) => ({ lat: p.lat, lon: p.lng }))
    osmReplies.push({ elements: [{ type: 'way', id: 5, tags: { natural: 'water' }, geometry: geometry(lake) }] })
    expect(await run('recheckWater', { organiserToken, arenaId })).toEqual({
      waterChecked: true,
      problems: ['Penjara must be inside the play area'],
    })
    const [listed] = (await run('listArenas', { organiserToken })).arenas
    expect(listed).toMatchObject({ waterChecked: true, problems: ['Penjara must be inside the play area'] })
    expect(listed.arena.holes).toHaveLength(1)
    await rejects(run('create', { organiserToken, savedArenaId: arenaId }), 400, 'Penjara must be inside the play area')
  })

  it('recheckWater keeps the flag when Overpass is still down', async () => {
    const organiserToken = await createOrganiser()
    const { arenaId } = await run('saveArena', { organiserToken, draft: draft({ water: [], waterChecked: false }) })
    osmReplies.push(new Error('504'))
    expect(await run('recheckWater', { organiserToken, arenaId })).toEqual({ waterChecked: false, problems: [] })
  })

  it('searchParks needs at least 3 letters and goes through the cache', async () => {
    const organiserToken = await createOrganiser()
    await rejects(run('searchParks', { organiserToken, query: 'kl' }), 400, 'Type at least 3 letters')
    osmReplies.push([])
    await run('searchParks', { organiserToken, query: 'Taman Tasik Titiwangsa' })
    expect(await run('searchParks', { organiserToken, query: 'taman tasik titiwangsa' })).toEqual({ parks: [], around: null })
    expect(osmCalls).toHaveLength(1)
  })

  it('nearbyParks is organiser-only and checks the centre', async () => {
    await rejects(run('nearbyParks', { organiserToken: 'nope', center: { lat: 3.06, lng: 101.7 } }), 403)
    const organiserToken = await createOrganiser()
    for (const center of [undefined, null, { lat: 'x', lng: 101 }, { lat: NaN, lng: 101 }, { lat: 3 }, { lat: 51.5, lng: -0.1 }, { lat: 3.06, lng: 301 }]) {
      await rejects(run('nearbyParks', { organiserToken, center }), 400)
    }
    expect(osmCalls).toHaveLength(0)
  })

  it('nearbyParks returns named parks, skips listed refs, and answers [] when Overpass fails', async () => {
    const organiserToken = await createOrganiser()
    const ring = (id: number, name?: string) => ({
      type: 'way',
      id,
      tags: { leisure: 'park', ...(name ? { name } : {}) },
      geometry: [
        { lat: 3.06, lon: 101.7 },
        { lat: 3.06, lon: 101.703 },
        { lat: 3.063, lon: 101.703 },
        { lat: 3.063, lon: 101.7 },
        { lat: 3.06, lon: 101.7 },
      ],
    })
    osmReplies.push({ elements: [ring(1, 'Taman A'), ring(2, 'Taman B'), ring(3)] })
    const r = (await run('nearbyParks', { organiserToken, center: { lat: 3.0618, lng: 101.6993 }, skip: ['way/2'] })) as { nearby: { name: string }[] }
    expect(r.nearby.map((p) => p.name)).toEqual(['Taman A'])
    osmReplies.push(new Error('504'))
    expect(await run('nearbyParks', { organiserToken, center: { lat: 3.1, lng: 101.6 } })).toEqual({ nearby: [] })
  })

  it('parkFeatures returns lakes and toilets for an outline', async () => {
    const organiserToken = await createOrganiser()
    osmReplies.push({ elements: [{ type: 'node', id: 1, lat: 3.0001, lon: 101.0001, tags: { amenity: 'toilets' } }] })
    expect(await run('parkFeatures', { organiserToken, outline: rect(-200, -200, 200, 200) })).toEqual({
      water: [],
      toilets: [{ lat: 3.0001, lng: 101.0001 }],
      waterChecked: true,
    })
    await rejects(run('parkFeatures', { organiserToken, outline: [pt(0, 0)] }), 400)
  })

  it('create refuses an over-cap park without a circle', async () => {
    const organiserToken = await createOrganiser()
    await rejects(
      run('create', { organiserToken, draft: draft({ outline: rect(-500, -500, 500, 500), water: [], jail: null, start: null, stations: [] }) }),
      400,
      'Too big. Use part of the park (circle).',
    )
    await rejects(run('saveArena', { organiserToken, draft: { name: 'x' } }), 400, 'Invalid play area')
  })
})

describe('the chaser snapshot at check-in (checkins design §5)', () => {
  it("a runner who missed the last ping still sees the chasers from the alert of the one she checked into", async () => {
    const g = await safetyGame({ checkinMode: 'schedule', mode: 'full', chaserSnapshot: true })
    // Ben stands 50 m north at ping 1's alert (+9:15), then walks off.
    now = T0 + 9 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(50) })
    now = T0 + 9.75 * MIN // inside ping 1's window
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
    await run('location', { code: g.code, token: g.ben.token, ...at(150) })
    // Aina misses ping 2 (a location at +12 is outside its window); Ben keeps moving.
    now = T0 + 12 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    now = T0 + 15.9 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(170) })
    now = T0 + 16 * MIN
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.chaserSnapshot?.positions).toHaveLength(1)
    const ben = v.chaserSnapshot!.positions[0]
    expect(ben).toMatchObject({ name: 'Ben', stale: false })
    expect(Math.abs((ben.lat - CENTER.lat) * 111_195 - 50)).toBeLessThanOrEqual(30)
    // The ping 1 reveal recorded who checked in, which is how the view still knows at +16.
    const ping1 = (await store.events(g.gameId)).find((e) => e.type === 'ping' && e.data.seq === 1)!
    expect(ping1.data.checkedIn).toEqual(expect.arrayContaining([g.aina.playerId, g.hafiz.playerId]))
    // The chaser never gets a snapshot of their own.
    expect((await run<View>('state', { code: g.code, token: g.ben.token })).chaserSnapshot).toBeNull()
  })

  it('a runner freed after the alert has not checked in for that window, even with a location inside it', async () => {
    const g = await safetyGame({ checkinMode: 'schedule', mode: 'full', chaserSnapshot: true })
    now = T0 + 9.75 * MIN // Aina checks in for ping 1; Hafiz doesn't
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    now = T0 + 12 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
    // Ping 2's alert is at +14:15. Aina frees Hafiz at +14:30, and he sends a location inside the window.
    now = T0 + 14.5 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    expect(await breakOut(g.code, g.aina.token)).toMatchObject({ ok: true })
    now = T0 + 14.75 * MIN
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
    now = T0 + 16 * MIN
    const v = await run<View>('state', { code: g.code, token: g.hafiz.token })
    const ping2 = (await store.events(g.gameId)).find((e) => e.type === 'ping' && e.data.seq === 2)!
    expect(ping2.data.checkedIn).toEqual([g.aina.playerId])
    expect(v.chaserSnapshot).toBeNull()
  })

  it('with the switch off, reveals record nothing new and nobody gets a snapshot', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    now = T0 + 9.75 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(50) })
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    now = T0 + 10.5 * MIN
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).chaserSnapshot).toBeNull()
    const ping1 = (await store.events(g.gameId)).find((e) => e.type === 'ping' && e.data.seq === 1)!
    expect(ping1.data.checkedIn).toBeUndefined()
  })
})

describe('Dato Seri: the hidden stash (jail design §4b, §4c)', () => {
  const STASH = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const atStash = { lat: STASH.lat, lng: STASH.lng, accuracy_m: 8 }

  /** A Full game in the lobby with Siti as marshal. */
  async function lobby() {
    const g = await readyGame({ mode: 'full' })
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    return { ...g, siti, gameId: (await store.gameByCode(g.code))!.id }
  }
  async function chasing(drop = true) {
    const g = await lobby()
    await legacyCard(g.code, 'dato', drop ? STASH : null)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    return g
  }
  const stash = async (g: { code: string }) => (await store.gameByCode(g.code))!.dato_stash
  /** This game's own ★ card code (ruling R15). */
  const cardCode = async (g: { code: string }) => (await stash(g))!.code!
  const scanQr = (g: { code: string }, token: string, qr: string, where: object = atStash) => run('claim', { code: g.code, token, qr, ...where })
  const scan = async (g: { code: string }, token: string, where: object = atStash) => scanQr(g, token, datoQr(await cardCode(g)), where)
  const CODE = expect.stringMatching(/^[A-Za-z0-9_-]{22}$/)
  const CARD = { id: expect.any(String), letter: expect.stringMatching(/^[ABC]$/) }

  it("only this game's card claims: a bare, another game's or a made-up card gets the same answer as no stash", async () => {
    const g = await chasing()
    const other = await lobby()
    await legacyCard(other.code, 'dato', null)
    for (const qr of ['KEJAR:DATO', datoQr(await cardCode(other)), datoQr('x'.repeat(22)), 'KEJAR:DATO:'])
      expect(await scanQr(g, g.aina.token, qr)).toEqual({ ok: false, reason: 'no-stash' })
    // Even for a chaser, or far away: a wrong card says nothing about where or whose the stash is.
    expect(await scanQr(g, g.ben.token, 'KEJAR:DATO')).toEqual({ ok: false, reason: 'no-stash' })
    expect(await scanQr(g, g.aina.token, 'KEJAR:DATO', { lat: CENTER.lat, lng: CENTER.lng, accuracy_m: 8 })).toEqual({ ok: false, reason: 'no-stash' })
    expect((await stash(g))!.claimedBy).toBeNull()
    // Aina has used up her wrong scans by now, so Hafiz claims it.
    expect(await scan(g, g.hafiz.token)).toEqual({ ok: true, kind: 'dato' })
  })

  it('a stash made but not yet dropped claims nothing and shows no zone', async () => {
    const g = await chasing(false)
    expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'no-stash' })
    expect(await run<View>('state', { code: g.code, token: g.aina.token })).not.toHaveProperty('legendaryZone')
  })

  it("the card's code never reaches a player, a marshal or the organiser's view", async () => {
    const g = await chasing()
    const code = await cardCode(g)
    for (const token of [g.aina.token, g.hafiz.token, g.ben.token, g.siti.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(JSON.stringify(v)).not.toContain(code)
      expect(v).not.toHaveProperty('datoCode')
      expect(v).not.toHaveProperty('datoCard')
    }
    const host = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(host).not.toHaveProperty('datoCard')
    expect(JSON.stringify(host)).not.toContain(code)
    const claimed = await scan(g, g.aina.token)
    expect(JSON.stringify(claimed)).not.toContain(code)
    expect(JSON.stringify(await run<View>('state', { code: g.code, token: g.aina.token }))).not.toContain(code)
  })

  it('the first runner to scan the stash claims Dato Seri; it stops working after', async () => {
    const g = await chasing()
    expect(await scan(g, g.aina.token)).toEqual({ ok: true, kind: 'dato' })
    expect(await stash(g)).toEqual({ code: CODE, card: CARD, ...STASH, claimedBy: g.aina.playerId, claimedAt: new Date(now).toISOString() })
    const held = (await store.powerUps(g.gameId)).filter((u) => u.kind === 'dato')
    expect(held).toEqual([expect.objectContaining({ player_id: g.aina.playerId, station: null, used_at: null, sealed: false })])
    expect(await scan(g, g.hafiz.token)).toEqual({ ok: false, reason: 'no-stash' })
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'dato')).toHaveLength(1)
  })

  it('a chaser scanning the stash is refused, not consumed', async () => {
    const g = await chasing()
    expect(await scan(g, g.ben.token)).toEqual({ ok: false, reason: 'cannot-claim' })
    expect((await stash(g))!.claimedBy).toBeNull()
    expect(await scan(g, g.aina.token)).toEqual({ ok: true, kind: 'dato' })
  })

  it('a marshal or a jailed runner is refused with nothing changed', async () => {
    const g = await chasing()
    expect(await scan(g, g.siti.token)).toEqual({ ok: false, reason: 'cannot-claim' })
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: true } }])
    expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'cannot-claim' })
    expect((await stash(g))!.claimedBy).toBeNull()
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'dato')).toHaveLength(0)
  })

  it('needs a fresh position within 30 m of the stash, forgiving GPS error as stations do', async () => {
    const g = await chasing()
    expect(await scan(g, g.aina.token, { lat: CENTER.lat, lng: CENTER.lng, accuracy_m: 8 })).toEqual({ ok: false, reason: 'too-far' })
    await run('location', { code: g.code, token: g.hafiz.token, ...atStash })
    now += 31_000
    expect(await scan(g, g.hafiz.token, {})).toEqual({ ok: false, reason: 'too-far' })
    // 45 m off with 20 m accuracy is within 30 + 20.
    const near = { lat: STASH.lat + 45 / 111_195, lng: STASH.lng, accuracy_m: 20 }
    expect(await scan(g, g.hafiz.token, near)).toEqual({ ok: true, kind: 'dato' })
  })

  it('a full slot is refused with hand-full and the stash stays claimable', async () => {
    const g = await chasing()
    await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'cloak', station: 1 })
    expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'hand-full' })
    expect((await stash(g))!.claimedBy).toBeNull()
    expect(await scan(g, g.hafiz.token)).toEqual({ ok: true, kind: 'dato' })
  })

  it('is refused before the chase, while paused, and when no stash was dropped', async () => {
    const g = await lobby()
    await legacyCard(g.code, 'dato', STASH)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 2 * MIN // hiding
    expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'not-chasing' })
    now = T0 + 7 * MIN
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'paused' })
    now = T0
    const none = await chasing(false)
    expect(await scan(none, none.aina.token)).toEqual({ ok: false, reason: 'no-stash' })
  })

  it('two runners scanning at the same moment: exactly one gets it', async () => {
    const g = await chasing()
    const [a, b] = await Promise.all([scan(g, g.aina.token), scan(g, g.hafiz.token)])
    expect([a, b].filter((r) => r.ok)).toHaveLength(1)
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'dato')).toHaveLength(1)
  })

  it('Dato Seri is secret: the feed never names it or the finder', async () => {
    const g = await chasing()
    await scan(g, g.aina.token)
    for (const token of [g.hafiz.token, g.ben.token, g.siti.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(v.feed[0].text).toBe('Something legendary was found.')
      const lines = v.feed.map((f) => f.text)
      expect(lines.filter((t) => /Aina/.test(t))).toEqual(['Aina joined'])
      expect(lines.join(' ')).not.toMatch(/Dato|picked up/)
    }
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).feed[0].text).toBe('Something legendary was found.')
    // The finder's reveal is their own claim result and hand.
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).hand.map((u) => u.kind)).toEqual(['dato'])
  })

  it('no player sees a hint zone around the stash any more (the Tupperware side quest replaced it)', async () => {
    const g = await lobby()
    await legacyCard(g.code, 'dato', STASH)
    expect(await run<View>('state', { code: g.code, token: g.aina.token })).not.toHaveProperty('legendaryZone')
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 2 * MIN // hiding: not yet
    expect(await run<View>('state', { code: g.code, token: g.aina.token })).not.toHaveProperty('legendaryZone')
    now = T0 + 7 * MIN
    for (const token of [g.aina.token, g.hafiz.token, g.ben.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(v).not.toHaveProperty('legendaryZone')
      expect(v).not.toHaveProperty('datoStash')
      expect(JSON.stringify(v)).not.toMatch(/dato/i)
    }
    await scan(g, g.hafiz.token)
    for (const token of [g.aina.token, g.hafiz.token, g.ben.token]) {
      expect(await run<View>('state', { code: g.code, token })).not.toHaveProperty('legendaryZone')
    }
  })

  it('the organiser sees the exact stash instead of the zone; a marshal sees neither the stash nor the legendaries', async () => {
    const g = await chasing()
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.datoStash).toEqual({ ...STASH, claimedBy: null, claimedAt: null })
    expect(v).not.toHaveProperty('legendaryZone')
    expect(v.settings.legendaries).toEqual({ dato: 'stash', bomoh: 'off', ring: 'off', hijau: 'off' })
    const m = await run<View>('state', { code: g.code, token: g.siti.token })
    expect(m).not.toHaveProperty('datoStash')
    expect(m).not.toHaveProperty('datoCode')
    expect(m).not.toHaveProperty('datoCard')
    expect(m.settings).not.toHaveProperty('legendaries')
    expect(JSON.stringify(m)).not.toContain(await cardCode(g))
  })

  it('claiming the stash retires its card, with found_at', async () => {
    const g = await chasing()
    const card = (await stash(g))!.card!
    expect(await scan(g, g.aina.token)).toEqual({ ok: true, kind: 'dato' })
    const org = (await store.organiserBySessionTokenHash(hashToken(g.organiserToken)))!.organisation_id
    expect((await store.secretCards(org)).find((c) => c.id === card.id)).toMatchObject({ state: 'retired', found_at: new Date(now).toISOString() })
  })

  describe('the wrong-scan limit (Review Focus 2)', () => {
    const far = { lat: CENTER.lat, lng: CENTER.lng, accuracy_m: 8 }
    const misses = async (g: { gameId: string }) => (await store.events(g.gameId)).filter((e) => e.type === 'stash-miss')

    it('a copied card walked round the zone: 3 wrong scans are recorded, the 4th at the right spot is ignored, and someone else still claims it', async () => {
      const g = await chasing()
      const feedBefore = (await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).feed
      const spots = [far, { ...far, lat: CENTER.lat - 60 / 111_195 }, { ...far, lng: CENTER.lng + 60 / 111_195 }]
      for (const where of spots) expect((await scan(g, g.aina.token, where)).ok).toBe(false)
      expect(await misses(g)).toEqual([0, 1, 2].map(() => expect.objectContaining({ actor_id: g.aina.playerId, target_id: null, data: { legendary: 'dato' } })))
      // The 4th, right code at the right spot: the same neutral answer, nothing changes and nothing is recorded.
      expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'no-stash' })
      expect(await misses(g)).toHaveLength(3)
      expect((await stash(g))!.claimedBy).toBeNull()
      expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'dato')).toHaveLength(0)
      // Never in a feed or an alert.
      const views = [
        await run<View>('state', { code: g.code, organiserToken: g.organiserToken }),
        ...(await Promise.all([g.aina.token, g.hafiz.token, g.ben.token, g.siti.token].map((token) => run<View>('state', { code: g.code, token })))),
      ]
      expect(views[0].feed).toEqual(feedBefore)
      const missIds = (await misses(g)).map((e) => e.id)
      for (const v of views) {
        expect(JSON.stringify(v)).not.toContain('stash-miss')
        for (const id of missIds) expect(v.alerts.map((a) => a.id)).not.toContain(id)
      }
      expect(await scan(g, g.hafiz.token)).toEqual({ ok: true, kind: 'dato' })
    })

    it('wrong codes and no stash count as misses too', async () => {
      const g = await chasing()
      await scanQr(g, g.aina.token, 'KEJAR:DATO')
      await scanQr(g, g.aina.token, datoQr('x'.repeat(22)))
      await scanQr(g, g.aina.token, datoQr('y'.repeat(22)))
      expect(await misses(g)).toHaveLength(3)
      expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'no-stash' })
      expect((await stash(g))!.claimedBy).toBeNull()
    })
  })

  it('scans refused for not chasing, cannot claim, a full slot or a lost race are not misses (ruling R4)', async () => {
    const g = await lobby()
    await legacyCard(g.code, 'dato', STASH)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 2 * MIN // hiding
    for (let k = 0; k < 3; k++) expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'not-chasing' })
    now = T0 + 7 * MIN
    for (let k = 0; k < 3; k++) expect(await scan(g, g.ben.token)).toEqual({ ok: false, reason: 'cannot-claim' })
    const cloak = await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'cloak', station: 1 })
    for (let k = 0; k < 3; k++) expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'hand-full' })
    expect((await store.events(g.gameId)).filter((e) => e.type === 'stash-miss')).toHaveLength(0)
    await store.updatePowerUp(cloak.id, { taken_at: new Date(now).toISOString() })
    expect(await scan(g, g.aina.token)).toEqual({ ok: true, kind: 'dato' })
  })

  it('Dato Seri cannot be used from the slot like other cards; it is for Settle', async () => {
    const g = await chasing()
    await scan(g, g.aina.token)
    const dato = (await store.powerUps(g.gameId)).find((u) => u.kind === 'dato')!
    expect(await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: dato.id })).toEqual({ ok: false, reason: 'settle-at-penjara' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === dato.id)!.used_at).toBeNull()
  })

  it('a Core game never has a zone', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    expect(await run<View>('state', { code: g.code, token: g.aina.token })).not.toHaveProperty('legendaryZone')
  })
})

describe('Bomoh: the hidden stash (chaser-side legendary, mirrors Dato Seri above)', () => {
  const STASH = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const atStash = { lat: STASH.lat, lng: STASH.lng, accuracy_m: 8 }

  /**
   * A Full game in the lobby, Bomoh on and Dato Seri off, with two chasers (Ben and Hafiz) so a claim can be
   * raced, and Chong joining as a second runner so the teams still validate.
   */
  async function lobby() {
    const g = await readyGame({ mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } })
    const chong = await run('join', { code: g.code, name: 'Chong', accepted: true })
    await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [g.hafiz.playerId]: 'chaser', [chong.playerId]: 'runner' } })
    await run('linkTag', { code: g.code, token: chong.token, tagId: 5 })
    return { ...g, chong, gameId: (await store.gameByCode(g.code))!.id }
  }
  async function chasing(drop = true) {
    const g = await lobby()
    await legacyCard(g.code, 'bomoh', drop ? STASH : null)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    return g
  }
  const stash = async (g: { code: string }) => (await store.gameByCode(g.code))!.bomoh_stash
  /** This game's own Bomoh card code (ruling R15). */
  const cardCode = async (g: { code: string }) => (await stash(g))!.code!
  const scanQr = (g: { code: string }, token: string, qr: string, where: object = atStash) => run('claim', { code: g.code, token, qr, ...where })
  const scan = async (g: { code: string }, token: string, where: object = atStash) => scanQr(g, token, bomohQr(await cardCode(g)), where)

  it('a chaser in reach of the dropped, unclaimed stash with the right code claims Bomoh; it retires the card and stops working after', async () => {
    const g = await chasing()
    const card = (await stash(g))!.card!
    expect(await scan(g, g.ben.token)).toEqual({ ok: true, kind: 'bomoh' })
    expect((await stash(g))!.claimedBy).toBe(g.ben.playerId)
    expect((await stash(g))!.claimedAt).toBe(new Date(now).toISOString())
    const org = (await store.organiserBySessionTokenHash(hashToken(g.organiserToken)))!.organisation_id
    expect((await store.secretCards(org)).find((c) => c.id === card.id)).toMatchObject({ state: 'retired', found_at: new Date(now).toISOString() })
    // Already claimed: nobody else can take it.
    expect(await scan(g, g.hafiz.token)).toEqual({ ok: false, reason: 'no-stash' })
    // Unlike Dato Seri, Bomoh activates on claim: no powerups row is ever added for it.
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'bomoh')).toHaveLength(0)
  })

  it('Bomoh is secret: the feed never names it or the finder', async () => {
    const g = await chasing()
    await scan(g, g.ben.token)
    for (const token of [g.hafiz.token, g.aina.token, g.chong.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(v.feed[0].text).toBe('Something legendary was found.')
      expect(v.feed.map((f) => f.text).join(' ')).not.toMatch(/Bomoh|picked up/)
    }
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).feed[0].text).toBe('Something legendary was found.')
  })

  it("only this game's card claims: a bare, another game's or a made-up card is a silent miss, same as no stash", async () => {
    const g = await chasing()
    const other = await lobby()
    await legacyCard(other.code, 'bomoh', STASH)
    for (const qr of ['KEJAR:BOMOH', bomohQr(await cardCode(other)), bomohQr('x'.repeat(22)), 'KEJAR:BOMOH:'])
      expect(await scanQr(g, g.ben.token, qr)).toEqual({ ok: false, reason: 'no-stash' })
    expect((await stash(g))!.claimedBy).toBeNull()
    // Hafiz still claims it: the wrong scans above were Ben's misses, not a change to the stash itself.
    expect(await scan(g, g.hafiz.token)).toEqual({ ok: true, kind: 'bomoh' })
  })

  it('the wrong-scan limit: STASH_MISS_LIMIT misses lock a player out, even at the right spot after, but someone else can still claim it', async () => {
    const g = await chasing()
    for (let i = 0; i < STASH_MISS_LIMIT; i++) {
      expect(await scanQr(g, g.ben.token, 'KEJAR:BOMOH')).toEqual({ ok: false, reason: 'no-stash' })
    }
    // A genuine scan at the right spot is now ignored for Ben.
    expect(await scan(g, g.ben.token)).toEqual({ ok: false, reason: 'no-stash' })
    expect(await scan(g, g.hafiz.token)).toEqual({ ok: true, kind: 'bomoh' })
  })

  it('two chasers scanning at the same moment: exactly one gets it', async () => {
    const g = await chasing()
    const [a, b] = await Promise.all([scan(g, g.ben.token), scan(g, g.hafiz.token)])
    expect([a, b].filter((r: { ok: boolean }) => r.ok)).toHaveLength(1)
    expect((await stash(g))!.claimedBy).not.toBeNull()
  })

  it('a runner (not a chaser) is rejected as cannot-claim, and it is not counted as a miss', async () => {
    const g = await chasing()
    expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'cannot-claim' })
    expect((await stash(g))!.claimedBy).toBeNull()
    // Not a miss: no stash-miss event was recorded for Aina, and the stash still claims.
    expect((await store.events(g.gameId)).filter((e) => e.type === 'stash-miss')).toHaveLength(0)
    expect(await scan(g, g.ben.token)).toEqual({ ok: true, kind: 'bomoh' })
  })

  it('scans refused for not chasing or cannot claim are not misses either (ruling R4, mirrors Dato Seri)', async () => {
    const g = await lobby()
    await legacyCard(g.code, 'bomoh', STASH)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 2 * MIN // hiding
    for (let k = 0; k < 3; k++) expect(await scan(g, g.ben.token)).toEqual({ ok: false, reason: 'not-chasing' })
    now = T0 + 7 * MIN
    for (let k = 0; k < 3; k++) expect(await scan(g, g.aina.token)).toEqual({ ok: false, reason: 'cannot-claim' })
    expect((await store.events(g.gameId)).filter((e) => e.type === 'stash-miss')).toHaveLength(0)
    expect(await scan(g, g.ben.token)).toEqual({ ok: true, kind: 'bomoh' })
  })

  it('a purple card printed before Bomoh had its own QR (KEJAR:DATO:<purple code>) still claims Bomoh, and is no Dato miss (C1)', async () => {
    const g = await chasing()
    expect(await scanQr(g, g.aina.token, datoQr(await cardCode(g)))).toEqual({ ok: false, reason: 'cannot-claim' })
    expect(await scanQr(g, g.ben.token, datoQr(await cardCode(g)))).toEqual({ ok: true, kind: 'bomoh' })
    expect((await stash(g))!.claimedBy).toBe(g.ben.playerId)
    expect((await store.events(g.gameId)).filter((e) => e.type === 'stash-miss')).toHaveLength(0)
  })

  /** A chasing Full game with both legendaries on and both cards dropped at STASH. */
  async function bothChasing() {
    const g = await readyGame({ mode: 'full', legendaries: { dato: 'stash', bomoh: 'stash' } })
    const chong = await run('join', { code: g.code, name: 'Chong', accepted: true })
    await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [g.hafiz.playerId]: 'chaser', [chong.playerId]: 'runner' } })
    await run('linkTag', { code: g.code, token: chong.token, tagId: 5 })
    await legacyCard(g.code, 'bomoh', STASH)
    await legacyCard(g.code, 'dato', STASH)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    const game = (await store.gameByCode(g.code))!
    return { ...g, game }
  }

  describe('each legendary has its own wrong-scan count (I5)', () => {
    const misses = async (gameId: string) => (await store.events(gameId)).filter((e) => e.type === 'stash-miss')

    it("3 wrong ★ scans don't lock a chaser out of Bomoh, and each miss is tagged with its legendary", async () => {
      const { game, ...g } = await bothChasing()
      for (let i = 0; i < STASH_MISS_LIMIT; i++) expect(await scanQr(g, g.ben.token, datoQr('x'.repeat(22)))).toEqual({ ok: false, reason: 'no-stash' })
      expect(await misses(game.id)).toEqual([0, 1, 2].map(() => expect.objectContaining({ actor_id: g.ben.playerId, data: { legendary: 'dato' } })))
      expect(await scanQr(g, g.ben.token, bomohQr(game.bomoh_stash!.code!))).toEqual({ ok: true, kind: 'bomoh' })
    })

    it("3 wrong purple scans don't lock a runner out of Dato Seri", async () => {
      const { game, ...g } = await bothChasing()
      for (let i = 0; i < STASH_MISS_LIMIT; i++) expect(await scanQr(g, g.aina.token, 'KEJAR:BOMOH')).toEqual({ ok: false, reason: 'no-stash' })
      expect(await misses(game.id)).toEqual([0, 1, 2].map(() => expect.objectContaining({ actor_id: g.aina.playerId, data: { legendary: 'bomoh' } })))
      expect(await scanQr(g, g.aina.token, datoQr(game.dato_stash!.code!))).toEqual({ ok: true, kind: 'dato' })
    })

    it('3 wrong purple scans still lock that chaser out of Bomoh', async () => {
      const { game, ...g } = await bothChasing()
      for (let i = 0; i < STASH_MISS_LIMIT; i++) await scanQr(g, g.ben.token, 'KEJAR:BOMOH')
      expect(await scanQr(g, g.ben.token, bomohQr(game.bomoh_stash!.code!))).toEqual({ ok: false, reason: 'no-stash' })
    })

    it('untagged misses from before Bomoh count as Dato Seri misses only', async () => {
      const { game, ...g } = await bothChasing()
      for (const p of [g.aina, g.ben])
        for (let i = 0; i < STASH_MISS_LIMIT; i++) await store.addEvent({ game_id: game.id, type: 'stash-miss', actor_id: p.playerId, target_id: null, data: {} })
      expect(await scanQr(g, g.aina.token, datoQr(game.dato_stash!.code!))).toEqual({ ok: false, reason: 'no-stash' })
      expect(await scanQr(g, g.ben.token, bomohQr(game.bomoh_stash!.code!))).toEqual({ ok: true, kind: 'bomoh' })
    })
  })

  it('with Dato Seri on too, a legacy DATO-prefixed purple card claims Bomoh and the yellow card still claims Dato', async () => {
    const { game, ...g } = await bothChasing()
    expect(game.dato_stash!.code).not.toBe(game.bomoh_stash!.code)
    expect(await scanQr(g, g.ben.token, datoQr(game.bomoh_stash!.code!))).toEqual({ ok: true, kind: 'bomoh' })
    expect(await scanQr(g, g.aina.token, datoQr(game.dato_stash!.code!))).toEqual({ ok: true, kind: 'dato' })
    expect((await store.events(game.id)).filter((e) => e.type === 'stash-miss')).toHaveLength(0)
  })

  it('with no stash dropped, scanning claims nothing', async () => {
    const g = await chasing(false)
    expect(await scanQr(g, g.ben.token, 'KEJAR:BOMOH')).toEqual({ ok: false, reason: 'no-stash' })
  })

  it('end to end: a hidden card, claim, then a team-wide exact reveal for exactly 2 ping reveals', async () => {
    // 1. A game started on a purple card, hidden before the Tupperware; a chaser sees no runner exactly.
    const g = await lobby()
    await legacyCard(g.code, 'bomoh', STASH)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    const runners = [g.aina, g.chong]
    const report = async (min: number) => {
      now = T0 + min * MIN
      await run('location', { code: g.code, token: g.aina.token, ...at(20) })
      await run('location', { code: g.code, token: g.chong.token, ...at(40) })
    }
    const chaserView = (token: string) => run<View>('state', { code: g.code, token })
    const runnerDots = (v: View) => v.dots.filter((d) => d.kind === 'runner')
    await report(6)
    now = T0 + 7 * MIN
    let v = await chaserView(g.hafiz.token)
    expect(v).not.toHaveProperty('bomohZone')
    expect(runnerDots(v)).toEqual([])
    // 3. Ben scans the card in reach: instant claim, card retired, one anonymised feed entry.
    const card = (await stash(g))!.card!
    expect(await scan(g, g.ben.token)).toEqual({ ok: true, kind: 'bomoh' })
    const org = (await store.organiserBySessionTokenHash(hashToken(g.organiserToken)))!.organisation_id
    expect((await store.secretCards(org)).find((c) => c.id === card.id)).toMatchObject({ state: 'retired' })
    expect((await store.events(g.gameId)).filter((e) => e.type === 'legendary')).toHaveLength(1)
    v = await chaserView(g.hafiz.token)
    expect(v.feed.filter((f) => f.text === 'Something legendary was found.')).toHaveLength(1)
    expect(runnerDots(v)).toEqual([]) // nothing is revealed until the next ping reveal
    // 4. First reveal since the claim (10 min): every chaser, claimant or not, sees every runner exactly.
    await report(9.5)
    now = T0 + 10 * MIN
    for (const token of [g.ben.token, g.hafiz.token]) {
      v = await chaserView(token)
      expect(runnerDots(v)).toHaveLength(runners.length)
      for (const d of runnerDots(v)) expect(d).toMatchObject({ exact: true, revealedBy: 'bomoh' })
    }
    // 5. Second reveal (15 min): still active.
    await report(14.5)
    now = T0 + 15 * MIN
    v = await chaserView(g.hafiz.token)
    expect(runnerDots(v)).toHaveLength(runners.length)
    for (const d of runnerDots(v)) expect(d).toMatchObject({ exact: true, revealedBy: 'bomoh' })
    // 6. Third reveal (20 min): back to fuzzy, with no Bomoh marking.
    await report(19.5)
    now = T0 + 20 * MIN
    v = await chaserView(g.hafiz.token)
    expect(runnerDots(v)).toHaveLength(runners.length)
    for (const d of runnerDots(v)) {
      expect(d.fuzzy).toBe(true)
      expect(d.exact).toBeUndefined()
      expect(d.revealedBy).toBeNull()
    }
  })
})

describe('Settle: Dato Seri frees its holder and up to 2 others at Penjara (jail design §4, §4b, §4d)', () => {
  /**
   * A Full game in the chase: Ben chases; Aina #07 holds Dato Seri; Aina, Hafiz #03, Wei #14 and Mei #21 are
   * in Penjara; Raj #05 is still free.
   */
  async function inPenjara() {
    const g = await readyGame({ mode: 'full' })
    const join = async (name: string, tagId: number) => {
      const r = await run('join', { code: g.code, name, accepted: true })
      await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [r.playerId]: 'runner' } })
      await run('linkTag', { code: g.code, token: r.token, tagId })
      return r
    }
    const wei = await join('Wei', 14)
    const mei = await join('Mei', 21)
    const raj = await join('Raj', 5)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    const dato = await store.addPowerUp({ game_id: gameId, player_id: g.aina.playerId, kind: 'dato', station: null })
    const jailed = { jailed: true, caught_at: new Date(now).toISOString(), caught_by: g.ben.playerId }
    await store.updatePlayers([g.aina, g.hafiz, wei, mei].map((p) => ({ id: p.playerId, patch: jailed })))
    return { ...g, wei, mei, raj, gameId, dato }
  }
  const settle = (g: { code: string; aina: { token: string } }, targetIds: string[], extra: object = {}) =>
    run('settle', { code: g.code, token: g.aina.token, qr: JAIL_QR, targetIds, ...at(10), ...extra })
  const player = async (g: { gameId: string }, id: string) => (await store.players(g.gameId)).find((p) => p.id === id)!
  const datoRow = async (g: { gameId: string; dato: { id: string } }) => (await store.powerUps(g.gameId)).find((u) => u.id === g.dato.id)!

  it('frees the holder and two chosen friends, spends the card, and tells everyone the real count', async () => {
    const g = await inPenjara()
    const r = await settle(g, [g.hafiz.playerId, g.wei.playerId])
    expect(r).toEqual({ ok: true, freedIds: [g.aina.playerId, g.hafiz.playerId, g.wei.playerId] })
    for (const id of r.freedIds) {
      expect(await player(g, id)).toMatchObject({ jailed: false, freed_once: true, freed_at: new Date(now).toISOString() })
    }
    expect(await player(g, g.mei.playerId)).toMatchObject({ jailed: true, freed_once: false })
    expect((await datoRow(g)).used_at).toBe(new Date(now).toISOString())
    for (const who of [{ token: g.ben.token }, { token: g.raj.token }, { token: g.mei.token }, { organiserToken: g.organiserToken }]) {
      const v = await run<View>('state', { code: g.code, ...who })
      expect(v.feed[0].text).toBe('Something legendary freed 3 Dikejar!')
      expect(v.feed.map((f) => `${f.text} ${f.means ?? ''} ${f.label ?? ''}`).join(' ')).not.toMatch(/Dato/)
    }
  })

  it('a holder who already used their one escape frees only their friends', async () => {
    const g = await inPenjara()
    await store.updatePlayers([{ id: g.aina.playerId, patch: { freed_once: true } }])
    expect(await settle(g, [g.hafiz.playerId])).toEqual({ ok: true, freedIds: [g.hafiz.playerId] })
    expect(await player(g, g.aina.playerId)).toMatchObject({ jailed: true })
    expect((await run<View>('state', { code: g.code, token: g.ben.token })).feed[0].text).toBe('Something legendary freed 1 Dikejar!')
  })

  it('with nobody picked, frees the holder alone', async () => {
    const g = await inPenjara()
    expect(await settle(g, [])).toEqual({ ok: true, freedIds: [g.aina.playerId] })
    expect(await run('settle', { code: g.code, token: g.hafiz.token, qr: JAIL_QR, ...at(10) })).toEqual({ ok: false, reason: 'no-dato' })
  })

  it('refuses, keeping the card, when nobody would be freed', async () => {
    const g = await inPenjara()
    await store.updatePlayers([{ id: g.aina.playerId, patch: { freed_once: true } }])
    expect(await settle(g, [])).toEqual({ ok: false, reason: 'nobody-to-free' })
    expect((await datoRow(g)).used_at).toBeNull()
  })

  it('refuses the whole Settle for a target who already used their escape, rather than dropping them', async () => {
    const g = await inPenjara()
    await store.updatePlayers([{ id: g.mei.playerId, patch: { freed_once: true } }])
    expect(await settle(g, [g.hafiz.playerId, g.mei.playerId])).toEqual({ ok: false, reason: 'target-already-freed', targetId: g.mei.playerId })
    expect(await player(g, g.hafiz.playerId)).toMatchObject({ jailed: true, freed_once: false })
    expect(await player(g, g.aina.playerId)).toMatchObject({ jailed: true, freed_once: false })
    expect((await datoRow(g)).used_at).toBeNull()
  })

  it('refuses unknown, free, chaser, duplicate or self targets, and more than two', async () => {
    const g = await inPenjara()
    for (const bad of ['nobody', g.raj.playerId, g.ben.playerId, g.aina.playerId]) {
      expect(await settle(g, [bad])).toEqual({ ok: false, reason: 'unknown-target', targetId: bad })
    }
    expect(await settle(g, [g.hafiz.playerId, g.hafiz.playerId])).toEqual({ ok: false, reason: 'unknown-target', targetId: g.hafiz.playerId })
    expect(await settle(g, [g.hafiz.playerId, g.wei.playerId, g.mei.playerId])).toEqual({ ok: false, reason: 'too-many-targets' })
    await rejects(run('settle', { code: g.code, token: g.aina.token, qr: JAIL_QR, targetIds: 'x', ...at(10) }), 400)
    expect((await datoRow(g)).used_at).toBeNull()
    expect((await store.players(g.gameId)).filter((p) => p.jailed)).toHaveLength(4)
  })

  it('needs the Penjara scan and a fresh position at Penjara, like a jailbreak', async () => {
    const g = await inPenjara()
    await rejects(settle(g, [], { qr: tagQr(7) }), 400, 'Penjara')
    expect(await settle(g, [], at(80))).toEqual({ ok: false, reason: 'too-far-from-jail' })
    now += 31_000
    expect(await run('settle', { code: g.code, token: g.aina.token, qr: JAIL_QR, targetIds: [] })).toEqual({ ok: false, reason: 'too-far-from-jail' })
    expect((await datoRow(g)).used_at).toBeNull()
  })

  it('is for a jailed holder, during the chase, while not paused', async () => {
    const g = await inPenjara()
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: false } }])
    expect(await settle(g, [g.hafiz.playerId])).toEqual({ ok: false, reason: 'not-jailed' })
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: true } }])
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    expect(await settle(g, [])).toEqual({ ok: false, reason: 'paused' })
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 60 * MIN
    expect(await settle(g, [])).toEqual({ ok: false, reason: 'not-chasing' })
  })

  it('a double tap settles once', async () => {
    const g = await inPenjara()
    const rs = await Promise.all([settle(g, [g.hafiz.playerId]), settle(g, [g.hafiz.playerId])])
    expect(rs.filter((r) => r.ok)).toHaveLength(1)
    expect((await store.events(g.gameId)).filter((e) => e.type === 'settled')).toHaveLength(1)
  })

  it('gives the card back if freeing fails', async () => {
    const g = await inPenjara()
    const real = store.updatePlayers.bind(store)
    store.updatePlayers = async () => {
      throw new Error('database down')
    }
    await expect(settle(g, [g.hafiz.playerId])).rejects.toThrow('database down')
    store.updatePlayers = real
    expect((await datoRow(g)).used_at).toBeNull()
  })

  it("the jailed holder's view lists who Settle could free; nobody else gets the picker", async () => {
    const g = await inPenjara()
    await store.updatePlayers([{ id: g.mei.playerId, patch: { freed_once: true } }])
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v.settle).toEqual({
      canFreeSelf: true,
      options: [
        { id: g.hafiz.playerId, name: 'Hafiz', eligible: true },
        { id: g.wei.playerId, name: 'Wei', eligible: true },
        { id: g.mei.playerId, name: 'Mei', eligible: false },
      ],
    })
    for (const token of [g.hafiz.token, g.raj.token, g.ben.token]) {
      expect((await run<View>('state', { code: g.code, token })).settle).toBeNull()
    }
    await settle(g, [g.hafiz.playerId])
    // Free again, and the card is spent: no picker, and the slot is empty.
    const after = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(after.settle).toBeNull()
    expect(after.hand).toEqual([])
    expect(after.activePowerUp).toBeNull()
  })

  it('Ah Long can never take a held Dato Seri', async () => {
    const g = await inPenjara()
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: false } }])
    const along = await store.addPowerUp({ game_id: g.gameId, player_id: g.ben.playerId, kind: 'along', station: 1 })
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: along.id })).toEqual({ ok: false, reason: 'nothing-to-steal' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === along.id)!.used_at).toBeNull()
    expect((await datoRow(g)).taken_at).toBeNull()
  })
})

describe('setup settings and the packing list', () => {
  const create = async (settings: object = {}) => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, settings, organiserToken, stations: [CENTER] })
    return { code, organiserToken }
  }

  it('settingsFrom gives playersBand 20 and Dato Seri on a hidden stash, Bomoh off', async () => {
    const { code } = await create()
    expect((await store.gameByCode(code))!.settings).toMatchObject({ playersBand: 20, legendaries: { dato: 'stash', bomoh: 'off' } })
  })

  it('accepts the 30 and 40 bands and Dato Seri off', async () => {
    const { code } = await create({ playersBand: 40, legendaries: { dato: 'off' } })
    expect((await store.gameByCode(code))!.settings).toMatchObject({ playersBand: 40, legendaries: { dato: 'off', bomoh: 'off' } })
  })

  it('rejects a band or legendary value that is not allowed (400)', async () => {
    const organiserToken = await createOrganiser()
    const bad = (settings: object) => run('create', { arenaId: 'around-me', center: CENTER, settings, organiserToken })
    await rejects(bad({ playersBand: 25 }), 400, 'Expected players')
    await rejects(bad({ legendaries: { dato: 'yes' } }), 400, 'Legendary')
    await rejects(bad({ legendaries: 'all' }), 400, 'Legendary')
  })

  it('lets Bomoh be turned on alongside Dato Seri, now that its cards exist', async () => {
    const { code } = await create({ legendaries: { dato: 'stash', bomoh: 'stash' } })
    expect((await store.gameByCode(code))!.settings.legendaries).toEqual({ dato: 'stash', bomoh: 'stash', ring: 'off', hijau: 'off' })
  })

  it('stores only the two legendaries, dropping any extra keys a client sends (M6)', async () => {
    const { code } = await create({ legendaries: { dato: 'stash', bomoh: 'off', toyol: 'stash' } })
    expect((await store.gameByCode(code))!.settings.legendaries).toEqual({ dato: 'stash', bomoh: 'off', ring: 'off', hijau: 'off' })
  })

  it('setKit ticks and unticks, storing the label it was ticked under', async () => {
    const { code, organiserToken } = await create()
    await run('setKit', { code, organiserToken, tick: { id: 'tape', on: true } })
    expect((await store.gameByCode(code))!.kit!.ticks).toEqual({ tape: 'Tape, zip bags, power bank' })
    await run('setKit', { code, organiserToken, tick: { id: 'tape', on: false } })
    expect((await store.gameByCode(code))!.kit!.ticks).toEqual({})
  })

  it('ticks one after the other both stay, and placed flags are saved', async () => {
    const { code, organiserToken } = await create()
    await run('setKit', { code, organiserToken, tick: { id: 'tape', on: true } })
    await run('setKit', { code, organiserToken, tick: { id: 'penjara', on: true } })
    await run('setKit', { code, organiserToken, placed: { id: 'station-1', on: true } })
    const kit = (await store.gameByCode(code))!.kit!
    expect(Object.keys(kit.ticks).sort()).toEqual(['penjara', 'tape'])
    expect(kit.placed).toEqual({ 'station-1': true })
  })

  it('a tick goes stale when the band changes the label', async () => {
    const { code, organiserToken } = await create()
    await run('setKit', { code, organiserToken, tick: { id: 'vests-kejar', on: true } })
    expect((await run<View>('state', { code, organiserToken })).kit!.items.find((i) => i.id === 'vests-kejar')!.ticked).toBe(true)
    const g = (await store.gameByCode(code))!
    await store.updateGame(g.id, { settings: { ...g.settings, playersBand: 30 } })
    const item = (await run<View>('state', { code, organiserToken })).kit!.items.find((i) => i.id === 'vests-kejar')!
    expect(item.label).toBe('6 lime vests')
    expect(item.ticked).toBe(false)
  })

  it('refuses an unknown item (400)', async () => {
    const { code, organiserToken } = await create()
    await rejects(run('setKit', { code, organiserToken, tick: { id: 'nope', on: true } }), 400)
    await rejects(run('setKit', { code, organiserToken, placed: { id: 'station-99', on: true } }), 400)
  })

  it('a marshal can tick the shared items but never the secret ones (403)', async () => {
    const { code, organiserToken } = await create({ mode: 'full' })
    const { inviteToken } = await run('createMarshalInvite', { code, organiserToken })
    const m = await run('redeemMarshalInvite', { code, inviteToken, name: 'Siti' })
    await run('setKit', { code, token: m.token, tick: { id: 'tape', on: true } })
    await rejects(run('setKit', { code, token: m.token, tick: { id: 'tupperware', on: true } }), 403)
    await rejects(run('setKit', { code, token: m.token, placed: { id: 'tupper-dikejar', on: true } }), 403)
  })

  it('a player cannot touch the kit (403)', async () => {
    const { code } = await create()
    const p = await run('join', { code, name: 'Aina', accepted: true })
    await rejects(run('setKit', { code, token: p.token, tick: { id: 'tape', on: true } }), 403)
  })

  it('setKit answers 409 after the game starts', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('setKit', { code: g.code, organiserToken: g.organiserToken, tick: { id: 'tape', on: true } }), 409)
  })

  it('setMode switches the mode in the lobby', async () => {
    const { code, organiserToken } = await create()
    await run('setMode', { code, organiserToken, mode: 'full' })
    expect((await store.gameByCode(code))!.settings.mode).toBe('full')
    await run('setMode', { code, organiserToken, mode: 'core' })
    expect((await store.gameByCode(code))!.settings).toMatchObject({ mode: 'core', chaserSnapshot: false })
  })

  it('setMode refuses an unknown mode (400), a player (403) and a started game (409)', async () => {
    const g = await readyGame()
    await rejects(run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'party' }), 400)
    await rejects(run('setMode', { code: g.code, token: g.ben.token, mode: 'full' }), 403)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'full' }), 409)
    expect((await store.gameByCode(g.code))!.settings.mode).toBe('core')
  })
})

describe('Undo kejar and the final whistle (fair-play §1.4)', () => {
  const S = 1000
  type G = Awaited<ReturnType<typeof safetyGame>>
  /** Ben scans a runner's tag at `ms`, standing 10 m from where the runner just reported. */
  async function catchAt(g: G, who: 'aina' | 'hafiz', ms: number) {
    now = ms
    await run('location', { code: g.code, token: g[who].token, ...at(10) })
    return run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(who === 'aina' ? 7 : 3), ...at(0) })
  }
  const catchId = async (g: G, runnerId: string) =>
    (await store.events(g.gameId)).filter((e) => e.type === 'caught' && e.target_id === runnerId).at(-1)!.id
  const runnerRow = async (g: G, id: string) => (await store.players(g.gameId)).find((p) => p.id === id)!
  const gameRow = async (g: G) => (await store.gameByCode(g.code))!
  const poll = (g: G, ms: number) => {
    now = ms
    return run<View>('state', { code: g.code, organiserToken: g.organiserToken })
  }
  const undo = (g: G, eventId: string) => run('undoKejar', { code: g.code, eventId, token: g.siti.token })
  const countOf = async (g: G, type: string) => (await store.events(g.gameId)).filter((e) => e.type === type).length

  it('(a) an undo frees the runner without using their escape, and they can be caught again', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    now = T0 + 7.5 * MIN
    expect(await undo(g, await catchId(g, g.aina.playerId))).toEqual({ ok: true })
    const aina = await runnerRow(g, g.aina.playerId)
    expect(aina).toMatchObject({ jailed: false, caught_by: null, freed_once: false, freed_at: new Date(now).toISOString() })
    expect(await catchAt(g, 'aina', T0 + 8 * MIN)).toMatchObject({ ok: true })
    expect((await runnerRow(g, g.aina.playerId)).jailed).toBe(true)
  })

  it('(b) only the latest catch can be undone, and only once', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    const first = await catchId(g, g.aina.playerId)
    now = T0 + 7.5 * MIN
    await undo(g, first)
    expect(await undo(g, first)).toEqual({ ok: false, reason: 'not-undoable' })
    await catchAt(g, 'aina', T0 + 8 * MIN)
    expect(await undo(g, first)).toEqual({ ok: false, reason: 'not-undoable' })
    expect((await runnerRow(g, g.aina.playerId)).jailed).toBe(true)
  })

  it('(c) catching the last free runner posts the final whistle; the Kejar win is final only after 60 s', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    await catchAt(g, 'hafiz', T0 + 8 * MIN)
    expect(await countOf(g, 'final-whistle')).toBe(1)
    expect((await store.events(g.gameId)).find((e) => e.type === 'final-whistle')!.data).toEqual({ cause: 'catch' })
    const held = await poll(g, T0 + 8 * MIN + 59 * S)
    expect(held.phase).toBe('chasing')
    expect(held.feed.map((f) => f.text)).toContain('Last Dikejar caught! Final whistle in 60 s.')
    expect((await gameRow(g)).ended_at).toBeNull()
    const over = await poll(g, T0 + 8 * MIN + 61 * S)
    expect(over.phase).toBe('ended')
    expect(over.results?.winner).toBe('chasers')
    await poll(g, T0 + 8 * MIN + 62 * S)
    expect(await countOf(g, 'ended')).toBe(1)
    expect(await countOf(g, 'final-whistle')).toBe(1)
  })

  it('(d) an undo during the hold keeps the game going, and the next last catch starts a fresh whistle', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    await catchAt(g, 'hafiz', T0 + 8 * MIN)
    now = T0 + 8 * MIN + 30 * S
    expect(await undo(g, await catchId(g, g.hafiz.playerId))).toEqual({ ok: true })
    expect((await gameRow(g)).final_whistle_at).toBeNull()
    const v = await poll(g, T0 + 8 * MIN + 61 * S)
    expect(v.phase).toBe('chasing')
    expect((await gameRow(g)).ended_at).toBeNull()
    expect(v.feed[0].text).toBe('A marshal undid a kejar. Hafiz is back in.')
    await catchAt(g, 'hafiz', T0 + 9.5 * MIN)
    expect(await countOf(g, 'final-whistle')).toBe(2)
    expect((await poll(g, T0 + 9.5 * MIN + 61 * S)).phase).toBe('ended')
  })

  it('(e) time runs out during the hold: no results until the undo, then a Dikejar win on the next poll', async () => {
    // A 15-minute chase: hiding to +5, the chase to +20, scheduled pings at +10 and +15. No endgame, so Bomba's pings
    // don't join them.
    const g = await safetyGame({ lengthMin: 15, checkinMode: 'schedule', endgames: { bomba: 'off', hebat: 'off', pkp: 'off' } })
    await catchAt(g, 'aina', T0 + 7 * MIN)
    for (const m of [10, 15]) {
      now = T0 + m * MIN - 20 * S
      await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
    }
    await catchAt(g, 'hafiz', T0 + 20 * MIN - 20 * S)
    expect(await countOf(g, 'final-whistle')).toBe(1)
    const pastClock = await poll(g, T0 + 20 * MIN + 10 * S)
    expect(pastClock.phase).toBe('chasing')
    expect(pastClock.results).toBeNull()
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).phase).toBe('chasing')
    now = T0 + 20 * MIN + 20 * S
    expect(await run('undoKejar', { code: g.code, organiserToken: g.organiserToken, eventId: await catchId(g, g.hafiz.playerId) })).toEqual({ ok: true })
    const over = await poll(g, T0 + 20 * MIN + 21 * S)
    expect(over.phase).toBe('ended')
    expect(over.results?.winner).toBe('runners')
    expect(over.results?.survivors).toEqual([g.hafiz.playerId])
    expect(store.safetyRows.at(-1)).toMatchObject({ type: 'kejar-undone', player_id: null, data: { by: 'Organiser' } })
  })

  it('(f) auto-jailing the last free runner gets the hold too, and undoing that auto-jail keeps the game going', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    await catchAt(g, 'aina', T0 + 7 * MIN)
    // Hafiz misses pings 1 and 2: auto-jailed at +15.
    await poll(g, T0 + 10 * MIN)
    const v = await poll(g, T0 + 15 * MIN)
    expect(v.phase).toBe('chasing')
    expect((await runnerRow(g, g.hafiz.playerId)).jailed).toBe(true)
    expect(await countOf(g, 'final-whistle')).toBe(1)
    const autoJail = v.alerts.find((a) => a.kind === 'auto-jail')!
    now = T0 + 15 * MIN + 30 * S
    expect(await run('undoAutoJail', { code: g.code, token: g.siti.token, eventId: autoJail.id })).toEqual({ ok: true })
    expect((await poll(g, T0 + 15 * MIN + 61 * S)).phase).toBe('chasing')
    const row = await gameRow(g)
    expect(row.ended_at).toBeNull()
    expect(row.final_whistle_at).toBeNull()
  })

  it('a pause freezes the 60 s hold: an undo after the resume still works', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    await catchAt(g, 'hafiz', T0 + 8 * MIN)
    now = T0 + 8 * MIN + 10 * S
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 10 * MIN + 10 * S
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    // 30 s of unpaused hold have passed (10 s + 20 s), though 2 min 30 s of wall time have.
    now = T0 + 10 * MIN + 30 * S
    expect(await undo(g, await catchId(g, g.hafiz.playerId))).toEqual({ ok: true })
    const v = await poll(g, T0 + 11 * MIN)
    expect(v.phase).toBe('chasing')
    expect((await gameRow(g)).ended_at).toBeNull()
  })

  it('a pause during the hold: without an undo the game ends 60 s of unpaused time after the whistle', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    await catchAt(g, 'hafiz', T0 + 8 * MIN)
    now = T0 + 8 * MIN + 10 * S
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 10 * MIN + 10 * S
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    expect((await poll(g, T0 + 10 * MIN + 59 * S)).phase).toBe('chasing')
    expect((await poll(g, T0 + 10 * MIN + 61 * S)).phase).toBe('ended')
  })

  it('an Undo kejar after the 60 s hold, with no poll in between, is refused and the Kejar win stands', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    await catchAt(g, 'hafiz', T0 + 8 * MIN)
    now = T0 + 8 * MIN + 61 * S
    expect(await undo(g, await catchId(g, g.hafiz.playerId))).toEqual({ ok: false, reason: 'not-undoable' })
    expect((await runnerRow(g, g.hafiz.playerId)).jailed).toBe(true)
    expect((await gameRow(g)).winner).toBe('chasers')
    expect(store.safetyRows.filter((r) => r.type === 'kejar-undone')).toHaveLength(0)
  })

  it('undoing a last-runner auto-jail after the 60 s hold, with no poll in between, is refused and the Kejar win stands', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    await catchAt(g, 'aina', T0 + 7 * MIN)
    await poll(g, T0 + 10 * MIN)
    const v = await poll(g, T0 + 15 * MIN)
    const autoJail = v.alerts.find((a) => a.kind === 'auto-jail')!
    now = T0 + 15 * MIN + 61 * S
    expect(await run('undoAutoJail', { code: g.code, token: g.siti.token, eventId: autoJail.id })).toEqual({ ok: false, reason: 'not-undoable' })
    expect((await runnerRow(g, g.hafiz.playerId)).jailed).toBe(true)
    expect((await gameRow(g)).winner).toBe('chasers')
    expect(store.safetyRows.filter((r) => r.type === 'auto-jail-undone')).toHaveLength(0)
  })

  it('(g) is for marshals and the organiser only', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    const id = await catchId(g, g.aina.playerId)
    await rejects(run('undoKejar', { code: g.code, token: g.hafiz.token, eventId: id }), 403, 'Marshals only')
    await rejects(run('undoKejar', { code: g.code, token: g.ben.token, eventId: id }), 403, 'Marshals only')
    expect((await runnerRow(g, g.aina.playerId)).jailed).toBe(true)
  })

  it('(h) writes a safety record and closes the catch alert', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    const id = await catchId(g, g.aina.playerId)
    now = T0 + 7.5 * MIN
    await undo(g, id)
    expect(store.safetyRows.at(-1)).toMatchObject({
      type: 'kejar-undone',
      target_id: g.aina.playerId,
      player_id: g.siti.playerId,
      data: { game_code: g.code, by: 'Siti', target_name: 'Aina' },
    })
    const events = await store.events(g.gameId)
    expect(events.find((e) => e.type === 'kejar-undone')).toMatchObject({ target_id: g.aina.playerId, data: { eventId: id } })
    expect(events.find((e) => e.type === 'handled' && e.data.eventId === id)).toBeTruthy()
  })

  it('refuses a catch the runner was since freed from, and an unknown event', async () => {
    const g = await safetyGame()
    await catchAt(g, 'aina', T0 + 7 * MIN)
    const id = await catchId(g, g.aina.playerId)
    now = T0 + 7.5 * MIN
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
    expect(await breakOut(g.code, g.hafiz.token)).toMatchObject({ ok: true })
    expect(await undo(g, id)).toEqual({ ok: false, reason: 'not-undoable' })
    expect(await undo(g, 'no-such-event')).toEqual({ ok: false, reason: 'not-undoable' })
  })
})

describe('New phone (fair-play §1.7)', () => {
  type G = Awaited<ReturnType<typeof safetyGame>>
  const link = (g: G, playerId: string, who: { token: string } | { organiserToken: string } = { token: g.siti.token }) =>
    run<{ inviteToken: string }>('createPhoneMove', { code: g.code, playerId, ...who })
  const row = async (g: G, id: string) => (await store.players(g.gameId)).find((p) => p.id === id)!
  /** Aina caught by Ben mid-chase, so she is jailed. */
  async function jailedAina() {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7), ...at(0) })
    return g
  }

  it('moves a jailed runner mid-chase onto a new token: same player, old token dead, push cleared', async () => {
    const g = await jailedAina()
    await store.updatePlayers([{ id: g.aina.playerId, patch: { freed_once: true } }])
    const before = await run<View>('state', { code: g.code, token: g.aina.token })
    const { inviteToken } = await link(g, g.aina.playerId)
    const moved = await run<{ token: string; playerId: string }>('redeemPhoneMove', { code: g.code, inviteToken })
    expect(moved.playerId).toBe(g.aina.playerId)
    expect(moved.token).not.toBe(g.aina.token)
    const after = await run<View>('state', { code: g.code, token: moved.token })
    expect(after.me.id).toBe(g.aina.playerId)
    expect(after.me.jailed).toBe(true)
    expect(after.hand).toEqual(before.hand)
    expect(await row(g, g.aina.playerId)).toMatchObject({ freed_once: true, jailed: true, push: null })
    await rejects(run('state', { code: g.code, token: g.aina.token }), 401)
  })

  it('works for a chaser, and for the organiser as the maker', async () => {
    const g = await safetyGame()
    const { inviteToken } = await link(g, g.ben.playerId, { organiserToken: g.organiserToken })
    const moved = await run<{ token: string; playerId: string }>('redeemPhoneMove', { code: g.code, inviteToken })
    expect(moved.playerId).toBe(g.ben.playerId)
    await rejects(run('state', { code: g.code, token: g.ben.token }), 401)
  })

  it('a link works once: a second redeem is 410 used', async () => {
    const g = await safetyGame()
    const { inviteToken } = await link(g, g.aina.playerId)
    await run('redeemPhoneMove', { code: g.code, inviteToken })
    await rejects(run('redeemPhoneMove', { code: g.code, inviteToken }), 410, 'already been used')
  })

  it('a link expires after PHONE_MOVE_TTL_MS: 410 expired, and the old token still works', async () => {
    const g = await safetyGame()
    const { inviteToken } = await link(g, g.aina.playerId)
    now += PHONE_MOVE_TTL_MS
    await rejects(run('redeemPhoneMove', { code: g.code, inviteToken }), 410, 'expired')
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).me.id).toBe(g.aina.playerId)
  })

  it('an unknown or missing link is refused', async () => {
    const g = await safetyGame()
    await rejects(run('redeemPhoneMove', { code: g.code, inviteToken: 'nope' }), 404, 'not valid')
    await rejects(run('redeemPhoneMove', { code: g.code, inviteToken: '' }), 400)
  })

  it('a link made for one game does not work on another', async () => {
    const g = await safetyGame()
    const other = await readyGame()
    const { inviteToken } = await link(g, g.aina.playerId)
    await rejects(run('redeemPhoneMove', { code: other.code, inviteToken }), 404)
  })

  it('a runner cannot make one (403), and a stranger cannot (401)', async () => {
    const g = await safetyGame()
    await rejects(link(g, g.hafiz.playerId, { token: g.aina.token }), 403)
    await rejects(link(g, g.hafiz.playerId, { token: 'bogus' }), 401)
  })

  it("refuses a marshal's row, an unknown player and a removed player", async () => {
    const g = await safetyGame()
    await rejects(link(g, g.siti.playerId), 400)
    await rejects(link(g, 'no-such-player'), 400)
    await run('removePlayer', { code: g.code, token: g.siti.token, playerId: g.hafiz.playerId })
    await rejects(link(g, g.hafiz.playerId), 400)
  })

  it('works before the game starts, and is refused once it has ended', async () => {
    const lobby = await readyGame()
    const made = await run<{ inviteToken: string }>('createPhoneMove', { code: lobby.code, playerId: lobby.aina.playerId, organiserToken: lobby.organiserToken })
    expect(made.inviteToken).toBeTruthy()
    const g = await safetyGame()
    now = T0 + 200 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    await rejects(link(g, g.aina.playerId), 409)
  })

  it('writes a safety record saying who moved whom', async () => {
    const g = await safetyGame()
    await link(g, g.aina.playerId)
    expect(store.safetyRows.at(-1)).toMatchObject({
      type: 'phone-move',
      player_id: g.siti.playerId,
      target_id: g.aina.playerId,
      data: { game_code: g.code, by: 'Siti', target_name: 'Aina' },
    })
  })
})

describe('wiping personal data 30 days after a game', () => {
  const DAY = 24 * 60 * MIN

  async function endedGame() {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
    await run('sos', { code: g.code, token: g.aina.token, ...at(20) })
    await run('report', { code: g.code, token: g.aina.token, targetId: g.ben.playerId, reason: 'unsafe', note: 'shouted at me', ...at(20) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
    now += 61_000
    await run('state', { code: g.code, token: g.ben.token })
    const game = (await store.gameByCode(g.code))!
    expect(game.ended_at).toBeTruthy()
    return { ...g, gameId: game.id }
  }
  const wipedAt = async (code: string) => (await store.gameByCode(code))!.wiped_at

  it('wipes a game that ended 31 days ago on the next create, and leaves one that ended 29 days ago', async () => {
    const old = await endedGame()
    const endedAt = Date.parse((await store.gameByCode(old.code))!.ended_at!)
    now = endedAt + 31 * DAY
    await run('create', { arenaId: 'around-me', center: CENTER, organiserToken: old.organiserToken })
    expect(await wipedAt(old.code)).toBeTruthy()

    now = T0
    const recent = await endedGame()
    now = Date.parse((await store.gameByCode(recent.code))!.ended_at!) + 29 * DAY
    await run('create', { arenaId: 'around-me', center: CENTER, organiserToken: recent.organiserToken })
    expect(await wipedAt(recent.code)).toBeNull()
    now += 2 * DAY
    await run('listArenas', { organiserToken: recent.organiserToken })
    expect(await wipedAt(recent.code)).toBeTruthy()
  })

  it('wipes a lobby or started game that never recorded an end once it is 32 days old, not before', async () => {
    const lobby = await readyGame()
    const started = await readyGame()
    await run('start', { code: started.code, organiserToken: started.organiserToken })
    const young = await readyGame()
    expect((await store.gameByCode(started.code))!.ended_at).toBeNull()
    // The three were made at T0; age them by moving the clock, with a different organiser's create as the trigger.
    now = T0 + 31 * DAY
    await run('create', { arenaId: 'around-me', center: CENTER, organiserToken: lobby.organiserToken })
    expect(await wipedAt(lobby.code)).toBeNull()
    now = T0 + 33 * DAY
    await run('create', { arenaId: 'around-me', center: CENTER, organiserToken: lobby.organiserToken })
    expect(await wipedAt(lobby.code)).toBeTruthy()
    expect(await wipedAt(started.code)).toBeTruthy()
    expect(await wipedAt(young.code)).toBeTruthy() // also 33 days old, only the batch limit of 3 is in play
    const gid = (await store.gameByCode(lobby.code))!.id
    expect((await store.players(gid)).map((p) => p.name).sort()).toEqual(['Dikejar 1', 'Dikejar 2', 'Kejar 1'])
  })

  it('does not wipe a game that has not ended while it is under 32 days old', async () => {
    const g = await readyGame()
    now += 20 * DAY
    await run('create', { arenaId: 'around-me', center: CENTER, organiserToken: g.organiserToken })
    expect(await wipedAt(g.code)).toBeNull()
  })

  it('keeps the winner and award counts, and shows placeholder names', async () => {
    const g = await endedGame()
    const game = (await store.gameByCode(g.code))!
    const before = computeResults(game, await store.players(g.gameId), await store.events(g.gameId))
    now = Date.parse(game.ended_at!) + WIPE_AFTER_MS + MIN
    await run('listArenas', { organiserToken: g.organiserToken })
    const wiped = (await store.gameByCode(g.code))!
    expect(wiped.wiped_at).toBeTruthy()
    const players = await store.players(g.gameId)
    expect(computeResults(wiped, players, await store.events(g.gameId))).toEqual(before)
    expect(players.map((p) => p.name).sort()).toEqual(['Dikejar 1', 'Dikejar 2', 'Kejar 1'])
    expect(JSON.stringify(await store.events(g.gameId))).not.toMatch(/Aina|Hafiz|Ben|shouted/)
  })

  it('a store whose wipe throws does not break create or listArenas', async () => {
    const g = await endedGame()
    now = Date.parse((await store.gameByCode(g.code))!.ended_at!) + 31 * DAY
    store.wipeGame = async () => {
      throw new Error('db down')
    }
    expect(await run('create', { arenaId: 'around-me', center: CENTER, organiserToken: g.organiserToken })).toMatchObject({ code: expect.any(String) })
    expect(await run('listArenas', { organiserToken: g.organiserToken })).toMatchObject({ arenas: [] })
    store.gamesToWipe = async () => {
      throw new Error('db down')
    }
    expect(await run('listArenas', { organiserToken: g.organiserToken })).toMatchObject({ arenas: [] })
  })
})

describe('the Penjara reel', () => {
  /** Ben chases; Aina #07 is in Penjara, Hafiz #03 is free. In the chase at +7 min. */
  async function jailedAina() {
    const g = await readyGame({ mode: 'full' })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: true, caught_at: new Date(now).toISOString(), caught_by: g.ben.playerId } }])
    return { ...g, gameId }
  }
  type G = Awaited<ReturnType<typeof jailedAina>>
  /** The reel's lever pulled with a fixed roll: 0 lands on the free slot, 0.99 on a black one. */
  const pull = (g: G, token: string, roll: number, extra: object = at(10)) =>
    actions.pullReel({ store, now, rng: () => roll, push: async () => {}, fetchJson: async () => ({}) }, { code: g.code, token, ...extra }) as Promise<any>
  const FREE = 0
  const BLACK = 0.99
  const aina = async (g: G) => (await store.players(g.gameId)).find((p) => p.id === g.aina.playerId)!
  const events = async (g: G, type: string) => (await store.events(g.gameId)).filter((e) => e.type === type)

  it('a pull away from Penjara is refused and does not spend the pull', async () => {
    const g = await jailedAina()
    expect(await pull(g, g.aina.token, FREE, at(500))).toEqual({ ok: false, reason: 'too-far-from-jail' })
    expect(await pull(g, g.aina.token, FREE, {})).toEqual({ ok: false, reason: 'too-far-from-jail' })
    expect((await aina(g)).reel_pulled_at).toBeNull()
    expect(await pull(g, g.aina.token, BLACK)).toEqual({ ok: true, result: 'black' })
  })

  it('a free-slot freeing that throws gives the pull back, then a retry can pull', async () => {
    const g = await jailedAina()
    const real = store.updatePlayers.bind(store)
    let fail = true
    store.updatePlayers = async (u: Parameters<typeof real>[0]) => {
      if (fail) {
        fail = false
        throw new Error('db down')
      }
      return real(u)
    }
    await expect(pull(g, g.aina.token, FREE)).rejects.toThrow('db down')
    expect((await aina(g)).reel_pulled_at).toBeNull()
    expect(await pull(g, g.aina.token, FREE)).toEqual({ ok: true, result: 'free' })
    store.updatePlayers = real
  })

  it('a runner who is not jailed cannot pull', async () => {
    const g = await jailedAina()
    expect(await pull(g, g.hafiz.token, FREE)).toEqual({ ok: false, reason: 'not-jailed' })
    expect(await pull(g, g.ben.token, FREE)).toEqual({ ok: false, reason: 'not-jailed' })
  })

  it('allows one pull per stay', async () => {
    const g = await jailedAina()
    expect(await pull(g, g.aina.token, BLACK)).toEqual({ ok: true, result: 'black' })
    expect(await pull(g, g.aina.token, FREE)).toEqual({ ok: false, reason: 'already-pulled' })
    expect((await aina(g)).jailed).toBe(true)
  })

  it('a fresh catch allows a new pull', async () => {
    const g = await jailedAina()
    expect(await pull(g, g.aina.token, BLACK)).toMatchObject({ ok: true })
    now += MIN
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: false, caught_at: null } }])
    await store.catchRunner(g.aina.playerId, g.ben.playerId)
    expect(await pull(g, g.aina.token, BLACK)).toEqual({ ok: true, result: 'black' })
  })

  it('the free slot frees the runner, spends the escape and posts the feed line', async () => {
    const g = await jailedAina()
    expect(await pull(g, g.aina.token, FREE)).toEqual({ ok: true, result: 'free' })
    expect(await aina(g)).toMatchObject({ jailed: false, freed_once: true, freed_at: new Date(now).toISOString(), out_warned_at: null })
    expect(await events(g, 'reel-free')).toMatchObject([{ actor_id: g.aina.playerId, data: { who: 'Aina #07' } }])
    const v = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(v.feed[0].text).toBe('Aina pulled the free slot. Keluar penjara!')
  })

  it('a black slot posts nothing', async () => {
    const g = await jailedAina()
    expect(await pull(g, g.aina.token, BLACK)).toEqual({ ok: true, result: 'black' })
    expect(await events(g, 'reel-free')).toEqual([])
    expect((await aina(g)).jailed).toBe(true)
  })

  it('a runner whose escape is used can pull but never wins (Review Focus 4)', async () => {
    const g = await jailedAina()
    await store.updatePlayers([{ id: g.aina.playerId, patch: { freed_once: true } }])
    expect(await pull(g, g.aina.token, FREE)).toEqual({ ok: true, result: 'black' })
    expect((await aina(g)).jailed).toBe(true)
  })

  it('the jailed runner sees whether they have pulled', async () => {
    const g = await jailedAina()
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).reel).toEqual({ pulled: false, result: null })
    await pull(g, g.aina.token, BLACK)
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).reel).toEqual({ pulled: true, result: 'black' })
    expect((await run<View>('state', { code: g.code, token: g.hafiz.token })).reel).toBeNull()
  })

  it('is refused while the game is paused', async () => {
    const g = await jailedAina()
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    expect(await pull(g, g.aina.token, FREE)).toEqual({ ok: false, reason: 'paused' })
  })

  it('freeing the last free runner calls off a pending final whistle', async () => {
    const g = await jailedAina()
    await store.updatePlayers([{ id: g.hafiz.playerId, patch: { jailed: true, caught_at: new Date(now).toISOString(), caught_by: g.ben.playerId } }])
    await store.claimFinalWhistle(g.gameId, new Date(now).toISOString())
    expect(await pull(g, g.aina.token, FREE)).toEqual({ ok: true, result: 'free' })
    expect((await store.gameByCode(g.code))!.final_whistle_at).toBeNull()
  })
})

describe('5 minutes left (rules §2.7)', () => {
  const chasing = async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    return { ...g, gameId }
  }
  const poll = (g: { code: string; organiserToken: string }) => run<View>('state', { code: g.code, organiserToken: g.organiserToken })
  const fives = async (gameId: string) => (await store.events(gameId)).filter((e) => e.type === 'five-left')
  const warnPushes = () => pushes.filter((p) => (p.payload as { body?: string }).body === '5 minutes left!')

  it('a poll at 4:59 left posts one five-left event and one push per subscribed player', async () => {
    const g = await chasing()
    now = T0 + 20 * MIN
    await poll(g)
    expect(await fives(g.gameId)).toHaveLength(0)
    expect(warnPushes()).toHaveLength(0)
    now = T0 + 45 * MIN + 1_000
    const v = await poll(g)
    expect(await fives(g.gameId)).toHaveLength(1)
    expect(warnPushes()).toHaveLength(3)
    expect(warnPushes()[0].payload).toMatchObject({ type: 'notice', title: 'kejar.', body: '5 minutes left!' })
    expect(v.feed.map((f) => f.text)).toContain('5 minutes left!')
    expect(v.fiveLeft).toBe(true)
  })

  it('a second poll posts nothing more', async () => {
    const g = await chasing()
    now = T0 + 45 * MIN + 1_000
    await poll(g)
    now += 30_000
    await poll(g)
    await poll(g)
    expect(await fives(g.gameId)).toHaveLength(1)
    expect(warnPushes()).toHaveLength(3)
  })

  it('does not warn during a pause, and warns once after the resume', async () => {
    const g = await chasing()
    now = T0 + 44 * MIN
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 60 * MIN
    await poll(g)
    expect(await fives(g.gameId)).toHaveLength(0)
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    now += 2 * MIN
    await poll(g)
    expect(await fives(g.gameId)).toHaveLength(1)
  })

  it('a failing push still records the warning', async () => {
    const g = await chasing()
    pushFails = true
    now = T0 + 46 * MIN
    await poll(g)
    expect(await fives(g.gameId)).toHaveLength(1)
  })
})

describe('how to play: briefing', () => {
  const marshalOf = async (g: Awaited<ReturnType<typeof readyGame>>) => {
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    return run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
  }
  const briefedAt = async (code: string) => (await store.gameByCode(code))!.briefed_at

  it('startBriefing sets briefed_at once and keeps the first time on a second call', async () => {
    const g = await readyGame()
    expect(await briefedAt(g.code)).toBeFalsy()
    expect(await run('startBriefing', { code: g.code, organiserToken: g.organiserToken })).toEqual({ ok: true })
    expect(await briefedAt(g.code)).toBe(new Date(T0).toISOString())
    now += MIN
    expect(await run('startBriefing', { code: g.code, organiserToken: g.organiserToken })).toEqual({ ok: true })
    expect(await briefedAt(g.code)).toBe(new Date(T0).toISOString())
  })

  it('startBriefing is refused for a player, a marshal and a wrong organiser', async () => {
    const g = await readyGame()
    await rejects(run('startBriefing', { code: g.code, token: g.aina.token }), 403)
    const siti = await marshalOf(g)
    await rejects(run('startBriefing', { code: g.code, token: siti.token }), 403)
    const other = await createOrganiser()
    await rejects(run('startBriefing', { code: g.code, organiserToken: other }), 403, 'Organiser only')
    expect(await briefedAt(g.code)).toBeFalsy()
  })

  it('startBriefing is refused after Start (409)', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('startBriefing', { code: g.code, organiserToken: g.organiserToken }), 409)
  })

  it('briefOpened and briefReady set their fields once, in any phase', async () => {
    const g = await readyGame()
    const row = async () => (await store.players((await store.gameByCode(g.code))!.id)).find((p) => p.id === g.aina.playerId)!
    expect(await run('briefOpened', { code: g.code, token: g.aina.token })).toEqual({ ok: true })
    expect((await row()).brief_opened_at).toBe(new Date(T0).toISOString())
    now += MIN
    await run('briefOpened', { code: g.code, token: g.aina.token })
    expect((await row()).brief_opened_at).toBe(new Date(T0).toISOString())
    expect(await run('briefReady', { code: g.code, token: g.aina.token })).toEqual({ ok: true })
    now += MIN
    await run('briefReady', { code: g.code, token: g.aina.token })
    expect((await row()).brief_ready_at).toBe(new Date(T0 + MIN).toISOString())
    // After Start the story can still be reopened, and a chaser can open it too.
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    expect(await run('briefOpened', { code: g.code, token: g.ben.token })).toEqual({ ok: true })
  })

  it('a marshal, the organiser and a stranger cannot call briefOpened or briefReady', async () => {
    const g = await readyGame()
    const siti = await marshalOf(g)
    for (const action of ['briefOpened', 'briefReady'] as const) {
      await rejects(run(action, { code: g.code, token: siti.token }), 403)
      await rejects(run(action, { code: g.code, organiserToken: g.organiserToken }), 401)
      await rejects(run(action, { code: g.code, token: 'nope' }), 401)
    }
  })
})

describe('planned start time (home upgrades)', () => {
  const view = async (code: string, who: object) => (await run<View>('state', { code, ...who })).settings.startsAt ?? null

  it('setStartTime sets and clears the planned start', async () => {
    const g = await readyGame()
    const startsAt = new Date(now + 20 * MIN).toISOString()
    expect(await run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt })).toEqual({ ok: true })
    expect(await view(g.code, { organiserToken: g.organiserToken })).toBe(startsAt)
    expect(await run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt: null })).toEqual({ ok: true })
    expect(await view(g.code, { organiserToken: g.organiserToken })).toBeNull()
  })

  it('setStartTime rejects a past time and one more than 24 hours ahead', async () => {
    const g = await readyGame()
    await rejects(run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt: new Date(now - MIN).toISOString() }), 400, 'next 24 hours')
    await rejects(run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt: new Date(now + 24 * 60 * MIN + MIN).toISOString() }), 400, 'next 24 hours')
    await rejects(run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt: 'banana' }), 400, 'next 24 hours')
  })

  it('setStartTime is organiser-only and lobby-only', async () => {
    const g = await readyGame()
    const startsAt = new Date(now + 20 * MIN).toISOString()
    await rejects(run('setStartTime', { code: g.code, token: g.aina.token, startsAt }), 403)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt }), 409)
  })

  it('create never stores a start time, junk is dropped, and setMode keeps a valid one', async () => {
    const g = await readyGame({ startsAt: 'banana' })
    expect(await view(g.code, { organiserToken: g.organiserToken })).toBeNull()
    const startsAt = new Date(now + 30 * MIN).toISOString()
    await run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt })
    await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'core' })
    expect(await view(g.code, { organiserToken: g.organiserToken })).toBe(startsAt)
  })

  it('a time just after midnight, 20 minutes ahead, is accepted', async () => {
    const g = await readyGame()
    const startsAt = new Date(now + 20 * MIN).toISOString()
    expect(await run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt })).toEqual({ ok: true })
  })

  it('a player sees the planned start in their view', async () => {
    const g = await readyGame()
    const startsAt = new Date(now + 20 * MIN).toISOString()
    await run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt })
    expect(await view(g.code, { token: g.aina.token })).toBe(startsAt)
  })

  it('setting the planned start never re-picks the legendaries', async () => {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } })
    const before = (await store.gameByCode(g.code))!.settings.legendaries
    expect(before).toEqual({ dato: 'off', ring: 'stash', bomoh: 'off', hijau: 'stash' })
    await run('setStartTime', { code: g.code, organiserToken: g.organiserToken, startsAt: new Date(now + 20 * MIN).toISOString() })
    expect((await store.gameByCode(g.code))!.settings.legendaries).toEqual(before)
  })
})

describe('one legendary per side, picked by the app (Plan E2 task 2)', () => {
  const STASH = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const BOTH = { mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } }
  const gameOf = async (code: string) => (await store.gameByCode(code))!
  const make = (organiserToken: string, settings: object) => run('create', { arenaId: 'around-me', center: CENTER, settings, organiserToken })

  it('settings take the organiser\'s legendarySides and store one picked legendary per side, never the sides themselves', async () => {
    const organiserToken = await createOrganiser()
    forcedDraws = [0.1, 0.9]
    const { code } = await make(organiserToken, BOTH)
    const s = (await gameOf(code)).settings
    expect(s.legendaries).toEqual({ dato: 'stash', ring: 'off', bomoh: 'off', hijau: 'stash' })
    expect(s).not.toHaveProperty('legendarySides')
    forcedDraws = [0.9]
    const runnerOnly = await make(organiserToken, { mode: 'full', legendarySides: { runner: 'on', chaser: 'off' } })
    expect((await gameOf(runnerOnly.code)).settings.legendaries).toEqual({ dato: 'off', ring: 'stash', bomoh: 'off', hijau: 'off' })
    const none = await make(organiserToken, { mode: 'full', legendarySides: { runner: 'off', chaser: 'off' } })
    expect((await gameOf(none.code)).settings.legendaries).toEqual({ dato: 'off', ring: 'off', bomoh: 'off', hijau: 'off' })
  })

  it('the old per-legendary shape is read as sides, so the app still picks', async () => {
    const organiserToken = await createOrganiser()
    forcedDraws = [0.9, 0.9]
    const { code } = await make(organiserToken, { mode: 'full', legendaries: { dato: 'stash', bomoh: 'stash' } })
    expect((await gameOf(code)).settings.legendaries).toEqual({ dato: 'off', ring: 'stash', bomoh: 'off', hijau: 'stash' })
  })

  it('refuses sides that are not off or on', async () => {
    const organiserToken = await createOrganiser()
    await rejects(make(organiserToken, { mode: 'full', legendarySides: { runner: 'yes', chaser: 'off' } }), 400, 'Legendary')
    await rejects(make(organiserToken, { mode: 'full', legendarySides: 'both' }), 400, 'Legendary')
  })

  it('create with both sides on picks one legendary per side, named in the organiser view only, with no card', async () => {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame(BOTH)
    const game = await gameOf(g.code)
    for (const field of ['dato_stash', 'ring_stash', 'bomoh_stash', 'hijau_stash'] as const) expect(game[field] ?? null).toBeNull()
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.settings.legendaries).toEqual({ dato: 'off', ring: 'stash', bomoh: 'off', hijau: 'stash' })
    expect(v.kit!.items.find((i) => i.id === 'tupperware')!.label).toBe('2 red Tupperwares, 1 slip of each side')
    const p = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(p.settings).not.toHaveProperty('legendaries')
  })

  it('Full → Core → Full re-picks', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await make(organiserToken, BOTH)
    // seeded(7)'s first two draws are low: Dato Seri and Bomoh.
    let game = await gameOf(code)
    expect(game.settings.legendaries).toEqual({ dato: 'stash', ring: 'off', bomoh: 'stash', hijau: 'off' })
    expect(await run('setMode', { code, organiserToken, mode: 'core' })).toEqual({ ok: true })
    game = await gameOf(code)
    for (const s of [game.dato_stash, game.ring_stash, game.bomoh_stash, game.hijau_stash]) expect(s ?? null).toBeNull()
    forcedDraws = [0.9, 0.9]
    expect(await run('setMode', { code, organiserToken, mode: 'full' })).toEqual({ ok: true })
    game = await gameOf(code)
    expect(game.settings.legendaries).toEqual({ dato: 'off', ring: 'stash', bomoh: 'off', hijau: 'stash' })
    for (const st of [game.dato_stash, game.ring_stash, game.bomoh_stash, game.hijau_stash]) expect(st ?? null).toBeNull()
    // Full again while already Full keeps the pick.
    forcedDraws = [0.1, 0.1]
    await run('setMode', { code, organiserToken, mode: 'full' })
    expect((await gameOf(code)).settings.legendaries).toEqual({ dato: 'off', ring: 'stash', bomoh: 'off', hijau: 'stash' })
  })

  it('Core releases a dropped orange or green card and its walk step', async () => {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame(BOTH)
    await legacyCard(g.code, 'ring', STASH)
    await run('setKit', { code: g.code, organiserToken: g.organiserToken, placed: { id: 'tupper-kejar', on: true } })
    await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'core' })
    const game = await gameOf(g.code)
    expect(game.ring_stash ?? null).toBeNull()
    expect(game.kit?.placed?.['tupper-kejar']).toBeUndefined()
  })

  it("a marshal's and a player's view never carry ring or hijau names, codes or spots", async () => {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame(BOTH)
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    const RING_AT = { lat: CENTER.lat + 77 / 111_195, lng: CENTER.lng + 0.00031234 }
    const HIJAU_AT = { lat: CENTER.lat - 66 / 111_195, lng: CENTER.lng - 0.00041357 }
    await legacyCard(g.code, 'ring', RING_AT)
    await legacyCard(g.code, 'hijau', HIJAU_AT)
    const game = await gameOf(g.code)
    const secrets = [game.ring_stash!.code!, game.hijau_stash!.code!, String(RING_AT.lat), String(RING_AT.lng), String(HIJAU_AT.lat), String(HIJAU_AT.lng)]
    const names = ['Super Ring', 'Mak Kau Hijau', 'Orange card', 'Green card', 'ringCard', 'hijauCard', 'ringStash', 'hijauStash', 'ring-card', 'hijau-card', '"hijau"', '"ring"']
    const check = async (body: object) => {
      for (const phase of ['lobby', 'chase']) {
        const v = await run<View>('state', { code: g.code, ...body })
        // Every view carries the Mak Kau Hijau takeover field (task 5); null says nothing about this game.
        expect(v.hijau).toBeNull()
        const text = JSON.stringify(v).replace('"hijau":null', '')
        for (const s of [...secrets, ...names]) expect(text, `${phase}: ${s}`).not.toContain(s)
        expect(v.settings).not.toHaveProperty('legendaries')
        if (phase === 'lobby' && (body as { token?: string }).token === siti.token) {
          expect(v.kit!.places.map((p) => p.id)).not.toEqual(expect.arrayContaining(['tupper-dikejar']))
        }
      }
    }
    await check({ token: siti.token })
    await check({ token: g.aina.token })
    await check({ token: g.ben.token })
    const o = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(o.ringStash).toEqual({ ...RING_AT, claimedBy: null, claimedAt: null })
    expect(o.hijauStash).toEqual({ ...HIJAU_AT, claimedBy: null, claimedAt: null })
    expect(o.kit!.places.slice(-2).map((p) => p.id)).toEqual(['tupper-dikejar', 'tupper-kejar'])
    expect(o.kit!.placed).toMatchObject({ 'tupper-dikejar': true, 'tupper-kejar': true })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    for (const body of [{ token: siti.token }, { token: g.aina.token }, { token: g.ben.token }]) {
      const text = JSON.stringify(await run<View>('state', { code: g.code, ...body })).replace('"hijau":null', '')
      for (const s of [...secrets, ...names]) expect(text).not.toContain(s)
    }
  })

  it('a marshal cannot tick or place the orange or green secret steps', async () => {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame(BOTH)
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    await rejects(run('setKit', { code: g.code, token: siti.token, placed: { id: 'tupper-dikejar', on: true } }), 403)
    await rejects(run('setKit', { code: g.code, token: siti.token, tick: { id: 'tupperware', on: true } }), 403)
  })

})

describe('Super Ring and Mak Kau Hijau: the hidden stashes (Plan E2 task 3)', () => {
  const STASH = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const atStash = { lat: STASH.lat, lng: STASH.lng, accuracy_m: 8 }

  /** A chasing Full game with Super Ring and Mak Kau Hijau picked and dropped. Runners: Aina, Chong. Chasers: Ben, Hafiz. */
  async function chasing() {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } })
    const chong = await run('join', { code: g.code, name: 'Chong', accepted: true })
    await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [g.hafiz.playerId]: 'chaser', [chong.playerId]: 'runner' } })
    await run('linkTag', { code: g.code, token: chong.token, tagId: 5 })
    await legacyCard(g.code, 'ring', STASH)
    await legacyCard(g.code, 'hijau', STASH)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    return { ...g, chong, gameId: (await store.gameByCode(g.code))!.id }
  }
  const game = async (g: { code: string }) => (await store.gameByCode(g.code))!
  const scanQr = (g: { code: string }, token: string, qr: string, where: object = atStash) => run('claim', { code: g.code, token, qr, ...where })
  const ring = async (g: { code: string }, token: string, where: object = atStash) => scanQr(g, token, ringQr((await game(g)).ring_stash!.code!), where)
  const hijau = async (g: { code: string }, token: string, where: object = atStash) => scanQr(g, token, hijauQr((await game(g)).hijau_stash!.code!), where)
  const misses = async (g: { gameId: string }) => (await store.events(g.gameId)).filter((e) => e.type === 'stash-miss')
  const stamp = (t: number) => new Date(t).toISOString()

  it('the first free runner in reach claims Super Ring: an unused ring in the slot, the card retired, the stash claimed', async () => {
    const g = await chasing()
    const card = (await game(g)).ring_stash!.card!
    expect(await ring(g, g.aina.token)).toEqual({ ok: true, kind: 'ring' })
    expect((await game(g)).ring_stash).toMatchObject({ claimedBy: g.aina.playerId, claimedAt: stamp(now) })
    const rows = (await store.powerUps(g.gameId)).filter((u) => u.kind === 'ring')
    expect(rows).toEqual([expect.objectContaining({ player_id: g.aina.playerId, used_at: null })])
    const org = (await store.organiserBySessionTokenHash(hashToken(g.organiserToken)))!.organisation_id
    expect((await store.secretCards(org)).find((c) => c.id === card.id)).toMatchObject({ state: 'retired', found_at: stamp(now) })
    // Already claimed: nobody else gets it.
    expect(await ring(g, g.chong.token)).toEqual({ ok: false, reason: 'no-stash' })
  })

  it('two runners at once: exactly one gets Super Ring', async () => {
    const g = await chasing()
    const [a, b] = await Promise.all([ring(g, g.aina.token), ring(g, g.chong.token)])
    expect([a, b].filter((r: { ok: boolean }) => r.ok)).toHaveLength(1)
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'ring')).toHaveLength(1)
  })

  it('a chaser cannot claim Super Ring and a runner cannot claim Mak Kau Hijau; neither is a miss', async () => {
    const g = await chasing()
    for (let k = 0; k < 3; k++) {
      expect(await ring(g, g.ben.token)).toEqual({ ok: false, reason: 'cannot-claim' })
      expect(await hijau(g, g.aina.token)).toEqual({ ok: false, reason: 'cannot-claim' })
    }
    expect(await misses(g)).toHaveLength(0)
    expect(await ring(g, g.aina.token)).toEqual({ ok: true, kind: 'ring' })
    expect(await hijau(g, g.ben.token)).toEqual({ ok: true, kind: 'hijau' })
  })

  it('a full slot refuses Super Ring with hand-full, and it is not a miss', async () => {
    const g = await chasing()
    const cloak = await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'cloak', station: 1 })
    for (let k = 0; k < 3; k++) expect(await ring(g, g.aina.token)).toEqual({ ok: false, reason: 'hand-full' })
    expect(await misses(g)).toHaveLength(0)
    await store.updatePowerUp(cloak.id, { taken_at: stamp(now) })
    expect(await ring(g, g.aina.token)).toEqual({ ok: true, kind: 'ring' })
  })

  it('a jailed runner cannot claim Super Ring', async () => {
    const g = await chasing()
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: true } }])
    expect(await ring(g, g.aina.token)).toEqual({ ok: false, reason: 'cannot-claim' })
  })

  it('a Luar Garisan player is refused before anything is judged', async () => {
    const g = await chasing()
    await store.updatePlayers([
      { id: g.aina.playerId, patch: { disqualified_at: stamp(now) } },
      { id: g.ben.playerId, patch: { disqualified_at: stamp(now) } },
    ])
    expect(await ring(g, g.aina.token)).toEqual({ ok: false, reason: 'disqualified' })
    expect(await hijau(g, g.ben.token)).toEqual({ ok: false, reason: 'disqualified' })
    expect((await game(g)).ring_stash!.claimedBy).toBeNull()
    expect((await game(g)).hijau_stash!.claimedBy).toBeNull()
  })

  it('a chaser in reach claims Mak Kau Hijau: games.hijau gets a 20 s window from the claim, the card is retired, no powerups row', async () => {
    const g = await chasing()
    const card = (await game(g)).hijau_stash!.card!
    expect(await hijau(g, g.ben.token)).toEqual({ ok: true, kind: 'hijau' })
    const after = await game(g)
    expect(after.hijau_stash).toMatchObject({ claimedBy: g.ben.playerId, claimedAt: stamp(now) })
    // Starting at the claim, its push goes out with it (task 5).
    expect(after.hijau).toMatchObject({ claimedBy: g.ben.playerId, claimedAt: stamp(now), startsAt: stamp(now), deadline: stamp(now + 20_000), sentAt: stamp(now), settledAt: null, tapped: [] })
    const org = (await store.organiserBySessionTokenHash(hashToken(g.organiserToken)))!.organisation_id
    expect((await store.secretCards(org)).find((c) => c.id === card.id)).toMatchObject({ state: 'retired', found_at: stamp(now) })
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'hijau')).toHaveLength(0)
    expect(await hijau(g, g.hafiz.token)).toEqual({ ok: false, reason: 'no-stash' })
  })

  it('a frozen chaser cannot claim Mak Kau Hijau, and it is not a miss', async () => {
    const g = await chasing()
    await store.updatePlayers([{ id: g.ben.playerId, patch: { frozen_until: stamp(now + 3 * MIN) } }])
    expect(await hijau(g, g.ben.token)).toEqual({ ok: false, reason: 'frozen', frozenForMs: 3 * MIN })
    expect(await misses(g)).toHaveLength(0)
    expect((await game(g)).hijau).toBeFalsy()
  })

  it('the wrong-scan limit applies to each, tagged with its legendary; one does not lock the other', async () => {
    const g = await chasing()
    for (let i = 0; i < STASH_MISS_LIMIT; i++) {
      expect(await scanQr(g, g.aina.token, ringQr('x'.repeat(22)))).toEqual({ ok: false, reason: 'no-stash' })
      expect(await scanQr(g, g.ben.token, hijauQr('y'.repeat(22)))).toEqual({ ok: false, reason: 'no-stash' })
    }
    const all = await misses(g)
    expect(all.filter((e) => e.data.legendary === 'ring' && e.actor_id === g.aina.playerId)).toHaveLength(3)
    expect(all.filter((e) => e.data.legendary === 'hijau' && e.actor_id === g.ben.playerId)).toHaveLength(3)
    // The right code at the right spot is now ignored for those two, silently and unrecorded.
    expect(await ring(g, g.aina.token)).toEqual({ ok: false, reason: 'no-stash' })
    expect(await hijau(g, g.ben.token)).toEqual({ ok: false, reason: 'no-stash' })
    expect(await misses(g)).toHaveLength(6)
    // Others still claim.
    expect(await ring(g, g.chong.token)).toEqual({ ok: true, kind: 'ring' })
    expect(await hijau(g, g.hafiz.token)).toEqual({ ok: true, kind: 'hijau' })
  })

  it("a bare or made-up card is a miss and claims nothing; a too-far scan is a miss too", async () => {
    const g = await chasing()
    for (const qr of ['KEJAR:RING', ringQr('z'.repeat(22)), 'KEJAR:RING:']) expect(await scanQr(g, g.aina.token, qr)).toEqual({ ok: false, reason: 'no-stash' })
    expect(await ring(g, g.chong.token, { lat: CENTER.lat, lng: CENTER.lng, accuracy_m: 8 })).toEqual({ ok: false, reason: 'too-far' })
    expect(await misses(g)).toHaveLength(4)
    expect((await game(g)).ring_stash!.claimedBy).toBeNull()
  })

  it('a game that picked Dato Seri and Bomoh never answers a ring or hijau card', async () => {
    forcedDraws = [0.1, 0.1]
    const g = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    expect(await scanQr(g, g.aina.token, ringQr('x'.repeat(22)))).toEqual({ ok: false, reason: 'no-stash' })
    expect(await scanQr(g, g.ben.token, hijauQr('x'.repeat(22)))).toEqual({ ok: false, reason: 'no-stash' })
  })

  it('secret: the feed says only "Something legendary was found." and no view names a legendary', async () => {
    const g = await chasing()
    await ring(g, g.aina.token)
    await hijau(g, g.ben.token)
    for (const token of [g.hafiz.token, g.chong.token, g.aina.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(v.feed.filter((f) => f.text === 'Something legendary was found.')).toHaveLength(2)
      // Mak Kau Hijau announces itself once its 45 s starts (task 5, §6.3); the found line still names nothing.
      expect(v.feed.filter((f) => !f.text.startsWith('Mak kau hijau!')).map((f) => f.text).join(' ')).not.toMatch(/Ring|Hijau|Mak Kau/i)
      expect(v).not.toHaveProperty('ringZone')
      expect(v).not.toHaveProperty('hijauZone')
    }
  })

  it('no zones reach runners or chasers, before or after a claim', async () => {
    const g = await chasing()
    for (const token of [g.aina.token, g.ben.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(v).not.toHaveProperty('ringZone')
      expect(v).not.toHaveProperty('hijauZone')
      expect(v).not.toHaveProperty('legendaryZone')
      expect(v).not.toHaveProperty('bomohZone')
    }
    await ring(g, g.aina.token)
    expect(await run<View>('state', { code: g.code, token: g.chong.token })).not.toHaveProperty('ringZone')
    expect(await run<View>('state', { code: g.code, token: g.chong.token })).not.toHaveProperty('hijauZone')
    await hijau(g, g.ben.token)
    expect(await run<View>('state', { code: g.code, token: g.chong.token })).not.toHaveProperty('hijauZone')
  })

  it('Super Ring cannot be used from the slot: it is automatic', async () => {
    const g = await chasing()
    await ring(g, g.aina.token)
    const row = (await store.powerUps(g.gameId)).find((u) => u.kind === 'ring')!
    expect(await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: row.id })).toEqual({ ok: false, reason: 'automatic' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === row.id)!.used_at).toBeNull()
  })

  it('a Core game has no ring or hijau zones', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    const v = await run<View>('state', { code: g.code, token: g.aina.token })
    expect(v).not.toHaveProperty('ringZone')
    expect(v).not.toHaveProperty('hijauZone')
  })
})

describe('Super Ring: house arrest instead of Penjara (Plan E2 task 4)', () => {
  const S = 1000
  const ARREST = 156 * S
  const STASH = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const LOCK_LINE = { ok: false, reason: 'ring', name: 'Aina' }
  type G = Awaited<ReturnType<typeof holding>>

  /**
   * A chasing Full game where Aina (#07) holds an unused Super Ring. Runners: Aina, Hafiz (#03). Chasers: Ben, Chong.
   * Siti is a marshal. `now` is left at +7 min.
   */
  async function holding(settings: object = {}) {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'on' }, ...settings })
    const chong = await run('join', { code: g.code, name: 'Chong', accepted: true })
    await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [chong.playerId]: 'chaser' } })
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    await legacyCard(g.code, 'ring', STASH)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    const code = (await store.gameByCode(g.code))!.ring_stash!.code!
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: ringQr(code), ...STASH, accuracy_m: 8 })).toEqual({ ok: true, kind: 'ring' })
    pushes = []
    return { ...g, chong, siti, gameId }
  }
  /** `chaser` scans a runner's tag at `ms`, the runner having just reported from `runnerM` and the chaser standing at `chaserM`. */
  async function catchAt(g: G, chaser: 'ben' | 'chong', who: 'aina' | 'hafiz', ms: number, runnerM = 10, chaserM = 0) {
    now = ms
    await run('location', { code: g.code, token: g[who].token, ...at(runnerM) })
    return run('catch', { code: g.code, token: g[chaser].token, tagQr: tagQr(who === 'aina' ? 7 : 3), ...at(chaserM) })
  }
  const row = async (g: G, id: string) => (await store.players(g.gameId)).find((p) => p.id === id)!
  const ringRow = async (g: G) => (await store.powerUps(g.gameId)).find((u) => u.kind === 'ring')!
  const evs = async (g: G, type: string) => (await store.events(g.gameId)).filter((e) => e.type === type)
  const notices = (name: string) => pushes.filter((p) => p.endpoint === `https://push/${name}` && (p.payload as any).type === 'notice').map((p) => (p.payload as any).body)
  const poll = (g: G, ms: number, token?: string) => {
    now = ms
    return run<View>('state', token ? { code: g.code, token } : { code: g.code, organiserToken: g.organiserToken })
  }
  /** Aina reports from `m` metres every 10 s from `fromMs` to `toMs` (inclusive). */
  async function stayAt(g: G, fromMs: number, toMs: number, m = 10) {
    for (let t = fromMs; t <= toMs; t += 10 * S) {
      now = t
      await run('location', { code: g.code, token: g.aina.token, ...at(m) })
    }
  }

  it('a catch on a Super Ring holder puts them under house arrest, not Penjara', async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    expect(await catchAt(g, 'ben', 'aina', t0)).toEqual(LOCK_LINE)
    const aina = await row(g, g.aina.playerId)
    expect(aina.jailed).toBe(false)
    expect(aina.caught_by).toBeNull()
    const { lat, lng } = at(10)
    expect(aina.arrest).toMatchObject({ route: 'catch', by: g.ben.playerId, center: { lat, lng }, startedAt: new Date(t0).toISOString(), firedAt: new Date(t0).toISOString() })
    expect((await ringRow(g)).used_at).toBe(new Date(t0).toISOString())
    const arrested = await evs(g, 'arrested')
    expect(arrested).toHaveLength(1)
    expect(aina.arrest!.catchEventId).toBe(arrested[0].id)
    expect(await evs(g, 'caught')).toHaveLength(0)
    expect(await evs(g, 'ring-locked')).toEqual([expect.objectContaining({ actor_id: g.ben.playerId, target_id: g.aina.playerId, data: { firedAt: new Date(t0).toISOString() } })])
    expect(notices('Aina')).toEqual(['Super Ring! House arrest: stay within 26 m for 2:36.'])
    // The feed says only that something legendary saved a Dikejar, never the card or who.
    const hafiz = await poll(g, t0 + S, g.hafiz.token)
    expect(hafiz.feed.map((f) => f.text)).toContain('Something legendary saved a Dikejar.')
    expect(hafiz.feed.filter((f) => Date.parse(f.at) >= t0).map((f) => f.text)).toEqual(['Something legendary saved a Dikejar.'])
    // Her own view carries the circle and the end.
    const mine = await poll(g, t0 + S, g.aina.token)
    expect(mine.arrest).toEqual({ endsAt: t0 + ARREST, center: { lat, lng }, openBy: null })
    expect((await poll(g, t0 + S, g.hafiz.token)).arrest).toBeNull()
  })

  it("the circle goes on the chaser's fix when the runner's is older than 20 s", async () => {
    const g = await holding()
    now = T0 + 8 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(30) })
    now += 21 * S
    await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7), ...at(0) })
    const { lat, lng } = at(0)
    expect((await row(g, g.aina.playerId)).arrest!.center).toEqual({ lat, lng })
  })

  it('the catching chaser can never catch them again; another chaser can after release', async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    await catchAt(g, 'ben', 'aina', t0)
    await stayAt(g, t0 + 10 * S, t0 + ARREST)
    await poll(g, t0 + ARREST + S)
    expect((await row(g, g.aina.playerId)).arrest).toBeNull()
    expect(await catchAt(g, 'ben', 'aina', t0 + ARREST + 2 * S)).toEqual({ ok: false, reason: 'ring-locked', name: 'Aina' })
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    expect(await catchAt(g, 'chong', 'aina', t0 + ARREST + 5 * S)).toMatchObject({ ok: true })
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: true, caught_by: g.chong.playerId })
  })

  it('nobody can catch them during house arrest', async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    await catchAt(g, 'ben', 'aina', t0)
    expect(await catchAt(g, 'chong', 'aina', t0 + 10 * S)).toEqual({ ok: false, reason: 'arrest', name: 'Aina' })
    expect(await catchAt(g, 'ben', 'aina', t0 + 20 * S)).toEqual({ ok: false, reason: 'ring-locked', name: 'Aina' })
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false })
    // Neither refusal records anything.
    expect(await evs(g, 'ring-locked')).toHaveLength(1)
    expect(await evs(g, 'caught')).toHaveLength(0)
  })

  it("chasers don't see them on the map", async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    await catchAt(g, 'ben', 'aina', t0)
    await stayAt(g, t0 + 10 * S, T0 + 10 * MIN)
    // The +10 ping reveals while she is under house arrest: no dot and no "never checked in" note.
    const v = await poll(g, T0 + 10 * MIN, g.chong.token)
    expect(v.lastRevealAt).toBe(T0 + 10 * MIN)
    expect(v.dots.filter((d) => d.id === g.aina.playerId)).toHaveLength(0)
    expect(v.dots.filter((d) => d.id === g.hafiz.playerId)).toHaveLength(0)
    expect(v.feed.map((f) => f.text)).toContain('#03 never checked in')
    expect(v.feed.map((f) => f.text).join(' ')).not.toMatch(/#07/)
  })

  it("stays inside with Kejar open for 2:36: free, ring spent, and they don't use their freed-once", async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    await catchAt(g, 'ben', 'aina', t0)
    await stayAt(g, t0 + 10 * S, t0 + ARREST - 5 * S, 15)
    await poll(g, t0 + ARREST - S)
    expect((await row(g, g.aina.playerId)).arrest).not.toBeNull()
    // A poll well after the end still judges on the fix at or before it.
    await poll(g, t0 + ARREST + 30 * S)
    const aina = await row(g, g.aina.playerId)
    expect(aina).toMatchObject({ jailed: false, freed_once: false, arrest: null })
    expect((await ringRow(g)).used_at).not.toBeNull()
    expect((await evs(g, 'arrest-ended')).map((e) => e.data)).toEqual([{ outcome: 'free', firedAt: new Date(t0).toISOString() }])
    expect(notices('Aina')).toContain('Free! Super Ring is spent.')
    // Spent: the next catch is a plain catch.
    expect(await catchAt(g, 'chong', 'aina', t0 + ARREST + 40 * S)).toMatchObject({ ok: true })
  })

  it('steps outside early: Penjara at once', async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    await catchAt(g, 'ben', 'aina', t0)
    await stayAt(g, t0 + 10 * S, t0 + 30 * S)
    // A rough fix outside doesn't count.
    now = t0 + 40 * S
    await run('location', { code: g.code, token: g.aina.token, ...at(80), accuracy_m: 60 })
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    now = t0 + 50 * S
    await run('location', { code: g.code, token: g.aina.token, ...at(60) })
    const aina = await row(g, g.aina.playerId)
    expect(aina).toMatchObject({ jailed: true, caught_by: null, arrest: null, freed_once: false })
    expect(notices('Aina')).toContain('Bail revoked. To Penjara.')
    expect((await evs(g, 'arrest-ended')).map((e) => e.data)).toEqual([{ outcome: 'revoked', firedAt: new Date(t0).toISOString() }])
    expect((await evs(g, 'auto-jailed')).map((e) => e.data)).toEqual([expect.objectContaining({ cause: 'revoked', who: 'Aina #07' })])
    const v = await poll(g, now + S, g.aina.token)
    expect(v.jailReason).toBe('bail-revoked')
    expect(v.arrest).toBeNull()
    // A marshal can still undo it as a phone problem.
    const alert = (await poll(g, now + S)).alerts.find((a) => a.kind === 'auto-jail')!
    expect(alert.text).toBe('Aina #07 sent to Penjara (bail revoked)')
    now += 2 * S
    expect(await run('undoAutoJail', { code: g.code, eventId: alert.id, token: g.siti.token })).toEqual({ ok: true })
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, freed_once: false })
  })

  it('stops sending fixes: Penjara at 2:36 (Review Focus 1)', async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    await catchAt(g, 'ben', 'aina', t0)
    await stayAt(g, t0 + 10 * S, t0 + 30 * S)
    await poll(g, t0 + ARREST - S)
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    await poll(g, t0 + ARREST)
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: true, arrest: null })
    expect(notices('Aina')).toContain('Bail revoked. To Penjara.')
    expect((await evs(g, 'arrest-ended')).map((e) => e.data.outcome)).toEqual(['revoked'])
  })

  it('paused for 1 min during house arrest: release comes 1 min later (Review Focus 2)', async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    await catchAt(g, 'ben', 'aina', t0)
    await stayAt(g, t0 + 10 * S, t0 + 60 * S)
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    // A fix outside while paused changes nothing.
    now = t0 + 90 * S
    await run('location', { code: g.code, token: g.aina.token, ...at(80) })
    expect((await row(g, g.aina.playerId)).arrest).not.toBeNull()
    now = t0 + 120 * S
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    expect((await row(g, g.aina.playerId)).arrest!.startedAt).toBe(new Date(t0 + MIN).toISOString())
    expect((await poll(g, t0 + 121 * S, g.aina.token)).arrest!.endsAt).toBe(t0 + MIN + ARREST)
    await stayAt(g, t0 + 130 * S, t0 + MIN + ARREST - 5 * S)
    await poll(g, t0 + ARREST + S)
    expect((await row(g, g.aina.playerId)).arrest).not.toBeNull()
    await poll(g, t0 + MIN + ARREST)
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, arrest: null })
    expect(notices('Aina')).toContain('Free! Super Ring is spent.')
  })

  it('a poll while paused does not judge, and the view holds the end still', async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    await catchAt(g, 'ben', 'aina', t0)
    now = t0 + 60 * S
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    const v = await poll(g, t0 + ARREST + 10 * S, g.aina.token)
    expect(v.arrest!.endsAt).toBe(t0 + ARREST + ARREST - 50 * S)
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, arrest: expect.anything() })
  })

  describe('auto-jail with Super Ring', () => {
    /** Schedule mode: pings reveal at +10 and +15. Hafiz checks in to both; Aina misses both, so +15 would jail her. */
    async function missedTwo() {
      const g = await holding({ checkinMode: 'schedule' })
      for (const m of [10, 15]) {
        now = T0 + m * MIN - 20 * S
        await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
        await poll(g, T0 + m * MIN)
      }
      return g
    }

    it('push to open Kejar; the first fresh fix starts it there', async () => {
      const g = await missedTwo()
      const fired = T0 + 15 * MIN
      const aina = await row(g, g.aina.playerId)
      expect(aina.jailed).toBe(false)
      expect(aina.arrest).toMatchObject({ route: 'auto-jail', by: null, center: null, startedAt: null, catchEventId: null, firedAt: new Date(fired).toISOString() })
      expect(await evs(g, 'auto-jailed')).toHaveLength(0)
      expect(await evs(g, 'ring-locked')).toHaveLength(0)
      expect(await evs(g, 'arrested')).toHaveLength(1)
      expect(notices('Aina')).toEqual(['Super Ring! Open Kejar within 60 s to start house arrest.'])
      expect((await poll(g, fired + S, g.aina.token)).arrest).toEqual({ endsAt: null, center: null, openBy: fired + 60 * S })
      // A rough fix doesn't start it; a usable one does, right there.
      now = fired + 20 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(150), accuracy_m: 70 })
      expect((await row(g, g.aina.playerId)).arrest!.startedAt).toBeNull()
      now = fired + 30 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(120) })
      const { lat, lng } = at(120)
      expect((await row(g, g.aina.playerId)).arrest).toMatchObject({ center: { lat, lng }, startedAt: new Date(now).toISOString() })
      expect(notices('Aina').at(-1)).toBe('Super Ring! House arrest: stay within 26 m for 2:36.')
      // Past the 60 s, a started arrest keeps going.
      await stayAt(g, fired + 40 * S, fired + 90 * S, 120)
      await poll(g, fired + 91 * S)
      expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, arrest: expect.objectContaining({ center: { lat, lng } }) })
    })

    it('no fix in 60 s means Penjara, and Super Ring is spent', async () => {
      const g = await missedTwo()
      const fired = T0 + 15 * MIN
      await poll(g, fired + 59 * S)
      expect((await row(g, g.aina.playerId)).jailed).toBe(false)
      await poll(g, fired + 60 * S)
      expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: true, caught_by: null, arrest: null })
      expect((await ringRow(g)).used_at).not.toBeNull()
      expect((await evs(g, 'auto-jailed')).map((e) => e.data)).toEqual([expect.objectContaining({ cause: 'no-show', who: 'Aina #07' })])
      // Still the missed check-ins Penjara screen, with the check-ins that sent her.
      const v = await poll(g, fired + 61 * S, g.aina.token)
      expect(v.jailReason).toBe('missed-checkins')
      expect(v.jailCheckins).toEqual([
        { at: T0 + 10 * MIN, ok: false },
        { at: T0 + 15 * MIN, ok: false },
      ])
    })
  })

  it('undo kejar on the arrest ends it, lifts the lock and gives Super Ring back', async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    await catchAt(g, 'ben', 'aina', t0)
    const roster = (await poll(g, t0 + 10 * S)).roster
    const eventId = (await evs(g, 'arrested'))[0].id
    expect(roster.find((p) => p.id === g.aina.playerId)!.undoKejarId).toBe(eventId)
    now = t0 + 20 * S
    expect(await run('undoKejar', { code: g.code, eventId, token: g.siti.token })).toEqual({ ok: true })
    expect(await run('undoKejar', { code: g.code, eventId, token: g.siti.token })).toEqual({ ok: false, reason: 'not-undoable' })
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, arrest: null })
    expect((await ringRow(g)).used_at).toBeNull()
    expect((await evs(g, 'arrest-ended')).map((e) => e.data)).toEqual([{ outcome: 'undone', firedAt: new Date(t0).toISOString() }])
    expect((await poll(g, t0 + 21 * S)).roster.find((p) => p.id === g.aina.playerId)!.undoKejarId).toBeNull()
    // The lock is lifted: Ben's next catch fires Super Ring again, rather than being refused.
    expect(await catchAt(g, 'ben', 'aina', t0 + 30 * S)).toEqual(LOCK_LINE)
  })

  it('the game ends during house arrest: they count as free (Dikejar win if nobody else is free)', async () => {
    // A 15-minute chase: hiding to +5, the chase to +20, scheduled pings at +10 and +15. No endgame, so Bomba's pings
    // don't join them.
    const g = await holding({ lengthMin: 15, checkinMode: 'schedule', endgames: { bomba: 'off', hebat: 'off', pkp: 'off' } })
    expect(await catchAt(g, 'chong', 'hafiz', T0 + 8 * MIN)).toMatchObject({ ok: true })
    for (const m of [10, 15]) {
      now = T0 + m * MIN - 20 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    }
    expect(await catchAt(g, 'ben', 'aina', T0 + 19 * MIN)).toEqual(LOCK_LINE)
    expect(await evs(g, 'final-whistle')).toHaveLength(0)
    const over = await poll(g, T0 + 20 * MIN + S)
    expect(over.phase).toBe('ended')
    expect(over.results?.winner).toBe('runners')
    expect(over.results?.survivors).toEqual([g.aina.playerId])
    // The results screen gets no stale house arrest.
    expect((await poll(g, T0 + 20 * MIN + 2 * S, g.aina.token)).arrest).toBeNull()
  })

  describe('fix round 1', () => {
    it('release ignores a rough fix in the last 20 s: inside until T-5 s, then a 60 m fix at T-2 s, is free', async () => {
      const g = await holding()
      const t0 = T0 + 8 * MIN
      await catchAt(g, 'ben', 'aina', t0)
      await stayAt(g, t0 + 10 * S, t0 + ARREST - 5 * S)
      now = t0 + ARREST - 2 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(80), accuracy_m: 60 })
      await poll(g, t0 + ARREST + S)
      expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, arrest: null })
      expect((await evs(g, 'arrest-ended')).map((e) => e.data.outcome)).toEqual(['free'])
    })

    it("a runner's rough fix is not used as the circle's centre", async () => {
      const g = await holding()
      now = T0 + 8 * MIN
      await run('location', { code: g.code, token: g.aina.token, ...at(10), accuracy_m: 150 })
      await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7), ...at(0) })
      const { lat, lng } = at(0)
      expect((await row(g, g.aina.playerId)).arrest!.center).toEqual({ lat, lng })
    })

    it('release restarts the check-in count: auto-jailed into house arrest, released, then one more miss does not jail', async () => {
      const g = await holding({ checkinMode: 'schedule' })
      const hafizIn = async (m: number) => {
        now = T0 + m * MIN - 20 * S
        await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
        await poll(g, T0 + m * MIN)
      }
      await hafizIn(10)
      await hafizIn(15)
      const started = T0 + 15 * MIN + 10 * S
      now = started
      await run('location', { code: g.code, token: g.aina.token, ...at(10) })
      await stayAt(g, started + 10 * S, started + ARREST - 5 * S)
      await poll(g, started + ARREST + S)
      expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, arrest: null, freed_at: null })
      // She misses +20: one miss since her release, so she stays free; and her banner says one missed.
      await hafizIn(20)
      expect((await row(g, g.aina.playerId)).jailed).toBe(false)
      expect((await poll(g, T0 + 20 * MIN + S, g.aina.token)).checkin?.missedInRow).toBe(1)
      // A second miss in a row does.
      await hafizIn(25)
      expect((await row(g, g.aina.playerId)).jailed).toBe(true)
    })

    it('catching the rescuer fails the rescue, even when Super Ring fires', async () => {
      const g = await holding()
      await store.updatePlayers([{ id: g.hafiz.playerId, patch: { jailed: true, caught_at: new Date(now).toISOString(), caught_by: g.ben.playerId } }])
      now = T0 + 8 * MIN
      expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true, rescue: 'started' })
      now += 3 * S
      expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7), ...at(0) })).toEqual(LOCK_LINE)
      expect((await store.gameByCode(g.code))!.rescue).toBeNull()
      expect(await evs(g, 'rescue-failed')).toMatchObject([{ actor_id: g.aina.playerId }])
      now += 10 * S
      await poll(g, now)
      expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
    })

    it('the ping count leaves out a runner under house arrest', async () => {
      const g = await holding()
      const t0 = T0 + 8 * MIN
      await catchAt(g, 'ben', 'aina', t0)
      await stayAt(g, t0 + 10 * S, T0 + 10 * MIN - 5 * S)
      now = T0 + 10 * MIN - 20 * S
      await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
      const v = await poll(g, T0 + 10 * MIN, g.chong.token)
      expect((await evs(g, 'ping')).find((e) => e.data.seq === 1)!.data).toMatchObject({ seen: 1, missed: 0 })
      expect(v.feed.map((f) => f.text)).toContain('Ping: 1 Dikejar seen.')
    })

    it('a no-show after a pause still keeps the check-ins that sent them', async () => {
      const g = await holding({ checkinMode: 'schedule' })
      for (const m of [10, 15]) {
        now = T0 + m * MIN - 20 * S
        await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
        await poll(g, T0 + m * MIN)
      }
      now = T0 + 15 * MIN + 20 * S
      await run('pause', { code: g.code, organiserToken: g.organiserToken })
      now = T0 + 16 * MIN + 20 * S
      await run('resume', { code: g.code, organiserToken: g.organiserToken })
      expect((await row(g, g.aina.playerId)).arrest!.firedAt).toBe(new Date(T0 + 16 * MIN).toISOString())
      await poll(g, T0 + 17 * MIN)
      expect((await row(g, g.aina.playerId)).jailed).toBe(true)
      const jailing = (await evs(g, 'auto-jailed'))[0]
      expect(jailing.data).toMatchObject({ cause: 'no-show', checkins: [{ revealAt: T0 + 10 * MIN, ok: false }, { revealAt: T0 + 15 * MIN, ok: false }] })
    })
  })

  describe('final review fixes', () => {
    it('the release check ignores a fix sent during a pause: out during the pause, back in after, is free', async () => {
      const g = await holding()
      const t0 = T0 + 8 * MIN
      await catchAt(g, 'ben', 'aina', t0)
      await stayAt(g, t0 + 10 * S, t0 + 140 * S)
      now = t0 + 148 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(10) })
      now = t0 + 150 * S
      await run('pause', { code: g.code, organiserToken: g.organiserToken })
      // She walks out while paused: stored, but it must not count.
      now = t0 + 155 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(80) })
      now = t0 + 160 * S
      await run('resume', { code: g.code, organiserToken: g.organiserToken })
      // The end moved 10 s, to t0 + 166 s: the last 20 s now reach back into the pause.
      expect((await poll(g, t0 + 161 * S, g.aina.token)).arrest!.endsAt).toBe(t0 + 10 * S + ARREST)
      // Back in after the resume, just after the end: too late to count, so t0 + 148 s is what she's judged on.
      now = t0 + 167 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(10) })
      await poll(g, t0 + 168 * S)
      expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, arrest: null })
      expect((await evs(g, 'arrest-ended')).map((e) => e.data.outcome)).toEqual(['free'])
    })

    it('Luar Garisan on a fix outside the circle: disqualified and the arrest ends, never Penjara too', async () => {
      const g = await holding()
      const t0 = T0 + 8 * MIN
      expect(await catchAt(g, 'ben', 'aina', t0, 195, 190)).toEqual(LOCK_LINE)
      now = t0 + 10 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(225) })
      expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, out_warned_at: expect.any(String) })
      // 45 m from the centre: outside the circle as well as the play area, on the fix that disqualifies her.
      now = t0 + 40 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(240) })
      expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, arrest: null, disqualified_at: new Date(now).toISOString() })
      expect(await evs(g, 'auto-jailed')).toHaveLength(0)
      expect(notices('Aina')).not.toContain('Bail revoked. To Penjara.')
      // Not a revoked arrest either: Luar Garisan ended it, as the poll's own Luar Garisan check does (no event).
      expect(await evs(g, 'arrest-ended')).toHaveLength(0)
    })

    it('a chasing poll reads the players for house arrests only once Super Ring has been claimed', async () => {
      forcedDraws = [0.9, 0.9]
      const g = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } })
      await legacyCard(g.code, 'ring', STASH)
      await run('start', { code: g.code, organiserToken: g.organiserToken })
      now = T0 + 7 * MIN
      await run('state', { code: g.code, organiserToken: g.organiserToken })
      const reads = async (ms: number) => {
        const players = store.players
        let n = 0
        store.players = (...a: Parameters<typeof players>) => (n++, players.apply(store, a))
        try {
          now = ms
          await run('state', { code: g.code, organiserToken: g.organiserToken })
        } finally {
          store.players = players
        }
        return n
      }
      const unclaimed = await reads(T0 + 7 * MIN + S)
      const code = (await store.gameByCode(g.code))!.ring_stash!.code!
      now = T0 + 7 * MIN + 2 * S
      expect(await run('claim', { code: g.code, token: g.aina.token, qr: ringQr(code), ...STASH, accuracy_m: 8 })).toEqual({ ok: true, kind: 'ring' })
      expect(await reads(T0 + 7 * MIN + 3 * S)).toBe(unclaimed + 1)
    })

    it('a catch-route arrest that never started reads as bail revoked, not missed check-ins', async () => {
      const g = await holding()
      const fired = T0 + 8 * MIN
      const ring = await ringRow(g)
      await store.updatePowerUp(ring.id, { used_at: new Date(fired).toISOString() })
      const arrest = { firedAt: new Date(fired).toISOString(), route: 'catch' as const, by: g.ben.playerId, center: null, startedAt: null, ringId: ring.id, catchEventId: null }
      await store.updatePlayers([{ id: g.aina.playerId, patch: { arrest } }])
      await poll(g, fired + 60 * S)
      expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: true, arrest: null })
      expect((await evs(g, 'auto-jailed')).map((e) => e.data)).toEqual([expect.objectContaining({ cause: 'revoked', who: 'Aina #07' })])
      expect((await poll(g, fired + 61 * S, g.aina.token)).jailReason).toBe('bail-revoked')
      const feed = (await poll(g, fired + 61 * S, g.hafiz.token)).feed.map((f) => f.text)
      expect(feed.some((f) => f.includes('missed 2 check-ins'))).toBe(false)
    })
  })

  it('Luar Garisan still applies during house arrest', async () => {
    const g = await holding()
    const t0 = T0 + 8 * MIN
    // Caught 5 m inside the edge (the play area reaches 200 m north): the circle pokes outside it.
    expect(await catchAt(g, 'ben', 'aina', t0, 195, 190)).toEqual(LOCK_LINE)
    // 25 m outside the play area but inside the circle (26 m + 8 m): warned, then disqualified 30 s later.
    now = t0 + 10 * S
    await run('location', { code: g.code, token: g.aina.token, ...at(225) })
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, out_warned_at: expect.any(String) })
    now = t0 + 40 * S
    await run('location', { code: g.code, token: g.aina.token, ...at(225) })
    expect((await row(g, g.aina.playerId)).disqualified_at).toBe(new Date(now).toISOString())
    expect(await evs(g, 'luar-garisan')).toHaveLength(1)
    // Out of the round: the house arrest is over and nothing more happens to her.
    await poll(g, t0 + ARREST + S)
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: false, arrest: null })
    expect(await evs(g, 'auto-jailed')).toHaveLength(0)
  })
})

describe('Mak Kau Hijau (Plan E2 task 5)', () => {
  const S = 1000
  const STASH = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const atStash = { ...STASH, accuracy_m: 8 }
  const PUSH_BODY = 'Mak kau hijau! Tap the green in 20 s or go to Penjara.'
  type G = Awaited<ReturnType<typeof chasing>>

  /**
   * A chasing Full game with Super Ring and Mak Kau Hijau dropped. Runners: Aina (#07), Hafiz (#03).
   * Chasers: Ben, Chong (Chong has no push). Siti is a marshal. `now` is left at +7 min.
   */
  async function chasing(settings: object = {}, moreRunners: string[] = []) {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'on' }, ...settings })
    const chong = await run('join', { code: g.code, name: 'Chong', accepted: true })
    await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [chong.playerId]: 'chaser' } })
    const more: Record<string, { token: string; playerId: string }> = {}
    for (const [k, name] of moreRunners.entries()) {
      const r = await run('join', { code: g.code, name, accepted: true })
      await run('subscribe', { code: g.code, token: r.token, subscription: { endpoint: `https://push/${name}` } })
      await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [r.playerId]: 'runner' } })
      await run('linkTag', { code: g.code, token: r.token, tagId: 11 + k })
      more[name] = r
    }
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    await legacyCard(g.code, 'ring', STASH)
    await legacyCard(g.code, 'hijau', STASH)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    pushes = []
    return { ...g, chong, siti, more, gameId: (await store.gameByCode(g.code))!.id }
  }
  const game = async (g: G) => (await store.gameByCode(g.code))!
  const stamp = (t: number) => new Date(t).toISOString()
  /** A chaser (Ben by default) scans the green card at the stash at `ms`. */
  const claimAt = async (g: G, ms: number, token = g.ben.token) => {
    now = ms
    return run('claim', { code: g.code, token, qr: hijauQr((await game(g)).hijau_stash!.code!), ...atStash })
  }
  const poll = (g: G, ms: number, token?: string) => {
    now = ms
    return run<View>('state', token ? { code: g.code, token } : { code: g.code, organiserToken: g.organiserToken })
  }
  const tap = (g: G, token: string, ms: number) => {
    now = ms
    return run('touchGreen', { code: g.code, token })
  }
  const row = async (g: G, id: string) => (await store.players(g.gameId)).find((p) => p.id === id)!
  const evs = async (g: G, type: string) => (await store.events(g.gameId)).filter((e) => e.type === type)
  const hijauPushes = () => pushes.filter((p) => (p.payload as any).type === 'hijau')
  const texts = (v: View) => v.feed.map((f) => f.text)

  it("claiming it pushes every free runner once and jails those who don't tap in 20 s", async () => {
    const g = await chasing()
    const t = T0 + 7 * MIN
    expect(await claimAt(g, t)).toEqual({ ok: true, kind: 'hijau' })
    expect((await game(g)).hijau).toMatchObject({ startsAt: stamp(t), deadline: stamp(t + 20 * S), sentAt: stamp(t), settledAt: null })
    expect(hijauPushes().map((p) => p.endpoint).sort()).toEqual(['https://push/Aina', 'https://push/Hafiz'])
    expect(hijauPushes()[0].payload).toMatchObject({ type: 'hijau', code: g.code, deadline: t + 20 * S, body: PUSH_BODY })
    expect(await evs(g, 'hijau')).toHaveLength(1)
    await poll(g, t + 5 * S)
    expect(hijauPushes()).toHaveLength(2)

    const aina = await poll(g, t + 5 * S, g.aina.token)
    expect(aina.hijau).toEqual({ claimedAt: t, startsAt: t, deadline: t + 20 * S, tapped: false })
    expect(aina.feed[0]).toMatchObject({ text: 'Mak kau hijau! Tap the green.', act: true })
    const ben = await poll(g, t + 5 * S, g.ben.token)
    expect(ben.hijau).toBeNull()
    expect(ben.feed[0]).toMatchObject({ text: 'Mak kau hijau! Dikejar have 20 s.', act: false })
    expect(await tap(g, g.ben.token, t + 6 * S)).toEqual({ ok: false, reason: 'not-a-target' })

    expect(await tap(g, g.aina.token, t + 10 * S)).toEqual({ ok: true })
    // A retry after a bad connection is still fine.
    expect(await tap(g, g.aina.token, t + 11 * S)).toEqual({ ok: true })
    expect((await poll(g, t + 12 * S, g.aina.token)).hijau).toMatchObject({ tapped: true })
    await poll(g, t + 19 * S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(false)

    await poll(g, t + 20 * S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    expect(await evs(g, 'auto-jailed')).toEqual([expect.objectContaining({ target_id: g.hafiz.playerId, data: expect.objectContaining({ cause: 'hijau' }) })])
    expect((await evs(g, 'hijau-done')).map((e) => e.data)).toEqual([{ void: false, jailed: 1 }])

    const after = await poll(g, t + 21 * S, g.aina.token)
    expect(after.hijau).toBeNull()
    expect(texts(after)).toContain('Safe! You touched green.')
    expect(texts(after)).toContain('Mak kau hijau: 1 Dikejar to Penjara.')
    const benAfter = await poll(g, t + 21 * S, g.ben.token)
    expect(texts(benAfter)).toContain('Mak kau hijau: 1 Dikejar to Penjara.')
    expect(texts(benAfter).join(' ')).not.toMatch(/check-in|Safe/)
    // Marshals get the runner's own line, with the undo.
    const siti = await poll(g, t + 21 * S, g.siti.token)
    expect(siti.alerts.find((a) => a.kind === 'auto-jail')).toMatchObject({ targetId: g.hafiz.playerId, text: 'Hafiz #03 missed Mak kau hijau, sent to Penjara' })
  })

  it("a tap after the deadline doesn't count", async () => {
    const g = await chasing()
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    expect(await tap(g, g.hafiz.token, t + 20 * S)).toEqual({ ok: false, reason: 'too-late' })
    expect(await tap(g, g.aina.token, t + 25 * S)).toEqual({ ok: false, reason: 'too-late' })
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
    expect((await row(g, g.aina.playerId)).jailed).toBe(true)
    expect((await game(g)).hijau!.tapped).toEqual([])
  })

  it('nobody polls until 3 minutes later: judged once, same result', async () => {
    const g = await chasing()
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    await tap(g, g.aina.token, t + 10 * S)
    await poll(g, t + 3 * MIN)
    await poll(g, t + 3 * MIN + S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    expect(await evs(g, 'auto-jailed')).toHaveLength(1)
    expect(await evs(g, 'hijau-done')).toHaveLength(1)
    expect(hijauPushes()).toHaveLength(2)
  })

  it('claimed during a check-in window: starts when it closes', async () => {
    const g = await chasing()
    // Ping 1: alert 9:15, reveal 10:00.
    await claimAt(g, T0 + 9 * MIN + 20 * S)
    expect((await game(g)).hijau).toMatchObject({ startsAt: stamp(T0 + 10 * MIN), deadline: stamp(T0 + 10 * MIN + 20 * S), sentAt: null })
    expect(hijauPushes()).toHaveLength(0)
    expect((await poll(g, T0 + 10 * MIN - S, g.aina.token)).hijau).toBeNull()
    expect(hijauPushes()).toHaveLength(0)
    await poll(g, T0 + 10 * MIN)
    expect(hijauPushes()).toHaveLength(2)
    expect((await poll(g, T0 + 10 * MIN + S, g.aina.token)).hijau).toMatchObject({ startsAt: T0 + 10 * MIN, deadline: T0 + 10 * MIN + 20 * S })
  })

  it("claimed while a Mat Rempit window is pending: starts at that window's reveal", async () => {
    const g = await chasing()
    const flare = await store.addPowerUp({ game_id: g.gameId, player_id: g.chong.playerId, kind: 'flare', station: 1 })
    expect(await run('usePowerup', { code: g.code, token: g.chong.token, powerupId: flare.id })).toEqual({ ok: true, kind: 'flare' })
    await claimAt(g, T0 + 7 * MIN + 10 * S)
    expect((await game(g)).hijau!.startsAt).toBe(stamp(T0 + 7 * MIN + 30 * S))
  })

  it('push went out late (first poll 6 s after start): void, nobody jailed', async () => {
    const g = await chasing()
    await claimAt(g, T0 + 9 * MIN + 20 * S)
    const start = T0 + 10 * MIN
    // Ping 1 reveals at 10:00 with nobody polling; the first poll is 6 s into the 20 s, leaving under 15 s.
    await poll(g, start + 6 * S)
    expect((await game(g)).hijau!.sentAt).toBe(stamp(start + 6 * S))
    expect(await tap(g, g.aina.token, start + 8 * S)).toEqual({ ok: true })
    await poll(g, start + 20 * S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(false)
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    expect((await evs(g, 'hijau-done')).map((e) => e.data)).toEqual([{ void: true, jailed: 0 }])
    expect(texts(await poll(g, start + 21 * S, g.ben.token))).toContain('Mak kau hijau fizzled. The alert went out too late.')
    // Not even the runner who tapped is told "Safe!": the run never counted.
    expect(texts(await poll(g, start + 21 * S, g.aina.token)).join(' ')).not.toMatch(/fizzled|to Penjara|Safe/)
  })

  it('nobody polls inside the 20 s at all: no push went out, so it is void', async () => {
    const g = await chasing()
    await claimAt(g, T0 + 9 * MIN + 20 * S)
    await poll(g, T0 + 11 * MIN)
    expect(hijauPushes()).toHaveLength(0)
    expect((await evs(g, 'hijau-done')).map((e) => e.data)).toEqual([{ void: true, jailed: 0 }])
    expect(await evs(g, 'auto-jailed')).toHaveLength(0)
  })

  it('a runner with push turned off is not immune', async () => {
    const g = await chasing()
    await store.updatePlayers([{ id: g.hafiz.playerId, patch: { push: null } }])
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    expect(hijauPushes().map((p) => p.endpoint)).toEqual(['https://push/Aina'])
    await tap(g, g.aina.token, t + 5 * S)
    await poll(g, t + 20 * S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
  })

  it('Super Ring holder who misses gets house arrest instead', async () => {
    const g = await chasing()
    const ringCode = (await game(g)).ring_stash!.code!
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: ringQr(ringCode), ...atStash })).toEqual({ ok: true, kind: 'ring' })
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    pushes = []
    await poll(g, t + 20 * S)
    const aina = await row(g, g.aina.playerId)
    expect(aina.jailed).toBe(false)
    expect(aina.arrest).toMatchObject({ route: 'hijau', by: null, center: null, startedAt: null })
    expect(pushes.filter((p) => p.endpoint === 'https://push/Aina').map((p) => (p.payload as any).body)).toEqual(['Super Ring! Open Kejar within 60 s to start house arrest.'])
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
    expect((await evs(g, 'auto-jailed')).map((e) => e.target_id)).toEqual([g.hafiz.playerId])
    expect((await evs(g, 'hijau-done')).map((e) => e.data)).toEqual([{ void: false, jailed: 1 }])
  })

  it('a Super Ring holder who misses it and sends no fix for 60 s goes to Penjara for Mak kau hijau, not missed check-ins', async () => {
    const g = await chasing()
    const ringCode = (await game(g)).ring_stash!.code!
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: ringQr(ringCode), ...atStash })).toEqual({ ok: true, kind: 'ring' })
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    await poll(g, t + 20 * S)
    await poll(g, t + 79 * S)
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    await poll(g, t + 80 * S)
    expect(await row(g, g.aina.playerId)).toMatchObject({ jailed: true, caught_by: null, arrest: null })
    const jailing = (await evs(g, 'auto-jailed')).find((e) => e.target_id === g.aina.playerId)!
    expect(jailing.data).toMatchObject({ cause: 'hijau', who: 'Aina #07' })
    // Her Penjara screen: Mak kau hijau got her, with no check-in row.
    const mine = await poll(g, t + 81 * S, g.aina.token)
    expect(mine.jailReason).toBe('hijau')
    expect(mine.jailCheckins).toBeNull()
    // Players: a plain Penjara line that never names the card, and never "missed 2 check-ins".
    for (const token of [g.aina.token, g.ben.token, g.chong.token]) {
      const feed = texts(await poll(g, t + 81 * S, token))
      expect(feed.some((f) => f.includes('missed 2 check-ins'))).toBe(false)
      expect(feed).toContain('#07 went to Penjara.')
    }
    // Marshals: named, as Mak kau hijau, for the undo.
    const marshal = await poll(g, t + 81 * S, g.siti.token)
    expect(texts(marshal).some((f) => f.includes('missed 2 check-ins'))).toBe(false)
    expect(texts(marshal)).toContain('#07 missed Mak kau hijau, sent to Penjara.')
    expect(marshal.alerts.map((a) => a.text)).toContain('Aina #07 missed Mak kau hijau, sent to Penjara')
    expect(marshal.alerts.some((a) => a.text.includes('missed 2 check-ins'))).toBe(false)
  })

  it('Luar Garisan, jailed and arrested runners are left out', async () => {
    const g = await chasing({}, ['Dan', 'Eve'])
    const { Dan: dan, Eve: eve } = g.more
    const arrest = { firedAt: stamp(now), route: 'catch' as const, by: g.ben.playerId, center: STASH, startedAt: stamp(now), ringId: 'r1', catchEventId: null }
    await store.updatePlayers([
      { id: dan.playerId, patch: { disqualified_at: stamp(now) } },
      { id: g.hafiz.playerId, patch: { jailed: true } },
      { id: g.aina.playerId, patch: { arrest } },
    ])
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    expect(hijauPushes().map((p) => p.endpoint)).toEqual(['https://push/Eve'])
    // Only a real target's feed line buzzes.
    const startLine = async (token: string) => (await poll(g, t + S, token)).feed.find((f) => f.text === 'Mak kau hijau! Tap the green.')
    expect(await startLine(eve.token)).toMatchObject({ act: true })
    for (const token of [g.aina.token, g.hafiz.token, dan.token]) expect(await startLine(token)).toMatchObject({ act: false })
    expect(await tap(g, g.hafiz.token, t + S)).toEqual({ ok: false, reason: 'not-a-target' })
    expect((await poll(g, t + S, g.aina.token)).hijau).toBeNull()
    await poll(g, t + 20 * S)
    expect((await evs(g, 'auto-jailed')).map((e) => e.target_id)).toEqual([eve.playerId])
    expect((await row(g, g.aina.playerId)).arrest).toEqual(arrest)
    expect((await row(g, dan.playerId)).jailed).toBe(false)
  })

  it('Mat Rempit is refused while it runs', async () => {
    const g = await chasing()
    const flare = await store.addPowerUp({ game_id: g.gameId, player_id: g.chong.playerId, kind: 'flare', station: 1 })
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    expect(await run('usePowerup', { code: g.code, token: g.chong.token, powerupId: flare.id })).toEqual({ ok: false, reason: 'hijau-running' })
    expect((await store.powerUps(g.gameId)).find((u) => u.id === flare.id)!.used_at).toBeNull()
    now = t + 20 * S
    expect(await run('usePowerup', { code: g.code, token: g.chong.token, powerupId: flare.id })).toEqual({ ok: true, kind: 'flare' })
  })

  it('paused during the 20 s: the deadline moves by the pause', async () => {
    const g = await chasing()
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    now = t + 10 * S
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    // A tap while paused counts (as if made at the pause).
    expect(await tap(g, g.aina.token, t + 30 * S)).toEqual({ ok: true })
    // The countdown holds still while paused.
    expect((await poll(g, t + 40 * S, g.hafiz.token)).hijau).toMatchObject({ deadline: t + 50 * S })
    // Past the old deadline while paused: nobody is judged.
    await poll(g, t + 60 * S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(false)
    now = t + 70 * S
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    expect((await game(g)).hijau!.deadline).toBe(stamp(t + 80 * S))
    await poll(g, t + 79 * S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(false)
    await poll(g, t + 80 * S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
  })

  it('jails the last free runners: final whistle; Phone problem undo during the 60 s calls it off', async () => {
    const g = await chasing()
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    await poll(g, t + 20 * S)
    expect((await row(g, g.aina.playerId)).jailed).toBe(true)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
    expect((await evs(g, 'final-whistle')).map((e) => e.data)).toEqual([{ cause: 'hijau' }])
    expect(texts(await poll(g, t + 21 * S, g.ben.token))).toContain('No Dikejar left free! Final whistle in 60 s.')
    const hafizJail = (await evs(g, 'auto-jailed')).find((e) => e.target_id === g.hafiz.playerId)!
    // Penjara is locked, but the marshal's undo is a safety tool and still works.
    now = t + 45 * S
    expect(await run('undoAutoJail', { code: g.code, token: g.siti.token, eventId: hafizJail.id })).toEqual({ ok: true })
    expect((await game(g)).final_whistle_at).toBeNull()
    await poll(g, t + 20 * S + 61 * S)
    expect((await game(g)).ended_at).toBeNull()
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(false)
  })

  it('too close to the end to run: the card is claimed and settles void at once, with no push', async () => {
    const g = await chasing({ lengthMin: 15 })
    const endsAt = (await poll(g, T0 + 7 * MIN)).endsAt!
    await keepCheckingIn(g, 7, Math.floor((endsAt - T0) / MIN) - 1)
    expect(await claimAt(g, endsAt - 15 * S)).toEqual({ ok: true, kind: 'hijau' })
    expect((await game(g)).hijau!.settledAt).toBe(stamp(endsAt - 15 * S))
    expect(hijauPushes()).toHaveLength(0)
    expect((await evs(g, 'hijau-done')).map((e) => e.data)).toEqual([{ void: true, jailed: 0, ended: true }])
    expect(await evs(g, 'hijau')).toHaveLength(0)
    expect((await poll(g, endsAt - 14 * S, g.aina.token)).hijau).toBeNull()
    // Void: Penjara is not locked.
    expect((await game(g)).hijau!.lockedUntil ?? null).toBeNull()
  })

  it('freed by a jailbreak during the 20 s: never pushed, so no takeover and not jailed', async () => {
    const g = await chasing()
    await store.updatePlayers([{ id: g.hafiz.playerId, patch: { jailed: true, caught_at: stamp(now), caught_by: g.ben.playerId } }])
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    expect((await game(g)).hijau!.targets).toEqual([g.aina.playerId])
    await tap(g, g.aina.token, t + 5 * S)
    now = t + 6 * S
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true })
    await poll(g, t + 17 * S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(false)
    expect((await poll(g, t + 18 * S, g.hafiz.token)).hijau).toBeNull()
    expect(await tap(g, g.hafiz.token, t + 18 * S)).toEqual({ ok: false, reason: 'not-a-target' })
    await poll(g, t + 20 * S)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(false)
    expect((await evs(g, 'hijau-done')).map((e) => e.data)).toEqual([{ void: false, jailed: 0 }])
  })

  it('Durian and Ponteng do not save a runner who misses', async () => {
    const g = await chasing()
    const shield = await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'shield', station: 1 })
    const cloak = await store.addPowerUp({ game_id: g.gameId, player_id: g.hafiz.playerId, kind: 'cloak', station: 1 })
    expect(await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: shield.id })).toEqual({ ok: true, kind: 'shield' })
    expect(await run('usePowerup', { code: g.code, token: g.hafiz.token, powerupId: cloak.id })).toEqual({ ok: true, kind: 'cloak' })
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    await poll(g, t + 20 * S)
    expect((await row(g, g.aina.playerId)).jailed).toBe(true)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
    expect((await evs(g, 'shielded'))).toHaveLength(0)
  })

  it('a runner jailed by Mak Kau Hijau has not used their one freed, and a jailbreak frees them once the lock ends', async () => {
    const g = await chasing()
    const t = T0 + 7 * MIN
    await claimAt(g, t)
    await tap(g, g.aina.token, t + 5 * S)
    await poll(g, t + 20 * S)
    expect(await row(g, g.hafiz.playerId)).toMatchObject({ jailed: true, freed_once: false, caught_by: null })
    now = t + 20 * S + 3 * MIN
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true })
    await poll(g, t + 30 * S + 3 * MIN)
    expect(await row(g, g.hafiz.playerId)).toMatchObject({ jailed: false, freed_once: true })
  })

  describe('tapping reveals you to the Kejar (owner, 2026-11-13)', () => {
    const tapWith = (g: G, token: string, ms: number, fix: object) => {
      now = ms
      return run('touchGreen', { code: g.code, token, ...fix })
    }
    const dotOf = (v: View, id: string) => v.dots.find((d) => d.id === id)

    it('every Kejar sees the tapper as an exact dot where they tapped, until the next ping reveal; runners never do', async () => {
      const g = await chasing()
      const t = T0 + 7 * MIN
      await claimAt(g, t)
      const spot = at(60)
      expect(await tapWith(g, g.aina.token, t + 5 * S, spot)).toEqual({ ok: true })
      expect((await game(g)).hijau!.fixes![g.aina.playerId]).toEqual({ lat: spot.lat, lng: spot.lng, at: stamp(t + 5 * S) })
      for (const token of [g.ben.token, g.chong.token]) {
        const v = await poll(g, t + 6 * S, token)
        expect(dotOf(v, g.aina.playerId)).toMatchObject({ kind: 'runner', lat: spot.lat, lng: spot.lng, exact: true, revealedBy: 'hijau', at: stamp(t + 5 * S) })
        expect(v.dots.some((d) => d.revealedBy === 'hijau' && d.id !== g.aina.playerId)).toBe(false)
      }
      // A fellow runner never sees a hijau reveal.
      expect((await poll(g, t + 6 * S, g.hafiz.token)).dots.some((d) => d.revealedBy === 'hijau')).toBe(false)
      // Still there after the run settles, until the next ping reveal (ping 1 reveals at 10:00).
      expect(dotOf(await poll(g, t + 30 * S, g.ben.token), g.aina.playerId)).toMatchObject({ revealedBy: 'hijau' })
      await keepCheckingIn(g, 9, 10)
      expect(dotOf(await poll(g, T0 + 10 * MIN + S, g.ben.token), g.aina.playerId)?.revealedBy ?? null).not.toBe('hijau')
    })

    it('with no fix on the tap it uses their latest fix from the last 20 s; with none, the tap counts but reveals nothing', async () => {
      const g = await chasing()
      const t = T0 + 8 * MIN
      now = t - 60 * S
      await run('location', { code: g.code, token: g.hafiz.token, ...at(70) })
      now = t - 10 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(50) })
      await claimAt(g, t)
      expect(await tap(g, g.aina.token, t + 5 * S)).toEqual({ ok: true })
      expect(await tap(g, g.hafiz.token, t + 5 * S)).toEqual({ ok: true })
      const hijauRun = (await game(g)).hijau!
      expect([...hijauRun.tapped].sort()).toEqual([g.aina.playerId, g.hafiz.playerId].sort())
      expect(hijauRun.fixes![g.aina.playerId]).toEqual({ lat: at(50).lat, lng: at(50).lng, at: stamp(t + 5 * S) })
      expect(hijauRun.fixes![g.hafiz.playerId]).toBeUndefined()
      const v = await poll(g, t + 6 * S, g.ben.token)
      expect(dotOf(v, g.aina.playerId)).toMatchObject({ revealedBy: 'hijau', lat: at(50).lat })
      expect(dotOf(v, g.hafiz.playerId)?.revealedBy ?? null).not.toBe('hijau')
    })

    it('a fix too rough to use on the tap falls back to the stored one', async () => {
      const g = await chasing()
      const t = T0 + 8 * MIN
      now = t - 5 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(50) })
      await claimAt(g, t)
      expect(await tapWith(g, g.aina.token, t + 5 * S, { ...at(90), accuracy_m: 80 })).toEqual({ ok: true })
      expect((await game(g)).hijau!.fixes![g.aina.playerId]).toMatchObject({ lat: at(50).lat })
    })

    it('a void run (the alert went out late) reveals nobody', async () => {
      const g = await chasing()
      await claimAt(g, T0 + 9 * MIN + 20 * S)
      const start = T0 + 10 * MIN
      await poll(g, start + 6 * S)
      expect(await tapWith(g, g.aina.token, start + 8 * S, at(60))).toEqual({ ok: true })
      expect((await poll(g, start + 9 * S, g.ben.token)).dots.some((d) => d.revealedBy === 'hijau')).toBe(false)
      expect((await poll(g, start + 21 * S, g.ben.token)).dots.some((d) => d.revealedBy === 'hijau')).toBe(false)
    })
  })

  describe('Penjara locked for 3 minutes (owner, 2026-11-13)', () => {
    const lockedFor = (ms: number) => ({ ok: false, reason: 'penjara-locked', lockedMs: ms })

    it('locks from the deadline: no rescue, no Settle, no reel; it says how long, and opens after 3 min', async () => {
      const g = await chasing({}, ['Dan'])
      const dan = g.more.Dan
      const t = T0 + 7 * MIN
      const dato = await store.addPowerUp({ game_id: g.gameId, player_id: g.hafiz.playerId, kind: 'dato', station: null })
      await claimAt(g, t)
      await tap(g, g.aina.token, t + 5 * S)
      await tap(g, dan.token, t + 5 * S)
      await poll(g, t + 20 * S)
      expect((await row(g, g.hafiz.playerId)).jailed).toBe(true)
      expect((await game(g)).hijau!.lockedUntil).toBe(stamp(t + 20 * S + 3 * MIN))

      now = t + 66 * S
      expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toEqual(lockedFor(134 * S))
      expect((await game(g)).rescue ?? null).toBeNull()
      expect(await run('settle', { code: g.code, token: g.hafiz.token, qr: JAIL_QR, targetIds: [], ...at(10) })).toEqual(lockedFor(134 * S))
      expect((await store.powerUps(g.gameId)).find((u) => u.id === dato.id)!.used_at).toBeNull()
      expect(await run('pullReel', { code: g.code, token: g.hafiz.token, ...at(10) })).toEqual(lockedFor(134 * S))
      expect((await row(g, g.hafiz.playerId)).reel_pulled_at ?? null).toBeNull()

      // Everyone's view carries the lock's end, for the Penjara screen's countdown.
      expect((await poll(g, t + 66 * S, g.hafiz.token)).penjaraLockedUntil).toBe(t + 20 * S + 3 * MIN)
      expect((await poll(g, t + 66 * S, g.aina.token)).penjaraLockedUntil).toBe(t + 20 * S + 3 * MIN)

      now = t + 20 * S + 3 * MIN
      expect((await poll(g, now, g.hafiz.token)).penjaraLockedUntil).toBeNull()
      expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true, rescue: 'started' })
    })

    it("a marshal's Undo kejar still works while Penjara is locked", async () => {
      const g = await chasing({}, ['Dan'])
      const dan = g.more.Dan
      const t = T0 + 7 * MIN
      await claimAt(g, t)
      await tap(g, g.aina.token, t + 5 * S)
      await tap(g, dan.token, t + 5 * S)
      await poll(g, t + 20 * S)
      expect((await game(g)).hijau!.lockedUntil).toBe(stamp(t + 20 * S + 3 * MIN))
      // Ben catches Dan (#11) during the lock.
      now = t + 40 * S
      await run('location', { code: g.code, token: dan.token, ...at(10) })
      expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(11), ...at(0) })).toMatchObject({ ok: true })
      expect((await row(g, dan.playerId)).jailed).toBe(true)
      const caught = (await evs(g, 'caught')).find((e) => e.target_id === dan.playerId)!
      now = t + 50 * S
      expect(await run('undoKejar', { code: g.code, eventId: caught.id, token: g.siti.token })).toEqual({ ok: true })
      expect(await row(g, dan.playerId)).toMatchObject({ jailed: false, freed_once: false })
    })

    it('a rescue holding when the 20 s ends cannot succeed', async () => {
      const g = await chasing({}, ['Dan'])
      const dan = g.more.Dan
      await store.updatePlayers([{ id: dan.playerId, patch: { jailed: true, caught_at: stamp(now), caught_by: g.ben.playerId } }])
      const t = T0 + 7 * MIN
      await claimAt(g, t)
      await tap(g, g.aina.token, t + 5 * S)
      // Aina starts a rescue 15 s in; its 10 s hold ends after the deadline.
      now = t + 15 * S
      expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true, rescue: 'started' })
      now = t + 25 * S
      await run('location', { code: g.code, token: g.aina.token, ...at(10) })
      await poll(g, t + 26 * S)
      expect((await row(g, dan.playerId)).jailed).toBe(true)
      expect(await evs(g, 'jailbreak')).toHaveLength(0)
      expect(await evs(g, 'rescue-failed')).toHaveLength(1)
    })

    it('a void run locks nothing', async () => {
      const g = await chasing()
      await store.updatePlayers([{ id: g.hafiz.playerId, patch: { jailed: true, caught_at: stamp(now), caught_by: g.ben.playerId } }])
      await claimAt(g, T0 + 9 * MIN + 20 * S)
      await poll(g, T0 + 11 * MIN)
      expect((await evs(g, 'hijau-done')).map((e) => e.data)).toEqual([{ void: true, jailed: 0 }])
      expect((await game(g)).hijau!.lockedUntil ?? null).toBeNull()
      now = T0 + 11 * MIN + S
      expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true })
    })

    it('pausing freezes the lock, and resume moves it', async () => {
      const g = await chasing()
      const t = T0 + 7 * MIN
      await claimAt(g, t)
      await tap(g, g.aina.token, t + 5 * S)
      await poll(g, t + 20 * S)
      now = t + 80 * S
      await run('pause', { code: g.code, organiserToken: g.organiserToken })
      // 2:00 left at the pause, still 2:00 later on.
      expect((await poll(g, t + 10 * MIN, g.hafiz.token)).penjaraLockedUntil).toBe(t + 10 * MIN + 120 * S)
      now = t + 10 * MIN
      await run('resume', { code: g.code, organiserToken: g.organiserToken })
      expect((await game(g)).hijau!.lockedUntil).toBe(stamp(t + 10 * MIN + 120 * S))
      now = t + 10 * MIN + 119 * S
      expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toEqual(lockedFor(S))
      now = t + 10 * MIN + 120 * S
      expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true })
    })
  })
})

describe('the endgame: roll, reveal and push (Plan E3 task 4)', () => {
  const only = (kind: 'bomba' | 'hebat' | 'pkp') => ({
    mode: 'full',
    endgames: { bomba: kind === 'bomba' ? 'on' : 'off', hebat: kind === 'hebat' ? 'on' : 'off', pkp: kind === 'pkp' ? 'on' : 'off' },
  })
  const begin = async (settings: object) => {
    const g = await readyGame(settings)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    return { ...g, gameId }
  }
  const poll = (g: { code: string; organiserToken: string }, atMs = now) => {
    now = atMs
    return run<View>('state', { code: g.code, organiserToken: g.organiserToken })
  }
  const endgameEvents = async (gameId: string) => (await store.events(gameId)).filter((e) => e.type === 'endgame')
  const bodies = () => pushes.map((p) => (p.payload as { body?: string }).body)
  const iso = (ms: number) => new Date(ms).toISOString()

  it('endgame: start stores the roll, and Full with only Hang Hebat on rolls it', async () => {
    const g = await begin(only('hebat'))
    expect((await store.gameByCode(g.code))!.endgame).toEqual({ kind: 'hebat', revealedAt: null, wanted: null, bountyAt: null })
  })

  it('endgame: start stores null when every switch is off', async () => {
    const g = await begin({ mode: 'core', endgames: { bomba: 'off', hebat: 'off', pkp: 'off' } })
    expect((await store.gameByCode(g.code))!.endgame).toBeNull()
  })

  it("endgame: a Bomba game's ping rows include Bomba's times", async () => {
    const g = await begin(only('bomba'))
    const reveals = (await store.pings(g.gameId)).map((r) => r.reveal_at)
    for (const left of [8, 6, 5, 4, 3, 2, 1]) expect(reveals).toContain(iso(T0 + (50 - left) * MIN))
  })

  it('endgame: nobody polls from 11:00 to 7:50 left; the one poll reveals once, first, and skips the stale alert', async () => {
    const g = await begin(only('bomba'))
    await keepCheckingIn(g, 6, 39)
    await poll(g, T0 + 39 * MIN)
    expect(await endgameEvents(g.gameId)).toHaveLength(0)
    pushes = []
    // Both check in for the 40-minute ping without polling, so nobody is auto-jailed when it reveals late.
    now = T0 + 39.75 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(30) })
    await poll(g, T0 + 42 * MIN + 10_000)
    const events = await store.events(g.gameId)
    const reveal = events.findIndex((e) => e.type === 'endgame')
    expect(events.filter((e) => e.type === 'endgame')).toHaveLength(1)
    expect(events[reveal].data).toEqual({ kind: 'bomba' })
    const bombaSeq = (await store.pings(g.gameId)).find((r) => r.reveal_at === iso(T0 + 42 * MIN))!.seq
    const pingIndexes = events.flatMap((e, k) => (e.type === 'ping' && [bombaSeq - 1, bombaSeq].includes(e.data.seq as number) ? [k] : []))
    expect(pingIndexes).toHaveLength(2)
    expect(pingIndexes.every((k) => k > reveal)).toBe(true)
    expect(pushes.filter((p) => (p.payload as { type: string }).type === 'checkin')).toEqual([])
    expect(bodies().filter((b) => b === 'Endgame: Bomba!')).toHaveLength(3)
  })

  it('endgame: a pause across the moment holds the reveal and moves it 1:30 later', async () => {
    const g = await begin(only('bomba'))
    await keepCheckingIn(g, 6, 39)
    now = T0 + 39.5 * MIN
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    await poll(g, T0 + 40.5 * MIN)
    expect(await endgameEvents(g.gameId)).toHaveLength(0)
    now = T0 + 41 * MIN
    await run('resume', { code: g.code, organiserToken: g.organiserToken })
    await poll(g, T0 + 41.5 * MIN - 1_000)
    expect(await endgameEvents(g.gameId)).toHaveLength(0)
    await poll(g, T0 + 41.5 * MIN)
    expect(await endgameEvents(g.gameId)).toHaveLength(1)
    expect((await store.gameByCode(g.code))!.endgame!.revealedAt).toBe(iso(T0 + 41.5 * MIN))
  })

  it('endgame: PKP at 5:00 left sends one merged push and posts both five-left and endgame', async () => {
    const g = await begin(only('pkp'))
    await keepCheckingIn(g, 6, 44)
    await poll(g, T0 + 44 * MIN)
    pushes = []
    await poll(g, T0 + 45 * MIN)
    expect(bodies().filter((b) => b === '5 minutes left · PKP!')).toHaveLength(3)
    expect(bodies().filter((b) => b === '5 minutes left!')).toHaveLength(0)
    expect(pushes[0].payload).toMatchObject({ type: 'notice', code: g.code, title: 'kejar.' })
    const events = await store.events(g.gameId)
    expect(events.filter((e) => e.type === 'five-left')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'endgame').map((e) => e.data)).toEqual([{ kind: 'pkp' }])
  })

  it('endgame: two concurrent polls at the moment post one event', async () => {
    const g = await begin(only('bomba'))
    await keepCheckingIn(g, 6, 40)
    now = T0 + 40 * MIN
    await Promise.all([poll(g), run('state', { code: g.code, token: g.aina.token })])
    expect(await endgameEvents(g.gameId)).toHaveLength(1)
    expect(bodies().filter((b) => b === 'Endgame: Bomba!')).toHaveLength(3)
  })

  it('endgame: a failed push never fails the poll', async () => {
    const g = await begin(only('bomba'))
    await keepCheckingIn(g, 6, 40)
    pushFails = true
    await poll(g, T0 + 40 * MIN)
    expect(await endgameEvents(g.gameId)).toHaveLength(1)
  })

  it('endgame: Hang Hebat names the never-caught runner over one freed at minute 4', async () => {
    const g = await begin(only('hebat'))
    now = T0 + 9 * MIN
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    await run('location', { code: g.code, token: g.hafiz.token, ...at(20) })
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })).toMatchObject({ ok: true })
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    expect(await breakOut(g.code, g.aina.token)).toMatchObject({ ok: true })
    expect((await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(false)
    await keepCheckingIn(g, 10, 40)
    pushes = []
    await poll(g, T0 + 40 * MIN)
    // Hafiz (#03) would win a tie on tag number; Aina wins because her free stretch is the longer one.
    expect((await endgameEvents(g.gameId)).map((e) => e.data)).toEqual([{ kind: 'hebat', wanted: g.aina.playerId, who: 'Aina #07' }])
    expect((await store.gameByCode(g.code))!.endgame).toMatchObject({ revealedAt: iso(T0 + 40 * MIN), wanted: g.aina.playerId })
    expect(bodies().filter((b) => b === 'Endgame: Hang Hebat! #07 Aina is wanted.')).toHaveLength(3)
  })

  it('endgame: Hang Hebat with nobody eligible is claimed with nobody wanted, and nothing else happens', async () => {
    const g = await begin(only('hebat'))
    await keepCheckingIn(g, 6, 39)
    await store.updatePlayers([g.aina.playerId, g.hafiz.playerId].map((id) => ({ id, patch: { jailed: true, caught_at: iso(T0 + 39 * MIN) } })))
    pushes = []
    await poll(g, T0 + 40 * MIN)
    expect((await store.gameByCode(g.code))!.endgame).toMatchObject({ revealedAt: iso(T0 + 40 * MIN), wanted: null })
    expect(await endgameEvents(g.gameId)).toHaveLength(0)
    expect(pushes.filter((p) => (p.payload as { type: string }).type === 'notice')).toEqual([])
  })

  it('endgame: a wanted runner caught between the pick and the claim blows the bounty whistle at the reveal', async () => {
    // Pings every 3 minutes, so none is revealed at the 40:00 reveal and no ping's own check runs after it.
    const g = await begin({ ...only('hebat'), pingMin: 3 })
    await keepCheckingIn(g, 6, 39)
    await poll(g, T0 + 39.5 * MIN)
    // The pick reads the players, then a catch of the picked runner lands before the claim.
    const claim = store.claimEndgameReveal.bind(store)
    store.claimEndgameReveal = async (gameId, at, wanted) => {
      if (wanted) await store.updatePlayers([{ id: wanted, patch: { jailed: true, caught_at: at } }])
      return claim(gameId, at, wanted)
    }
    await poll(g, T0 + 40 * MIN)
    // Hafiz (#03) wins the tie on tag number.
    expect((await store.gameByCode(g.code))!.endgame).toMatchObject({ wanted: g.hafiz.playerId, bountyAt: iso(T0 + 40 * MIN) })
    expect((await store.events(g.gameId)).filter((e) => e.type === 'final-whistle').map((e) => e.data)).toEqual([{ cause: 'bounty' }])
  })

  it("endgame: the last call's ping event has lastCall and counts a cloaked runner as seen", async () => {
    const g = await begin(only('bomba'))
    await keepCheckingIn(g, 6, 48)
    now = T0 + 48.5 * MIN
    const cloak = await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'cloak', station: 1 })
    await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: cloak.id })
    await keepCheckingIn(g, 49, 49)
    await poll(g, T0 + 49 * MIN)
    const lastSeq = (await store.pings(g.gameId)).find((r) => r.reveal_at === iso(T0 + 49 * MIN))!.seq
    const pings = (await store.events(g.gameId)).filter((e) => e.type === 'ping')
    expect(pings.find((e) => e.data.seq === lastSeq)!.data).toMatchObject({ seen: 2, missed: 0, lastCall: true })
    expect(pings.find((e) => e.data.seq === lastSeq - 1)!.data.lastCall).toBeUndefined()
  })
})

describe('Hang Hebat: the wanted runner decides the game (Plan E3 task 5)', () => {
  const S = 1000
  const STASH = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng, accuracy_m: 8 }
  const TAGS = { aina: 7, hafiz: 3, ravi: 12 } as const
  type Who = keyof typeof TAGS
  type G = Awaited<ReturnType<typeof live>>
  const stamp = (ms: number) => new Date(ms).toISOString()

  /**
   * A chasing Full game with only Hang Hebat on, revealed at +7 min with Aina (#07) wanted. The reveal is forced on
   * the row, so no test has to keep everyone checking in for 33 minutes first. Runners: Aina, Hafiz (#03), Ravi
   * (#12). Ben chases; Siti is a marshal. `legendary` also drops Super Ring and Mak Kau Hijau.
   */
  async function live(settings: object = {}, legendary = false) {
    if (legendary) forcedDraws = [0.9, 0.9]
    const sides = legendary ? { legendarySides: { runner: 'on', chaser: 'on' } } : {}
    const g = await readyGame({ mode: 'full', endgames: { bomba: 'off', hebat: 'on', pkp: 'off' }, ...sides, ...settings })
    const ravi = await run('join', { code: g.code, name: 'Ravi', accepted: true })
    await run('subscribe', { code: g.code, token: ravi.token, subscription: { endpoint: 'https://push/Ravi' } })
    await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [ravi.playerId]: 'runner' } })
    await run('linkTag', { code: g.code, token: ravi.token, tagId: 12 })
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    if (legendary) {
      await legacyCard(g.code, 'ring', STASH)
      await legacyCard(g.code, 'hijau', STASH)
    }
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    expect(await store.claimEndgameReveal(gameId, stamp(now), g.aina.playerId)).toBe(true)
    pushes = []
    return { ...g, ravi, siti, gameId }
  }
  /** Ben scans a runner's tag at `ms`, standing 10 m from where the runner just reported. */
  async function catchAt(g: G, who: Who, ms: number) {
    now = ms
    await run('location', { code: g.code, token: g[who].token, ...at(10) })
    return run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(TAGS[who]), ...at(0) })
  }
  const gameRow = async (g: G) => (await store.gameByCode(g.code))!
  const row = async (g: G, id: string) => (await store.players(g.gameId)).find((p) => p.id === id)!
  const whistles = async (g: G) => (await store.events(g.gameId)).filter((e) => e.type === 'final-whistle').map((e) => e.data)
  const catchId = async (g: G, runnerId: string) => (await store.events(g.gameId)).filter((e) => e.type === 'caught' && e.target_id === runnerId).at(-1)!.id
  const poll = (g: G, ms: number) => {
    now = ms
    return run<View>('state', { code: g.code, organiserToken: g.organiserToken })
  }
  /** The bounty whistle blew at `whistleAt`: the game holds 60 s, then ends as a Kejar win. */
  async function kejarWin(g: G, whistleAt: number) {
    expect(await whistles(g)).toEqual([{ cause: 'bounty' }])
    expect((await gameRow(g)).endgame!.bountyAt).toBe(stamp(whistleAt))
    expect((await poll(g, whistleAt + 59 * S)).phase).toBe('chasing')
    const over = await poll(g, whistleAt + 61 * S)
    expect(over.phase).toBe('ended')
    expect(over.results?.winner).toBe('chasers')
    return over
  }
  /** No whistle and no bounty: the game goes on. */
  async function noBounty(g: G) {
    expect(await whistles(g)).toEqual([])
    expect((await gameRow(g)).final_whistle_at).toBeNull()
    expect((await gameRow(g)).endgame).toMatchObject({ wanted: g.aina.playerId, bountyAt: null })
  }

  it('hebat: a catch on a runner who is not wanted gives no whistle', async () => {
    const g = await live()
    expect(await catchAt(g, 'hafiz', T0 + 7.5 * MIN)).toMatchObject({ ok: true })
    await noBounty(g)
  })

  it('hebat: catching the wanted runner blows the bounty whistle, and 60 s later the Kejar win with two runners free', async () => {
    const g = await live()
    expect(await catchAt(g, 'aina', T0 + 8 * MIN)).toMatchObject({ ok: true })
    const over = await kejarWin(g, T0 + 8 * MIN)
    expect([...over.results!.survivors].sort()).toEqual([g.hafiz.playerId, g.ravi.playerId].sort())
  })

  it('hebat: auto-jail on two missed check-ins puts the wanted runner out: a Kejar win', async () => {
    const g = await live({ checkinMode: 'schedule' })
    for (const m of [10, 15]) {
      now = T0 + m * MIN - 20 * S
      await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
      await run('location', { code: g.code, token: g.ravi.token, ...at(10) })
    }
    await poll(g, T0 + 15 * MIN)
    expect((await row(g, g.aina.playerId)).jailed).toBe(true)
    expect((await row(g, g.hafiz.playerId)).jailed).toBe(false)
    await kejarWin(g, T0 + 15 * MIN)
  })

  it('hebat: undoing the wanted runner auto-jail during the hold takes the bounty back', async () => {
    const g = await live({ checkinMode: 'schedule' })
    for (const m of [10, 15]) {
      now = T0 + m * MIN - 20 * S
      await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
      await run('location', { code: g.code, token: g.ravi.token, ...at(10) })
    }
    await poll(g, T0 + 15 * MIN)
    const eventId = (await store.events(g.gameId)).find((e) => e.type === 'auto-jailed' && e.target_id === g.aina.playerId)!.id
    now = T0 + 15 * MIN + 10 * S
    expect(await run('undoAutoJail', { code: g.code, token: g.siti.token, eventId })).toEqual({ ok: true })
    expect((await gameRow(g)).final_whistle_at).toBeNull()
    expect((await gameRow(g)).endgame!.bountyAt).toBeNull()
    expect((await poll(g, T0 + 16 * MIN + 5 * S)).phase).toBe('chasing')
  })

  it('hebat: Mak Kau Hijau jailing the wanted runner is a Kejar win', async () => {
    const g = await live({}, true)
    const t = T0 + 7.5 * MIN
    now = t
    const hijau = (await gameRow(g)).hijau_stash!.code!
    expect(await run('claim', { code: g.code, token: g.ben.token, qr: hijauQr(hijau), ...STASH })).toEqual({ ok: true, kind: 'hijau' })
    now = t + 10 * S
    expect(await run('touchGreen', { code: g.code, token: g.hafiz.token })).toEqual({ ok: true })
    expect(await run('touchGreen', { code: g.code, token: g.ravi.token })).toEqual({ ok: true })
    await poll(g, t + 20 * S)
    expect((await row(g, g.aina.playerId)).jailed).toBe(true)
    await kejarWin(g, t + 20 * S)
  })

  it('hebat: a Luar Garisan disqualification of the wanted runner is a Kejar win', async () => {
    const g = await live()
    now = T0 + 7.5 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(240) })
    now = T0 + 8 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(250) })
    expect((await row(g, g.aina.playerId)).disqualified_at).toBe(stamp(T0 + 8 * MIN))
    await kejarWin(g, T0 + 8 * MIN)
  })

  it('hebat: a catch that puts the wanted runner under Super Ring house arrest is a Kejar win', async () => {
    const g = await live({}, true)
    now = T0 + 7.5 * MIN
    const ring = (await gameRow(g)).ring_stash!.code!
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: ringQr(ring), ...STASH })).toEqual({ ok: true, kind: 'ring' })
    expect(await catchAt(g, 'aina', T0 + 8 * MIN)).toEqual({ ok: false, reason: 'ring', name: 'Aina' })
    expect((await row(g, g.aina.playerId))).toMatchObject({ jailed: false, arrest: expect.objectContaining({ route: 'catch' }) })
    await kejarWin(g, T0 + 8 * MIN)
  })

  it('hebat: a rescue and the reel during the hold free runners, but the whistle stays and the Kejar still win', async () => {
    const g = await live()
    await catchAt(g, 'ravi', T0 + 7.5 * MIN)
    await catchAt(g, 'aina', T0 + 8 * MIN)
    // Ravi's reel lands on the free slot.
    now = T0 + 8 * MIN + 5 * S
    const pulled = await actions.pullReel(
      { store, now, rng: () => 0, push: async () => {}, fetchJson: async () => ({}) },
      { code: g.code, token: g.ravi.token, ...at(10) },
    )
    expect(pulled).toEqual({ ok: true, result: 'free' })
    // Hafiz frees the wanted runner from Penjara.
    now = T0 + 8 * MIN + 10 * S
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
    expect(await breakOut(g.code, g.hafiz.token)).toMatchObject({ ok: true })
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    expect((await row(g, g.ravi.playerId)).jailed).toBe(false)
    expect((await gameRow(g)).final_whistle_at).toBe(stamp(T0 + 8 * MIN))
    const over = await kejarWin(g, T0 + 8 * MIN)
    expect(over.results!.survivors).toContain(g.aina.playerId)
  })

  it('hebat: Undo kejar on the wanted runner during the hold calls off the whistle and the game goes on', async () => {
    const g = await live()
    await catchAt(g, 'aina', T0 + 8 * MIN)
    now = T0 + 8 * MIN + 30 * S
    expect(await run('undoKejar', { code: g.code, eventId: await catchId(g, g.aina.playerId), token: g.siti.token })).toEqual({ ok: true })
    expect((await gameRow(g)).final_whistle_at).toBeNull()
    expect((await gameRow(g)).endgame).toMatchObject({ wanted: g.aina.playerId, bountyAt: null })
    const v = await poll(g, T0 + 9 * MIN + 5 * S)
    expect(v.phase).toBe('chasing')
    expect((await gameRow(g)).ended_at).toBeNull()
  })

  it('hebat: undoing a later catch of the wanted runner keeps the bounty an earlier real catch claimed', async () => {
    const g = await live()
    await catchAt(g, 'aina', T0 + 8 * MIN)
    now = T0 + 8 * MIN + 5 * S
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
    expect(await breakOut(g.code, g.hafiz.token)).toMatchObject({ ok: true })
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    expect(await catchAt(g, 'aina', T0 + 8 * MIN + 20 * S)).toMatchObject({ ok: true })
    now = T0 + 8 * MIN + 30 * S
    expect(await run('undoKejar', { code: g.code, eventId: await catchId(g, g.aina.playerId), token: g.siti.token })).toEqual({ ok: true })
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    expect((await gameRow(g)).final_whistle_at).toBe(stamp(T0 + 8 * MIN))
    await kejarWin(g, T0 + 8 * MIN)
  })

  it('hebat: a Dato Seri Settle that frees the wanted runner during the hold leaves the whistle: a Kejar win', async () => {
    const g = await live()
    await store.addPowerUp({ game_id: g.gameId, player_id: g.hafiz.playerId, kind: 'dato', station: null })
    await catchAt(g, 'hafiz', T0 + 7.5 * MIN)
    await catchAt(g, 'aina', T0 + 8 * MIN)
    now = T0 + 8 * MIN + 10 * S
    const settled = await run('settle', { code: g.code, token: g.hafiz.token, qr: JAIL_QR, targetIds: [g.aina.playerId], ...at(10) })
    expect(settled).toEqual({ ok: true, freedIds: [g.hafiz.playerId, g.aina.playerId] })
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    expect((await gameRow(g)).final_whistle_at).toBe(stamp(T0 + 8 * MIN))
    await kejarWin(g, T0 + 8 * MIN)
  })

  it('hebat: time runs out with the wanted runner free and everyone else jailed: a Dikejar win', async () => {
    const g = await live()
    await catchAt(g, 'hafiz', T0 + 7.5 * MIN)
    await catchAt(g, 'ravi', T0 + 7.75 * MIN)
    await noBounty(g)
    for (let m = 8; m <= 49; m++) {
      now = T0 + m * MIN
      await run('location', { code: g.code, token: g.aina.token, ...at(20) })
    }
    expect((await row(g, g.aina.playerId)).jailed).toBe(false)
    const over = await poll(g, T0 + 50 * MIN)
    expect(over.phase).toBe('ended')
    expect(over.results?.winner).toBe('runners')
    expect(await whistles(g)).toEqual([])
  })

  it('hebat: a Durian blocks the catch on the wanted runner: no bounty', async () => {
    const g = await live()
    const shield = await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'shield', station: 1 })
    expect(await run('usePowerup', { code: g.code, token: g.aina.token, powerupId: shield.id })).toEqual({ ok: true, kind: 'shield' })
    expect(await catchAt(g, 'aina', T0 + 9 * MIN)).toEqual({ ok: false, reason: 'shielded', name: 'Aina' })
    await noBounty(g)
  })

  it('hebat: removing the wanted runner passes the bounty to the next longest-free runner', async () => {
    const g = await live()
    // Hafiz (#03) is caught and freed, so Ravi (#12), never caught, has the longer free stretch.
    await catchAt(g, 'hafiz', T0 + 7.5 * MIN)
    await run('location', { code: g.code, token: g.ravi.token, ...at(10) })
    expect(await breakOut(g.code, g.ravi.token)).toMatchObject({ ok: true })
    pushes = []
    now = T0 + 8 * MIN
    expect(await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.aina.playerId })).toEqual({ ok: true })
    expect((await gameRow(g)).endgame).toMatchObject({ wanted: g.ravi.playerId, bountyAt: null })
    const passed = (await store.events(g.gameId)).filter((e) => e.type === 'wanted')
    expect(passed).toEqual([expect.objectContaining({ target_id: g.ravi.playerId, data: { who: 'Ravi #12' } })])
    const bodies = pushes.map((p) => (p.payload as { body?: string }).body)
    expect(bodies.filter((b) => b === 'Hang Hebat: #12 Ravi is now wanted.')).toHaveLength(3)
    expect(await whistles(g)).toEqual([])
    // Ravi is the bounty now.
    await catchAt(g, 'ravi', T0 + 8.5 * MIN)
    expect(await whistles(g)).toEqual([{ cause: 'bounty' }])
  })

  it('hebat: a check racing the removal of the wanted runner never claims the bounty for them', async () => {
    const g = await live()
    // Aina's phone already reads as jailed (a catch whose own check hasn't run), then a marshal removes her.
    await store.updatePlayers([{ id: g.aina.playerId, patch: { jailed: true, caught_at: stamp(T0 + 8 * MIN) } }])
    // In the window between the removal and the bounty passing on, a catch of Ravi runs its own check.
    const setWanted = store.setWanted.bind(store)
    store.setWanted = async (gameId, playerId) => {
      store.setWanted = setWanted
      expect(await catchAt(g, 'ravi', T0 + 8 * MIN)).toMatchObject({ ok: true })
      return setWanted(gameId, playerId)
    }
    now = T0 + 8 * MIN
    expect(await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.aina.playerId })).toEqual({ ok: true })
    // Hafiz (#03) wins the tie with Ravi on tag number.
    expect((await gameRow(g)).endgame).toMatchObject({ wanted: g.hafiz.playerId, bountyAt: null })
    expect(await whistles(g)).toEqual([])
  })

  it('hebat: removing the wanted runner with nobody else free puts the normal rules back', async () => {
    const g = await live()
    await catchAt(g, 'hafiz', T0 + 7.5 * MIN)
    await catchAt(g, 'ravi', T0 + 7.75 * MIN)
    now = T0 + 8 * MIN
    await run('removePlayer', { code: g.code, organiserToken: g.organiserToken, playerId: g.aina.playerId })
    expect((await gameRow(g)).endgame).toMatchObject({ wanted: null, bountyAt: null })
    expect(await whistles(g)).toEqual([{ cause: 'removed' }])
  })
})

describe('PKP closes Penjara and doubles stations (Plan E3 task 6)', () => {
  const S = 1000
  const S1 = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng, accuracy_m: 8 }
  const closed = { ok: false, reason: 'penjara-closed' }
  type G = Awaited<ReturnType<typeof pkpGame>>
  const iso = (ms: number) => new Date(ms).toISOString()

  /** A chasing Full game with only PKP on. Ben chases; Aina and Hafiz run. Nothing is revealed yet. */
  async function pkpGame() {
    const g = await readyGame({ mode: 'full', endgames: { bomba: 'off', hebat: 'off', pkp: 'on' } }, { stations: [S1] })
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    return { ...g, siti, gameId }
  }
  const poll = (g: G, ms: number) => {
    now = ms
    return run<View>('state', { code: g.code, organiserToken: g.organiserToken })
  }
  /** Moves to 5:00 left and polls: PKP is revealed. */
  async function reveal(g: G) {
    await poll(g, T0 + 45 * MIN)
    expect((await store.gameByCode(g.code))!.endgame!.revealedAt).toBeTruthy()
  }
  const jailHafiz = (g: G) => store.updatePlayers([{ id: g.hafiz.playerId, patch: { jailed: true, caught_at: iso(now), caught_by: g.ben.playerId } }])
  const events = async (g: G, type: string) => (await store.events(g.gameId)).filter((e) => e.type === type)
  const hafizRow = async (g: G) => (await store.players(g.gameId)).find((p) => p.id === g.hafiz.playerId)!
  /** Moves the runners' deck to the next card that passes `want`, so a claim draws it. */
  async function forceDraw(g: G, want: (k: PowerUpKind) => boolean) {
    const row = (await store.gameByCode(g.code))!
    const deck = deckFor('full', 'runner', row.runner_sets!)
    let i = row.runner_draws ?? 0
    while (!want(cardAt(`${row.deck_seed}:runner`, deck, i))) i++
    await store.updateGame(row.id, { runner_draws: i })
    return cardAt(`${row.deck_seed}:runner`, deck, i)
  }
  const doublable = (k: PowerUpKind) => !['grab', 'combo', 'dato'].includes(k)
  const claimS1 = (g: G) => run('claim', { code: g.code, token: g.aina.token, qr: stationQr(1), ...S1 })
  const ownCards = async (g: G, kind: PowerUpKind) =>
    (await store.powerUps(g.gameId)).filter((u) => u.player_id === g.aina.playerId && u.kind === kind)
  const comboReady = async (g: G) => (await run<View>('state', { code: g.code, token: g.aina.token })).comboReady

  it('pkp: a free runner scanning Penjara after the reveal is refused and starts nothing', async () => {
    const g = await pkpGame()
    await jailHafiz(g)
    await reveal(g)
    now = T0 + 46 * MIN
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toEqual(closed)
    expect(await events(g, 'rescue-started')).toHaveLength(0)
    expect((await store.gameByCode(g.code))!.rescue ?? null).toBeNull()
  })

  it('pkp: before the reveal a Penjara scan starts a rescue as usual', async () => {
    const g = await pkpGame()
    await jailHafiz(g)
    now = T0 + 44 * MIN
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true, rescue: 'started' })
  })

  it('pkp: a rescue started at 5:05 left fails at the 5:00 reveal and frees nobody', async () => {
    const g = await pkpGame()
    await jailHafiz(g)
    now = T0 + 45 * MIN - 5 * S
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true, rescue: 'started' })
    now = T0 + 45 * MIN + 6 * S
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    await poll(g, T0 + 45 * MIN + 7 * S)
    expect((await store.gameByCode(g.code))!.endgame!.revealedAt).toBeTruthy()
    expect((await hafizRow(g)).jailed).toBe(true)
    expect(await events(g, 'jailbreak')).toHaveLength(0)
    expect(await events(g, 'rescue-failed')).toHaveLength(1)
  })

  it('pkp: a rescue whose hold ends before the reveal still frees', async () => {
    const g = await pkpGame()
    await jailHafiz(g)
    now = T0 + 44 * MIN
    await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })
    now = T0 + 44 * MIN + 11 * S
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    await poll(g, T0 + 45 * MIN + S)
    expect((await hafizRow(g)).jailed).toBe(false)
    expect(await events(g, 'rescue-failed')).toHaveLength(0)
  })

  it.each(['bomba', 'hebat'] as const)('pkp: a rescue in a %s game still frees across the 10:00 mark', async (kind) => {
    const g = await readyGame({ mode: 'full', endgames: { bomba: kind === 'bomba' ? 'on' : 'off', hebat: kind === 'hebat' ? 'on' : 'off', pkp: 'off' } })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const gameId = (await store.gameByCode(g.code))!.id
    await store.updatePlayers([{ id: g.hafiz.playerId, patch: { jailed: true, caught_at: iso(now), caught_by: g.ben.playerId } }])
    now = T0 + 40 * MIN - 5 * S
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR, ...at(10) })).toMatchObject({ ok: true, rescue: 'started' })
    now = T0 + 40 * MIN + 6 * S
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    now = T0 + 40 * MIN + 7 * S
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const evs = await store.events(gameId)
    expect(evs.filter((e) => e.type === 'rescue-failed')).toHaveLength(0)
    expect((await store.players(gameId)).find((p) => p.id === g.hafiz.playerId)!.jailed).toBe(false)
  })

  it("pkp: a jailed runner's pull is refused and not spent", async () => {
    const g = await pkpGame()
    await jailHafiz(g)
    await reveal(g)
    now = T0 + 46 * MIN
    expect(await run('pullReel', { code: g.code, token: g.hafiz.token, ...at(10) })).toEqual(closed)
    expect((await hafizRow(g)).reel_pulled_at ?? null).toBeNull()
  })

  it('pkp: Settle is refused and Dato Seri stays unused', async () => {
    const g = await pkpGame()
    const dato = await store.addPowerUp({ game_id: g.gameId, player_id: g.hafiz.playerId, kind: 'dato', station: null })
    await jailHafiz(g)
    await reveal(g)
    now = T0 + 46 * MIN
    expect(await run('settle', { code: g.code, token: g.hafiz.token, qr: JAIL_QR, targetIds: [], ...at(10) })).toEqual(closed)
    expect((await store.powerUps(g.gameId)).find((u) => u.id === dato.id)!.used_at).toBeNull()
    expect((await hafizRow(g)).jailed).toBe(true)
  })

  it("pkp: a marshal's Undo kejar still frees the runner", async () => {
    const g = await pkpGame()
    now = T0 + 44 * MIN
    await run('location', { code: g.code, token: g.hafiz.token, ...at(10) })
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3), ...at(0) })).toMatchObject({ ok: true })
    const caught = (await events(g, 'caught'))[0]!
    await reveal(g)
    now = T0 + 46 * MIN
    expect(await run('undoKejar', { code: g.code, eventId: caught.id, token: g.siti.token })).toEqual({ ok: true })
    expect((await hafizRow(g)).jailed).toBe(false)
  })

  it('pkp: a station claim after the reveal gives the card and its twin', async () => {
    const g = await pkpGame()
    await reveal(g)
    now = T0 + 46 * MIN
    const kind = await forceDraw(g, doublable)
    expect(await claimS1(g)).toEqual({ ok: true, kind, double: true })
    expect(await ownCards(g, kind)).toHaveLength(2)
  })

  it('pkp: a combo-ready player gets exactly two goes and stays combo ready', async () => {
    const g = await pkpGame()
    const combo = await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'combo', station: null })
    await store.updatePowerUp(combo.id, { used_at: iso(now) })
    await reveal(g)
    now = T0 + 46 * MIN
    const kind = await forceDraw(g, doublable)
    expect(await comboReady(g)).toBe(true)
    expect(await claimS1(g)).toEqual({ ok: true, kind, double: true })
    expect(await ownCards(g, kind)).toHaveLength(2)
    expect(await comboReady(g)).toBe(true)
  })

  it('pkp: a card the doubling cannot apply to arrives as normal', async () => {
    const g = await pkpGame()
    await reveal(g)
    now = T0 + 46 * MIN
    const kind = await forceDraw(g, (k) => k === 'grab')
    expect(await claimS1(g)).toEqual({ ok: true, kind })
    expect(await ownCards(g, kind)).toHaveLength(1)
  })

  it('pkp: before the reveal a claim is not doubled', async () => {
    const g = await pkpGame()
    now = T0 + 44 * MIN
    const kind = await forceDraw(g, doublable)
    expect(await claimS1(g)).toEqual({ ok: true, kind })
    expect(await ownCards(g, kind)).toHaveLength(1)
  })
})

describe('Tupperware slip sheets and dropping a box', () => {
  const SPOT = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const BOTH = { mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } }
  const gameOf = async (code: string) => (await store.gameByCode(code))!

  it('makeSlipSheet adds 20 slips for the organisation; listSlips sorts them and another organisation sees none', async () => {
    const organiserToken = await createOrganiser()
    expect(await run('makeSlipSheet', { organiserToken })).toEqual({ ok: true })
    const slips = await run<{ side: string; number: number; token: string; state: string }[]>('listSlips', { organiserToken })
    expect(slips).toHaveLength(20)
    expect(slips[0]).toMatchObject({ side: 'dikejar', number: 1, state: 'unused' })
    expect(slips[9]).toMatchObject({ side: 'dikejar', number: 10 })
    expect(slips[10]).toMatchObject({ side: 'kejar', number: 1 })
    expect(slips.every((s) => s.token.length > 0)).toBe(true)
    await run('makeSlipSheet', { organiserToken })
    expect((await run<{ number: number }[]>('listSlips', { organiserToken })).map((s) => s.number)[10]).toBe(11)
    const other = await createOrganiser()
    expect(await run('listSlips', { organiserToken: other })).toEqual([])
    await rejects(run('makeSlipSheet', {}), 403)
    await rejects(run('listSlips', {}), 403)
  })

  it("dropTupperware saves the box's spot into the picked legendary's stash, with no code or card", async () => {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame(BOTH)
    const chosen = (await gameOf(g.code)).settings.legendaries
    expect(chosen.ring).toBe('stash')
    expect(chosen.hijau).toBe('stash')
    expect(await run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'dikejar', ...SPOT })).toEqual({ ok: true })
    expect((await gameOf(g.code)).ring_stash).toEqual({ ...SPOT, claimedBy: null, claimedAt: null })
    await run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'kejar', ...SPOT })
    expect((await gameOf(g.code)).hijau_stash).toEqual({ ...SPOT, claimedBy: null, claimedAt: null })
  })

  it('dropTupperware refuses a side that is off, Core, a started game, outside the area and non-organisers', async () => {
    forcedDraws = [0.9]
    const g = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'off' } })
    await rejects(run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'kejar', ...SPOT }), 409, 'That side has no legendary this game.')
    await rejects(run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'nope', ...SPOT }), 400)
    await rejects(run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'dikejar', lat: CENTER.lat + 0.1, lng: CENTER.lng }), 400, 'inside the play area')
    await rejects(run('dropTupperware', { code: g.code, token: g.aina.token, side: 'dikejar', ...SPOT }), 403)
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    await rejects(run('dropTupperware', { code: g.code, token: siti.token, side: 'dikejar', ...SPOT }), 403)
    const core = await readyGame({ mode: 'core' })
    await rejects(run('dropTupperware', { code: core.code, organiserToken: core.organiserToken, side: 'dikejar', ...SPOT }), 409, 'Full mode')
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'dikejar', ...SPOT }), 409)
  })
})

describe("slip claims: scanning the slip in your side's Tupperware (Tupperware task 4)", () => {
  const BOX = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const atBox = { lat: BOX.lat, lng: BOX.lng, accuracy_m: 8 }
  const far = { lat: CENTER.lat, lng: CENTER.lng, accuracy_m: 8 }
  type SlipRow = { side: 'dikejar' | 'kejar'; number: number; token: string }
  const stamp = (t: number) => new Date(t).toISOString()

  /** A chasing Full game with Super Ring and Mak Kau Hijau in dropped boxes, and a fresh slip sheet. Runners: Aina, Chong. Chasers: Ben, Hafiz. */
  async function chasing() {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } })
    const chong = await run('join', { code: g.code, name: 'Chong', accepted: true })
    await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [g.hafiz.playerId]: 'chaser', [chong.playerId]: 'runner' } })
    await run('linkTag', { code: g.code, token: chong.token, tagId: 5 })
    await run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'dikejar', ...BOX })
    await run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'kejar', ...BOX })
    await run('makeSlipSheet', { organiserToken: g.organiserToken })
    const slips = await run<SlipRow[]>('listSlips', { organiserToken: g.organiserToken })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    await run('state', { code: g.code, organiserToken: g.organiserToken })
    const dikejar = slips.filter((s) => s.side === 'dikejar').map((s) => s.token)
    const kejar = slips.filter((s) => s.side === 'kejar').map((s) => s.token)
    return { ...g, chong, dikejar, kejar, gameId: (await store.gameByCode(g.code))!.id }
  }
  const game = async (g: { code: string }) => (await store.gameByCode(g.code))!
  const scan = (g: { code: string }, token: string, slipToken: string, where: object = atBox) =>
    run('claim', { code: g.code, token, qr: slipQr(slipToken), ...where })
  const slip = async (token: string) => (await store.slipByToken(token))!
  const slipMisses = async (g: { gameId: string }) => (await store.events(g.gameId)).filter((e) => e.type === 'slip-miss')

  it('a runner at the box with an unused Dikejar slip claims Super Ring: an unused ring in hand, the slip used, the box claimed', async () => {
    const g = await chasing()
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: true, kind: 'ring', slip: true })
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'ring')).toEqual([expect.objectContaining({ player_id: g.aina.playerId, used_at: null })])
    expect(await slip(g.dikejar[0])).toMatchObject({ used_by: g.aina.playerId, used_at: stamp(now), bound_game_id: g.gameId })
    expect((await game(g)).ring_stash!.claimedBy).toBe(g.aina.playerId)
  })

  it('a chaser with a Kejar slip claims Mak Kau Hijau and its run starts', async () => {
    const g = await chasing()
    expect(await scan(g, g.ben.token, g.kejar[0])).toEqual({ ok: true, kind: 'hijau', slip: true })
    const after = await game(g)
    expect(after.hijau_stash!.claimedBy).toBe(g.ben.playerId)
    expect(after.hijau).toMatchObject({ claimedBy: g.ben.playerId, startsAt: stamp(now), deadline: stamp(now + 20_000), sentAt: stamp(now) })
    expect(await slip(g.kejar[0])).toMatchObject({ used_by: g.ben.playerId })
  })

  it("the other side's slip is Not your Tupperware: it binds the slip, uses no try, and a right slip still claims", async () => {
    const g = await chasing()
    expect(await scan(g, g.aina.token, g.kejar[0])).toEqual({ ok: false, reason: 'not-yours' })
    expect(await slip(g.kejar[0])).toMatchObject({ bound_game_id: g.gameId, used_at: null })
    expect(await slipMisses(g)).toHaveLength(0)
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: true, kind: 'ring', slip: true })
  })

  it('an unknown token uses the try: the next scan is no-try, and the good slip is neither bound nor used (Review Focus 3)', async () => {
    const g = await chasing()
    expect(await scan(g, g.aina.token, 'not-a-real-token')).toEqual({ ok: false, reason: 'wrong' })
    expect(await slipMisses(g)).toEqual([expect.objectContaining({ actor_id: g.aina.playerId, target_id: null, data: {} })])
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: false, reason: 'no-try' })
    expect(await slip(g.dikejar[0])).toMatchObject({ bound_game_id: null, used_at: null, used_by: null })
    expect((await game(g)).ring_stash!.claimedBy).toBeNull()
    // No second miss is recorded, and another runner still claims with the same slip.
    expect(await slipMisses(g)).toHaveLength(1)
    expect(await scan(g, g.chong.token, g.dikejar[0])).toEqual({ ok: true, kind: 'ring', slip: true })
  })

  it('a bare slip QR is a wrong slip', async () => {
    const g = await chasing()
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: 'KEJAR:SLIP', ...atBox })).toEqual({ ok: false, reason: 'wrong' })
    expect(await slipMisses(g)).toHaveLength(1)
  })

  it('too far: the slip is bound to this game but not used, and the try is kept', async () => {
    const g = await chasing()
    expect(await scan(g, g.aina.token, g.dikejar[0], far)).toEqual({ ok: false, reason: 'too-far' })
    expect(await slip(g.dikejar[0])).toMatchObject({ bound_game_id: g.gameId, used_at: null })
    expect(await slipMisses(g)).toHaveLength(0)
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: true, kind: 'ring', slip: true })
  })

  it('a slip bound to another game is dead here (Review Focus 2)', async () => {
    const g = await chasing()
    // Game A, by the same organiser: the slip was scanned there and never claimed.
    const { code: codeA } = await run('create', { arenaId: 'around-me', center: CENTER, settings: { mode: 'full' }, organiserToken: g.organiserToken })
    const gameA = (await store.gameByCode(codeA))!
    expect(await store.bindSlip((await slip(g.dikejar[0])).id, gameA.id, stamp(now))).toBe(gameA.id)
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: false, reason: 'wrong' })
    expect(await slip(g.dikejar[0])).toMatchObject({ bound_game_id: gameA.id, used_at: null })
    expect((await game(g)).ring_stash!.claimedBy).toBeNull()
  })

  it('two runners, two good slips: the first claims, the second is taken and its slip is bound but not used (Review Focus 1)', async () => {
    const g = await chasing()
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: true, kind: 'ring', slip: true })
    expect(await scan(g, g.chong.token, g.dikejar[1])).toEqual({ ok: false, reason: 'taken' })
    expect(await slip(g.dikejar[1])).toMatchObject({ bound_game_id: g.gameId, used_at: null, used_by: null })
    expect(await slipMisses(g)).toHaveLength(0)
  })

  it('two runners at the same moment: exactly one gets the box, the other is taken, one slip is used', async () => {
    const g = await chasing()
    const answers = await Promise.all([scan(g, g.aina.token, g.dikejar[0]), scan(g, g.chong.token, g.dikejar[1])])
    expect(answers.filter((a: { ok: boolean }) => a.ok)).toHaveLength(1)
    expect(answers.filter((a: { reason?: string }) => a.reason === 'taken')).toHaveLength(1)
    expect((await store.powerUps(g.gameId)).filter((u) => u.kind === 'ring')).toHaveLength(1)
    const both = await Promise.all([slip(g.dikejar[0]), slip(g.dikejar[1])])
    expect(both.filter((s) => s.used_at !== null)).toHaveLength(1)
  })

  it('the legendary checks still apply: a full hand, a jailed runner, a frozen chaser; none uses the try or the slip', async () => {
    const g = await chasing()
    const cloak = await store.addPowerUp({ game_id: g.gameId, player_id: g.aina.playerId, kind: 'cloak', station: 1 })
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: false, reason: 'hand-full' })
    await store.updatePowerUp(cloak.id, { taken_at: stamp(now) })
    await store.updatePlayers([
      { id: g.chong.playerId, patch: { jailed: true } },
      { id: g.ben.playerId, patch: { frozen_until: stamp(now + 60_000) } },
    ])
    expect(await scan(g, g.chong.token, g.dikejar[0])).toEqual({ ok: false, reason: 'cannot-claim' })
    expect(await scan(g, g.ben.token, g.kejar[0])).toMatchObject({ ok: false, reason: 'frozen' })
    expect(await slipMisses(g)).toHaveLength(0)
    expect(await slip(g.dikejar[0])).toMatchObject({ used_at: null })
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: true, kind: 'ring', slip: true })
  })

  it("a paused game answers paused; another organisation's slip is wrong; a Core game has no box", async () => {
    const g = await chasing()
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: false, reason: 'paused' })
    expect(await slip(g.dikejar[0])).toMatchObject({ bound_game_id: null })
    await run('resume', { code: g.code, organiserToken: g.organiserToken })

    const other = await createOrganiser()
    await run('makeSlipSheet', { organiserToken: other })
    const foreign = (await run<SlipRow[]>('listSlips', { organiserToken: other }))[0].token
    expect(await scan(g, g.aina.token, foreign)).toEqual({ ok: false, reason: 'wrong' })
    expect(await slip(foreign)).toMatchObject({ bound_game_id: null })

    const core = await readyGame({ mode: 'core' })
    await run('makeSlipSheet', { organiserToken: core.organiserToken })
    const coreSlip = (await run<SlipRow[]>('listSlips', { organiserToken: core.organiserToken }))[0].token
    await run('start', { code: core.code, organiserToken: core.organiserToken })
    now += 7 * MIN
    await run('state', { code: core.code, organiserToken: core.organiserToken })
    expect(await scan(core, core.aina.token, coreSlip)).toEqual({ ok: false, reason: 'no-box' })
  })

  it('the feed says something legendary was found, and never names the finder, the card or a slip miss', async () => {
    const g = await chasing()
    const tokens = [g.aina.token, g.chong.token, g.ben.token]
    const viewsNow = async () => [
      await run<View>('state', { code: g.code, organiserToken: g.organiserToken }),
      ...(await Promise.all(tokens.map((token) => run<View>('state', { code: g.code, token })))),
    ]
    const before = (await viewsNow()).map((v) => v.feed.map((f) => JSON.stringify(f)))
    await scan(g, g.chong.token, 'nope')
    expect(await scan(g, g.aina.token, g.dikejar[0])).toEqual({ ok: true, kind: 'ring', slip: true })
    const views = await viewsNow()
    const missIds = (await slipMisses(g)).map((e) => e.id)
    expect(missIds).toHaveLength(1)
    views.forEach((v, i) => {
      // The miss added nothing; the claim added exactly one line, naming nobody and no card.
      const added = v.feed.map((f) => JSON.stringify(f)).filter((t) => !before[i].includes(t))
      expect(added).toHaveLength(1)
      expect(added[0]).toContain('Something legendary was found.')
      expect(added[0]).not.toContain('Aina')
      expect(added[0]).not.toContain('Ring')
      expect(JSON.stringify(v)).not.toContain('slip-miss')
      for (const id of missIds) expect(v.alerts.map((a) => a.id)).not.toContain(id)
    })
  })
})

describe("side quest: a ping near your side's Tupperware wakes it (Tupperware task 5)", () => {
  const BOX = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const FAR_BOX = { lat: CENTER.lat - 100 / 111_195, lng: CENTER.lng }
  const nearBox = (dM: number) => ({ lat: BOX.lat - dM / 111_195, lng: BOX.lng, accuracy_m: 8 })
  const WINDOW = T0 + 9 * MIN + 10_000 // the scheduled ping 1 reveals at +10; its window opens 60 s before
  const notices = () => pushes.filter((p) => (p.payload as { type: string }).type === 'notice')

  /** A chasing Full game with both boxes dropped (at `spots`), `now` inside ping 1's window. */
  async function dropped(spots = { dikejar: BOX, kejar: FAR_BOX }) {
    forcedDraws = [0.9, 0.9]
    const g = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } })
    await run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'dikejar', ...spots.dikejar })
    await run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'kejar', ...spots.kejar })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = WINDOW
    return g
  }
  const fix = (g: { code: string }, token: string, where: object) => run('location', { code: g.code, token, ...where })
  const sideQuestAt = async (g: { code: string }, playerId: string) =>
    (await store.players((await store.gameByCode(g.code))!.id)).find((p) => p.id === playerId)!.side_quest_at ?? null

  it('a runner 30 m from the Dikejar box inside a window wakes it: side_quest_at set, one Side quest push, no second', async () => {
    const g = await dropped()
    await fix(g, g.aina.token, nearBox(30))
    expect(await sideQuestAt(g, g.aina.playerId)).toBe(new Date(now).toISOString())
    expect(notices().map((n) => [n.endpoint, n.payload])).toEqual([
      ['https://push/Aina', { type: 'notice', code: g.code, title: 'Side quest', body: "Something's nearby…" }],
    ])
    now += 5_000
    await fix(g, g.aina.token, nearBox(20))
    expect(notices()).toHaveLength(1)
  })

  it('nothing outside a window, or 80 m away', async () => {
    const g = await dropped()
    now = T0 + 8 * MIN
    await fix(g, g.aina.token, nearBox(30))
    expect(await sideQuestAt(g, g.aina.playerId)).toBeNull()
    now = WINDOW
    await fix(g, g.aina.token, nearBox(80))
    expect(await sideQuestAt(g, g.aina.playerId)).toBeNull()
    expect(notices()).toHaveLength(0)
  })

  it('a chaser wakes it only near the Kejar box; the Dikejar box is not theirs', async () => {
    const g = await dropped()
    await fix(g, g.ben.token, nearBox(30))
    expect(await sideQuestAt(g, g.ben.playerId)).toBeNull()
    now = T0
    const k = await dropped({ dikejar: FAR_BOX, kejar: BOX })
    await fix(k, k.ben.token, nearBox(30))
    expect(await sideQuestAt(k, k.ben.playerId)).toBe(new Date(now).toISOString())
    await fix(k, k.aina.token, nearBox(30))
    expect(await sideQuestAt(k, k.aina.playerId)).toBeNull()
  })

  it('nothing for a jailed or disqualified runner', async () => {
    const g = await dropped()
    await store.updatePlayers([
      { id: g.aina.playerId, patch: { jailed: true } },
      { id: g.hafiz.playerId, patch: { disqualified_at: new Date(now).toISOString() } },
    ])
    await fix(g, g.aina.token, nearBox(30))
    await fix(g, g.hafiz.token, nearBox(30))
    expect(await sideQuestAt(g, g.aina.playerId)).toBeNull()
    expect(await sideQuestAt(g, g.hafiz.playerId)).toBeNull()
    expect(notices()).toHaveLength(0)
  })

  it('nothing while paused', async () => {
    const g = await dropped()
    await run('pause', { code: g.code, organiserToken: g.organiserToken })
    await fix(g, g.aina.token, nearBox(30))
    expect(await sideQuestAt(g, g.aina.playerId)).toBeNull()
  })

  it('nothing when the box is claimed, or was never dropped', async () => {
    const g = await dropped()
    const row = (await store.gameByCode(g.code))!
    const key = row.ring_stash ? 'ring_stash' : 'dato_stash'
    await store.updateGame(row.id, { [key]: { ...(row as any)[key], claimedBy: g.hafiz.playerId } } as never)
    await fix(g, g.aina.token, nearBox(30))
    expect(await sideQuestAt(g, g.aina.playerId)).toBeNull()

    forcedDraws = [0.9, 0.9]
    const h = await readyGame({ mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } })
    await run('start', { code: h.code, organiserToken: h.organiserToken })
    await fix(h, h.aina.token, nearBox(30))
    expect(await sideQuestAt(h, h.aina.playerId)).toBeNull()
  })
})

describe('the secret colour cards are retired (Tupperware task 11)', () => {
  const SPOT = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const STASHES = ['dato_stash', 'ring_stash', 'bomoh_stash', 'hijau_stash'] as const

  it('create Full with both sides on hands out no card: no stash on any legendary, and no notice', async () => {
    const organiserToken = await createOrganiser()
    const res = await run('create', { arenaId: 'around-me', center: CENTER, settings: { mode: 'full', legendarySides: { runner: 'on', chaser: 'on' } }, organiserToken })
    expect(res).toEqual({ code: expect.any(String) })
    const game = (await store.gameByCode(res.code))!
    for (const field of STASHES) expect(game[field] ?? null).toBeNull()
  })

  it('switching a lobby to Full hands out no card and says nothing', async () => {
    const g = await readyGame()
    expect(await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'full' })).toEqual({ ok: true })
    const game = (await store.gameByCode(g.code))!
    for (const field of STASHES) expect(game[field] ?? null).toBeNull()
  })

  it('a legacy started game whose stash holds a card code still claims by KEJAR:DATO:<code>', async () => {
    const g = await readyGame({ mode: 'full' })
    await legacyCard(g.code, 'dato', SPOT)
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 7 * MIN
    const code = (await store.gameByCode(g.code))!.dato_stash!.code!
    expect(await run('claim', { code: g.code, token: g.aina.token, qr: `KEJAR:DATO:${code}`, lat: SPOT.lat, lng: SPOT.lng, accuracy_m: 8 })).toEqual({ ok: true, kind: 'dato' })
  })
})

describe('lifting a box when the mode changes, and the Tupperware on the kit (Tupperware task 11)', () => {
  const DROP = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
  const gameOf = async (code: string) => (await store.gameByCode(code))!
  const hosted = (g: { code: string; organiserToken: string }) => run<View>('state', { code: g.code, organiserToken: g.organiserToken })

  it('Full, drop, Core, Full: the box is lifted, placed.tupper-dikejar is gone and the walk shows the Tupperware step again', async () => {
    const g = await readyGame({ mode: 'full' })
    await run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'dikejar', ...DROP })
    await run('setKit', { code: g.code, organiserToken: g.organiserToken, placed: { id: 'tupper-dikejar', on: true } })
    expect((await hosted(g)).kit!.placed['tupper-dikejar']).toBe(true)
    await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'core' })
    const core = await gameOf(g.code)
    expect(core.dato_stash ?? null).toBeNull()
    expect(core.kit?.placed ?? {}).not.toHaveProperty('tupper-dikejar')
    await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'full' })
    const full = await gameOf(g.code)
    for (const field of ['dato_stash', 'ring_stash'] as const) expect(full[field] ?? null).toBeNull()
    const v = await hosted(g)
    expect(v.kit!.places.map((p) => p.id)).toContain('tupper-dikejar')
    expect(v.kit!.placed['tupper-dikejar']).toBeUndefined()
  })

  it('the walk counts the Tupperware step done only when the box is dropped, never from placed.tupper-dikejar alone', async () => {
    const g = await readyGame({ mode: 'full' })
    await run('setKit', { code: g.code, organiserToken: g.organiserToken, placed: { id: 'tupper-dikejar', on: true } })
    expect((await gameOf(g.code)).kit!.placed['tupper-dikejar']).toBe(true)
    expect((await hosted(g)).kit!.placed['tupper-dikejar']).toBeUndefined()
    await run('dropTupperware', { code: g.code, organiserToken: g.organiserToken, side: 'dikejar', ...DROP })
    expect((await hosted(g)).kit!.placed['tupper-dikejar']).toBe(true)
  })

  it('the organiser view has the Tupperware on the packing list and the walk; a marshal and a runner do not', async () => {
    const g = await readyGame({ mode: 'full' })
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    const host = await hosted(g)
    expect(host).not.toHaveProperty('datoCard')
    expect(host.kit!.items.find((i) => i.id === 'tupperware')!.label).toMatch(/red Tupperware/)
    expect(host.kit!.places.map((p) => p.id)).toContain('tupper-dikejar')
    for (const token of [siti.token, g.aina.token, g.ben.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(v).not.toHaveProperty('datoCard')
      expect(v.kit?.items.map((i) => i.id) ?? []).not.toContain('tupperware')
    }
  })

  it('the organiser can tick the Tupperware line under its label', async () => {
    const g = await readyGame({ mode: 'full' })
    await run('setKit', { code: g.code, organiserToken: g.organiserToken, tick: { id: 'tupperware', on: true } })
    expect((await gameOf(g.code)).kit!.ticks).toEqual({ tupperware: expect.stringMatching(/red Tupperware/) })
  })

  it('two phones ticking at once both keep their tick (atomic setKit)', async () => {
    const g = await readyGame()
    await Promise.all([
      run('setKit', { code: g.code, organiserToken: g.organiserToken, tick: { id: 'tape', on: true } }),
      run('setKit', { code: g.code, organiserToken: g.organiserToken, tick: { id: 'penjara', on: true } }),
      run('setKit', { code: g.code, organiserToken: g.organiserToken, placed: { id: 'penjara', on: true } }),
    ])
    const kit = (await gameOf(g.code)).kit!
    expect(Object.keys(kit.ticks).sort()).toEqual(['penjara', 'tape'])
    expect(kit.placed).toEqual({ penjara: true })
  })
})
