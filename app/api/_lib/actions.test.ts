// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { MIN, T0 } from '../../shared/fixtures.js'
import { BONUS_SEQ_BASE } from '../../shared/clock.js'
import { cardAt, deckFor } from '../../shared/deck.js'
import { distanceM } from '../../shared/geo.js'
import { bomohQr, datoQr, JAIL_QR, stationQr, tagQr } from '../../shared/ids.js'
import { seeded } from '../../shared/testing.js'
import type { PowerUpKind, Role } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { ActionError, actions, MAX_PLAYERS_PER_GAME, STASH_MISS_LIMIT, type ActionName } from './actions.js'
import { hashToken } from './secrets.js'
import { MemoryStore } from './store.js'

const CENTER = { lat: 3.0, lng: 101.0 }
let now: number
let store: MemoryStore
let pushes: { endpoint: string; payload: unknown }[]
let pushFails = false
/** Replies the fake OpenStreetMap services give, in order; an Error is thrown instead. */
let osmReplies: unknown[]
let osmCalls: string[]

const run = <T = any>(action: ActionName, body: object) =>
  actions[action](
    {
      store,
      now,
      rng: seeded(7),
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

beforeEach(() => {
  now = T0
  store = new MemoryStore(() => now)
  pushes = []
  pushFails = false
  osmReplies = []
  osmCalls = []
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
        removed_at: null, outside: false, left_start: false, token_hash: `h${i}`,
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
    const alertAt = T0 + 10 * MIN - 45_000 // hide 5 + ping 5, minus the 45 s scheduled alert
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
    expect(await run('jailbreak', { code: g.code, token: g.hafiz.token, qr: JAIL_QR })).toEqual({
      ok: true,
      freedIds: [g.aina.playerId],
    })
    await run('location', { code: g.code, token: g.aina.token, ...at(20) })
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
    await run('jailbreak', { code: g.code, token: g.hafiz.token, qr: JAIL_QR })
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
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: f2.id })).toEqual({
      ok: false,
      reason: 'flare-pending',
      readyInMs: 30_000 + 3 * MIN,
    })
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

describe('Abang Grab', () => {
  const S1 = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
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
    await poll(g, 19.25)
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
    expect(pushes[0].payload).toEqual({ type: 'alert', code: g.code, text: 'Hafiz #03 reported Ben: Unsafe play — pushed me' })
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
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.phase).toBe('ended')
    expect(v.results?.winner).toBe('chasers')
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
    expect(v.alerts.map((a) => a.text)).toEqual(['Hafiz #03 missed 2 check-ins — sent to Penjara'])
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
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR })).toMatchObject({ ok: true })
    now = T0 + 14.75 * MIN // Aina checks in for ping 2
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    // Ping 2 (+15): only one miss since his release, so nothing yet.
    now = T0 + 15 * MIN
    expect(await missedTexts()).toEqual([])
    // Ping 3 (+20): his second miss since release, so he is auto-jailed, and stays there:
    // he has used his one escape.
    now = T0 + 20 * MIN
    await run('location', { code: g.code, token: g.aina.token, ...at(10) })
    expect(await missedTexts()).toContain('Hafiz #03 missed 2 check-ins — sent to Penjara')
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

  it('a location sent before the 45 s window does not count as a check-in', async () => {
    const g = await safetyGame({ checkinMode: 'schedule' })
    for (const m of [10, 15]) {
      now = T0 + m * MIN - 50_000 // 50 s before each reveal: just outside the window
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
    now = T0 + 15 * MIN - 10_000
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR })).toMatchObject({ ok: true })
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
      await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR })
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
    expect(await run('searchParks', { organiserToken, query: 'taman tasik titiwangsa' })).toEqual({ results: [] })
    expect(osmCalls).toHaveLength(1)
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
      'Too big — use part of the park (circle)',
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
    expect(await run('jailbreak', { code: g.code, token: g.aina.token, qr: JAIL_QR })).toMatchObject({ ok: true })
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
    if (drop) await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...STASH })
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

  it("a Full game gets its own secret card code when it's made; Core has no stash at all", async () => {
    const g = await lobby()
    expect(await stash(g)).toEqual({ code: CODE, card: CARD, lat: null, lng: null, claimedBy: null, claimedAt: null })
    const other = await lobby()
    expect(await cardCode(other)).not.toBe(await cardCode(g))
    expect((await store.gameByCode((await readyGame()).code))!.dato_stash ?? null).toBeNull()
  })

  it("only this game's card claims: a bare, another game's or a made-up card gets the same answer as no stash", async () => {
    const g = await chasing()
    const other = await lobby()
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
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).legendaryZone).toBeNull()
  })

  it("the card's code never reaches a player or a marshal; only the organiser gets it to print the card", async () => {
    const g = await chasing()
    const code = await cardCode(g)
    for (const token of [g.aina.token, g.hafiz.token, g.ben.token, g.siti.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(JSON.stringify(v)).not.toContain(code)
      expect(v).not.toHaveProperty('datoCode')
      expect(v).not.toHaveProperty('datoCard')
    }
    const host = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(host.datoCard).toEqual({ letter: (await stash(g))!.card!.letter, code })
    const claimed = await scan(g, g.aina.token)
    expect(JSON.stringify(claimed)).not.toContain(code)
    expect(JSON.stringify(await run<View>('state', { code: g.code, token: g.aina.token }))).not.toContain(code)
  })

  it('the organiser drops it, and dropping again before the start moves it', async () => {
    const g = await lobby()
    const code = await cardCode(g)
    const card = (await stash(g))!.card
    expect(await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...STASH })).toEqual({ ok: true })
    expect(await stash(g)).toEqual({ code, card, ...STASH, claimedBy: null, claimedAt: null })
    const moved = { lat: CENTER.lat - 50 / 111_195, lng: CENTER.lng }
    expect(await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...moved })).toEqual({ ok: true })
    // The printed card keeps working: moving it never changes its code.
    expect(await stash(g)).toEqual({ code, card, ...moved, claimedBy: null, claimedAt: null })
  })

  it('players and marshals cannot drop it', async () => {
    const g = await lobby()
    await rejects(run('dropDatoSeri', { code: g.code, token: g.siti.token, ...STASH }), 403)
    await rejects(run('dropDatoSeri', { code: g.code, token: g.aina.token, ...STASH }), 403)
    await rejects(run('dropDatoSeri', { code: g.code, token: g.ben.token, ...STASH }), 403)
    expect(await stash(g)).toMatchObject({ lat: null, lng: null })
  })

  it('is Full mode only, inside the play area only, and fixed once the game starts', async () => {
    const core = await readyGame()
    await rejects(run('dropDatoSeri', { code: core.code, organiserToken: core.organiserToken, ...STASH }), 409, 'Full mode')
    const g = await lobby()
    const far = { lat: CENTER.lat + 400 / 111_195, lng: CENTER.lng }
    await rejects(run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...far }), 400, 'inside the play area')
    await rejects(run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, lat: 'x', lng: 1 }), 400)
    await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...STASH })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, lat: CENTER.lat, lng: CENTER.lng }), 409)
    expect(await stash(g)).toMatchObject(STASH)
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
    await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...STASH })
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

  it('every player sees an unlabelled hint zone around the stash during the chase, gone once claimed', async () => {
    const g = await lobby()
    await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...STASH })
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).legendaryZone).toBeNull()
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 2 * MIN // hiding: not yet
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).legendaryZone).toBeNull()
    now = T0 + 7 * MIN
    const zones: View['legendaryZone'][] = []
    for (const token of [g.aina.token, g.hafiz.token, g.ben.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(Object.keys(v.legendaryZone!).sort()).toEqual(['lat', 'lng', 'radiusM'])
      expect(v.legendaryZone!.radiusM).toBe(150)
      expect(distanceM(v.legendaryZone!, STASH)).toBeLessThan(150)
      expect(v).not.toHaveProperty('datoStash')
      expect(JSON.stringify(v)).not.toMatch(/dato/i)
      zones.push(v.legendaryZone)
    }
    // Fixed, like a geocache: the same circle for everyone on every poll, and not centred on the card.
    expect(new Set(zones.map((z) => JSON.stringify(z))).size).toBe(1)
    expect(distanceM(zones[0]!, STASH)).toBeGreaterThan(20)
    now += MIN
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).legendaryZone).toEqual(zones[0])
    await scan(g, g.hafiz.token)
    for (const token of [g.aina.token, g.hafiz.token, g.ben.token]) {
      expect((await run<View>('state', { code: g.code, token })).legendaryZone).toBeNull()
    }
  })

  it('the organiser sees the exact stash instead of the zone; a marshal sees neither the stash nor the legendaries', async () => {
    const g = await chasing()
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.datoStash).toEqual({ ...STASH, claimedBy: null, claimedAt: null })
    expect(v.legendaryZone).toBeNull()
    expect(v.settings.legendaries).toEqual({ dato: 'stash', bomoh: 'off' })
    const m = await run<View>('state', { code: g.code, token: g.siti.token })
    expect(m).not.toHaveProperty('datoStash')
    expect(m).not.toHaveProperty('datoCode')
    expect(m).not.toHaveProperty('datoCard')
    expect(m.settings).not.toHaveProperty('legendaries')
    expect(JSON.stringify(m)).not.toContain(await cardCode(g))
  })

  it('claiming the stash retires its card, with found_at; a retired card is never assigned again', async () => {
    const g = await chasing()
    const card = (await stash(g))!.card!
    expect(await scan(g, g.aina.token)).toEqual({ ok: true, kind: 'dato' })
    const org = (await store.organiserBySessionTokenHash(hashToken(g.organiserToken)))!.organisation_id
    expect((await store.secretCards(org)).find((c) => c.id === card.id)).toMatchObject({ state: 'retired', found_at: new Date(now).toISOString() })
    // The game ends; its card is still never handed out again.
    await store.claimEnd(g.gameId, 'runners')
    for (let k = 0; k < 2; k++) {
      const { code } = await run('create', { arenaId: 'around-me', center: CENTER, settings: { mode: 'full' }, organiserToken: g.organiserToken })
      expect((await store.gameByCode(code))!.dato_stash!.card!.id).not.toBe(card.id)
    }
    const third = await run('create', { arenaId: 'around-me', center: CENTER, settings: { mode: 'full' }, organiserToken: g.organiserToken })
    expect(third.notice).toBe('Reprint a yellow card to use Dato Seri.')
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

  describe('old or wrong codes, and changing a card in play (ruling R2)', () => {
    const cardAction = (g: { organiserToken: string }, action: ActionName, legendary: string, letter: string) =>
      run(action, { organiserToken: g.organiserToken, legendary, letter })

    it("scanning another card's code, a retired card's code or a purple card's code answers no-stash", async () => {
      const g = await chasing()
      const letter = (await stash(g))!.card!.letter
      const [other, retired] = ['A', 'B', 'C'].filter((l) => l !== letter)
      const { code: otherCode } = await cardAction(g, 'secretCardCode', 'dato', other)
      expect(await scanQr(g, g.aina.token, datoQr(otherCode))).toEqual({ ok: false, reason: 'no-stash' })
      const { code: retiredCode } = await cardAction(g, 'secretCardCode', 'dato', retired)
      await cardAction(g, 'retireSecretCard', 'dato', retired)
      expect(await scanQr(g, g.hafiz.token, datoQr(retiredCode))).toEqual({ ok: false, reason: 'no-stash' })
      const { code: purple } = await cardAction(g, 'secretCardCode', 'bomoh', 'A')
      expect(await scanQr(g, g.hafiz.token, datoQr(purple))).toEqual({ ok: false, reason: 'no-stash' })
      expect((await stash(g))!.claimedBy).toBeNull()
    })

    it('retiring or reprinting the card of a started game is refused (409), and the hidden card still claims', async () => {
      const g = await chasing()
      const letter = (await stash(g))!.card!.letter
      const code = await cardCode(g)
      await rejects(cardAction(g, 'retireSecretCard', 'dato', letter), 409, 'That card is in a game right now.')
      await rejects(cardAction(g, 'reprintSecretCard', 'dato', letter), 409, 'That card is in a game right now.')
      expect(await cardAction(g, 'secretCardCode', 'dato', letter)).toEqual({ code })
      expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).datoCard).toEqual({ letter, code })
      expect(await scan(g, g.aina.token)).toEqual({ ok: true, kind: 'dato' })
    })

    it("reprinting a lobby's card writes the new code into its stash, so the print link and the claim agree", async () => {
      const g = await lobby()
      const card = (await stash(g))!.card!
      const old = await cardCode(g)
      expect(await cardAction(g, 'reprintSecretCard', 'dato', card.letter)).toEqual({ ok: true })
      const { code: fresh } = await cardAction(g, 'secretCardCode', 'dato', card.letter)
      expect(fresh).not.toBe(old)
      expect(await stash(g)).toMatchObject({ code: fresh, card })
      expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).datoCard).toEqual({ letter: card.letter, code: fresh })
      await cardAction(g, 'confirmSecretCardPrinted', 'dato', card.letter)
      await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...STASH })
      await run('start', { code: g.code, organiserToken: g.organiserToken })
      now = T0 + 7 * MIN
      expect(await scanQr(g, g.aina.token, datoQr(old))).toEqual({ ok: false, reason: 'no-stash' })
      expect(await scanQr(g, g.hafiz.token, datoQr(fresh))).toEqual({ ok: true, kind: 'dato' })
    })

    it("retiring a lobby's card gives it another free card, or leaves it waiting for one when none is free (ruling R9)", async () => {
      const g = await lobby()
      const first = (await stash(g))!.card!
      await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...STASH })
      expect(await cardAction(g, 'retireSecretCard', 'dato', first.letter)).toEqual({ ok: true })
      const second = await stash(g)
      expect(second!.card!.id).not.toBe(first.id)
      // A new card isn't hidden yet: it has to be printed and dropped.
      expect(second).toMatchObject({ lat: null, lng: null, code: (await cardAction(g, 'secretCardCode', 'dato', second!.card!.letter)).code })
      const last = ['A', 'B', 'C'].find((l) => l !== first.letter && l !== second!.card!.letter)!
      await cardAction(g, 'retireSecretCard', 'dato', last)
      expect(await cardAction(g, 'retireSecretCard', 'dato', second!.card!.letter)).toEqual({ ok: true, notice: 'Reprint a yellow card to use Dato Seri.' })
      const game = (await store.gameByCode(g.code))!
      expect(game.dato_stash ?? null).toBeNull()
      expect(game.settings.legendaries.dato).toBe('stash')
      expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).datoCard).toBeNull()
    })
  })

  it('scans refused for not chasing, cannot claim, a full slot or a lost race are not misses (ruling R4)', async () => {
    const g = await lobby()
    await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...STASH })
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
    expect((await run<View>('state', { code: g.code, token: g.aina.token })).legendaryZone).toBeNull()
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
    if (drop) await run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, ...STASH })
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
    await run('dropBomoh', { code: other.code, organiserToken: other.organiserToken, ...STASH })
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
    await run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, ...STASH })
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
    await run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, ...STASH })
    await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...STASH })
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

  it('end to end: lobby stash, drop, claim, then a team-wide exact reveal for exactly 2 ping reveals', async () => {
    // 1. The lobby has its purple card eagerly, with a code and nowhere to be found yet.
    const g = await lobby()
    expect(await stash(g)).toMatchObject({ code: expect.any(String), lat: null, lng: null, claimedBy: null })
    // 2. The organiser hides the card; a chaser sees only the fuzzy hint zone, and no runner exactly.
    await run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, ...STASH })
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
    expect(v.bomohZone).toMatchObject({ radiusM: expect.any(Number) })
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

describe('dropBomoh (mirrors dropDatoSeri above)', () => {
  const STASH = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }

  it('a Full game with Bomoh on gets its own purple card code when it is made, and the organiser drops it, moving it before the start', async () => {
    const g = await readyGame({ mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } })
    // create already assigned a free purple card (ruling R15), same as Dato Seri's yellow one.
    const { code, card } = (await store.gameByCode(g.code))!.bomoh_stash!
    expect(code).toEqual(expect.stringMatching(/^[A-Za-z0-9_-]{22}$/))
    expect(card).toEqual({ id: expect.any(String), letter: expect.stringMatching(/^[ABC]$/) })
    expect(await run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, ...STASH })).toEqual({ ok: true })
    expect((await store.gameByCode(g.code))!.bomoh_stash).toEqual({ code, card, ...STASH, claimedBy: null, claimedAt: null })
    const moved = { lat: CENTER.lat - 50 / 111_195, lng: CENTER.lng }
    expect(await run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, ...moved })).toEqual({ ok: true })
    // The printed card keeps working: moving it never changes its code.
    expect((await store.gameByCode(g.code))!.bomoh_stash).toEqual({ code, card, ...moved, claimedBy: null, claimedAt: null })
  })

  it('players and marshals cannot drop it; only the organiser can', async () => {
    const g = await readyGame({ mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } })
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    await rejects(run('dropBomoh', { code: g.code, token: g.aina.token, ...STASH }), 403)
    await rejects(run('dropBomoh', { code: g.code, token: siti.token, ...STASH }), 403)
    // create already assigned a free purple card (ruling R15), same as Dato Seri; it just isn't dropped yet.
    expect((await store.gameByCode(g.code))!.bomoh_stash).toMatchObject({ lat: null, lng: null })
  })

  it('is Full mode only, inside the play area only, and fixed once the game starts', async () => {
    const core = await readyGame()
    await rejects(run('dropBomoh', { code: core.code, organiserToken: core.organiserToken, ...STASH }), 409, 'Full mode')
    const g = await readyGame({ mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } })
    const far = { lat: CENTER.lat + 400 / 111_195, lng: CENTER.lng }
    await rejects(run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, ...far }), 400, 'inside the play area')
    await rejects(run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, lat: 'x', lng: 1 }), 400)
    await run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, ...STASH })
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    await rejects(run('dropBomoh', { code: g.code, organiserToken: g.organiserToken, lat: CENTER.lat, lng: CENTER.lng }), 409)
    expect((await store.gameByCode(g.code))!.bomoh_stash).toMatchObject(STASH)
  })

  it("with none of the organisation's purple cards free, create tells the organiser and dropping is refused the same way (ruling R9)", async () => {
    // create now assigns a free purple card eagerly (ruling R15), same as Dato Seri: three games use up the
    // organisation's three purple cards (A, B, C), each held by its own lobby.
    const first = await readyGame({ mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } })
    const fullBomoh = { arenaId: 'around-me', center: CENTER, settings: { mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } }, organiserToken: first.organiserToken }
    for (let k = 0; k < 2; k++) await run('create', fullBomoh)
    const fourth = await run('create', fullBomoh)
    expect(fourth.notice).toBe('Reprint a purple card to use Bomoh.')
    expect((await store.gameByCode(fourth.code))!.bomoh_stash ?? null).toBeNull()
    await rejects(run('dropBomoh', { code: fourth.code, organiserToken: first.organiserToken, ...STASH }), 409, 'Reprint a purple card to use Bomoh.')
  })
})

describe('Bomoh is threaded through create/start/the organiser poll/setMode, same as Dato Seri (fix round 1)', () => {
  const orgOf = async (organiserToken: string) => (await store.organiserBySessionTokenHash(hashToken(organiserToken)))!.organisation_id
  const purple = async (organiserToken: string) => (await store.secretCards(await orgOf(organiserToken))).filter((c) => c.legendary === 'bomoh')
  const HOUR = 60 * MIN

  it('create assigns a free purple card eagerly (ruling R15), so the organiser can print it before any drop happens', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', {
      arenaId: 'around-me',
      center: CENTER,
      settings: { mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } },
      organiserToken,
    })
    const card = (await store.gameByCode(code))!.bomoh_stash!.card!
    const row = (await purple(organiserToken)).find((c) => c.id === card.id)!
    expect(row).toMatchObject({ legendary: 'bomoh', letter: card.letter, state: 'ready' })
    expect((await store.gameByCode(code))!.bomoh_stash!.code).toBe(row.code)
  })

  it('with no free card for either legendary, create combines both notices', async () => {
    const organiserToken = await createOrganiser()
    for (const legendary of ['dato', 'bomoh'] as const) {
      for (const letter of ['A', 'B', 'C']) await run('retireSecretCard', { organiserToken, legendary, letter })
    }
    const { code, notice } = await run('create', {
      arenaId: 'around-me',
      center: CENTER,
      settings: { mode: 'full', legendaries: { dato: 'stash', bomoh: 'stash' } },
      organiserToken,
    })
    expect(notice).toBe('Reprint a yellow card to use Dato Seri. Reprint a purple card to use Bomoh.')
    const game = (await store.gameByCode(code))!
    expect(game.dato_stash ?? null).toBeNull()
    expect(game.bomoh_stash ?? null).toBeNull()
  })

  it('a confirmed-printed purple card is assigned on the organiser poll, same as Dato Seri (ruling R9)', async () => {
    const organiserToken = await createOrganiser()
    for (const letter of ['A', 'B', 'C']) await run('reprintSecretCard', { organiserToken, legendary: 'bomoh', letter })
    const { code, notice } = await run('create', {
      arenaId: 'around-me',
      center: CENTER,
      settings: { mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } },
      organiserToken,
    })
    expect(notice).toBe('Reprint a purple card to use Bomoh.')
    expect((await store.gameByCode(code))!.bomoh_stash ?? null).toBeNull()
    await run('confirmSecretCardPrinted', { organiserToken, legendary: 'bomoh', letter: 'B' })
    // A player poll never pays for the recheck; only the organiser's own poll does.
    const ben = await run('join', { code, name: 'Ben', accepted: true })
    await run('state', { code, token: ben.token })
    expect((await store.gameByCode(code))!.bomoh_stash ?? null).toBeNull()
    await run('state', { code, organiserToken })
    expect((await store.gameByCode(code))!.bomoh_stash).toMatchObject({ card: { letter: 'B' }, lat: null, lng: null })
  })

  it("start re-checks an expired lobby's purple card the same way as Dato Seri, and starts with Bomoh off when none is left", async () => {
    const g = await readyGame({ mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } })
    now = T0 + 25 * HOUR
    const fullBomoh = { arenaId: 'around-me', center: CENTER, settings: { mode: 'full', legendaries: { dato: 'off', bomoh: 'stash' } }, organiserToken: g.organiserToken }
    // Three fresh games now take all three purple cards, including the old lobby's own (ruling R3: no longer held).
    for (let k = 0; k < 3; k++) await run('create', fullBomoh)
    expect(await run('start', { code: g.code, organiserToken: g.organiserToken })).toEqual({
      startedAt: expect.any(String),
      notice: 'Reprint a purple card to use Bomoh.',
    })
    const game = (await store.gameByCode(g.code))!
    expect(game.bomoh_stash ?? null).toBeNull()
    expect(game.settings.legendaries.bomoh).toBe('off')
  })

  it('setMode to Full assigns a purple card too, independently of Dato Seri; Core releases both, and Full reassigns fresh ones', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER, settings: { mode: 'core', legendaries: { bomoh: 'stash' } }, organiserToken })
    expect(await run('setMode', { code, organiserToken, mode: 'full' })).toEqual({ ok: true })
    expect((await store.gameByCode(code))!.bomoh_stash!.card).toEqual({ id: expect.any(String), letter: expect.stringMatching(/^[ABC]$/) })
    // Dato Seri defaults on too; both are held now.
    expect((await store.gameByCode(code))!.dato_stash!.card).toBeTruthy()
    expect(await run('setMode', { code, organiserToken, mode: 'core' })).toEqual({ ok: true })
    // Leaving Full releases both cards (ruling R8) — this is the bug this fix round closes for Bomoh.
    expect((await store.gameByCode(code))!.bomoh_stash ?? null).toBeNull()
    expect((await store.gameByCode(code))!.dato_stash ?? null).toBeNull()
    // The settings stay on, so Full again takes fresh cards for both.
    expect(await run('setMode', { code, organiserToken, mode: 'full' })).toEqual({ ok: true })
    expect((await store.gameByCode(code))!.bomoh_stash).toMatchObject({ card: { id: expect.any(String) }, lat: null, lng: null })
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
    expect((await store.gameByCode(code))!.settings.legendaries).toEqual({ dato: 'stash', bomoh: 'stash' })
  })

  it('stores only the two legendaries, dropping any extra keys a client sends (M6)', async () => {
    const { code } = await create({ legendaries: { dato: 'stash', bomoh: 'off', toyol: 'stash' } })
    expect((await store.gameByCode(code))!.settings.legendaries).toEqual({ dato: 'stash', bomoh: 'off' })
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
    await rejects(run('setKit', { code, token: m.token, tick: { id: 'dato-card', on: true } }), 403)
    await rejects(run('setKit', { code, token: m.token, placed: { id: 'dato', on: true } }), 403)
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

describe('secret card sets', () => {
  const NOTICE = 'Reprint a yellow card to use Dato Seri.'
  const make = (organiserToken: string, settings: object = { mode: 'full' }) =>
    run('create', { arenaId: 'around-me', center: CENTER, settings, organiserToken })
  const gameOf = async (code: string) => (await store.gameByCode(code))!
  const cardOf = async (code: string) => (await gameOf(code)).dato_stash?.card ?? null
  const orgOf = async (organiserToken: string) => (await store.organiserBySessionTokenHash(hashToken(organiserToken)))!.organisation_id
  const yellow = async (organiserToken: string) => (await store.secretCards(await orgOf(organiserToken))).filter((c) => c.legendary === 'dato')
  const act = (organiserToken: string, action: ActionName, legendary: string, letter: string) => run(action, { organiserToken, legendary, letter })

  it('a Full game is assigned a free yellow card, and its stash code is that card code', async () => {
    const organiserToken = await createOrganiser()
    const r = await make(organiserToken)
    expect(r).toEqual({ code: r.code })
    const card = (await cardOf(r.code))!
    const row = (await yellow(organiserToken)).find((c) => c.id === card.id)!
    expect(row).toMatchObject({ legendary: 'dato', letter: card.letter, state: 'ready' })
    expect((await gameOf(r.code)).dato_stash!.code).toBe(row.code)
  })

  it('a Core game, or Dato Seri off, is assigned no card', async () => {
    const organiserToken = await createOrganiser()
    expect(await cardOf((await make(organiserToken, {})).code)).toBeNull()
    expect(await cardOf((await make(organiserToken, { mode: 'full', legendaries: { dato: 'off' } })).code)).toBeNull()
    expect((await run('listSecretCards', { organiserToken })).filter((c: { inGame: boolean }) => c.inGame)).toEqual([])
  })

  it('two unfinished games never get the same card', async () => {
    const organiserToken = await createOrganiser()
    const ids = []
    for (let k = 0; k < 3; k++) ids.push((await cardOf((await make(organiserToken)).code))!.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('with no free card (Review Focus 1, ruling R9): one in a game, one retired, one printing, the game is made still wanting Dato Seri, with no card and a notice', async () => {
    const organiserToken = await createOrganiser()
    const first = await make(organiserToken)
    const taken = (await cardOf(first.code))!.letter
    const [l2, l3] = ['A', 'B', 'C'].filter((l) => l !== taken)
    await act(organiserToken, 'retireSecretCard', 'dato', l2)
    await act(organiserToken, 'reprintSecretCard', 'dato', l3)
    const r = await make(organiserToken)
    expect(r).toEqual({ code: expect.any(String), notice: NOTICE })
    const g = await gameOf(r.code)
    expect(g.settings.legendaries.dato).toBe('stash')
    expect(g.settings.mode).toBe('full')
    expect(g.dato_stash ?? null).toBeNull()
  })

  it('once the first game ends unfound, its card can be assigned again', async () => {
    const organiserToken = await createOrganiser()
    const codes = []
    for (let k = 0; k < 3; k++) codes.push((await make(organiserToken)).code)
    expect((await make(organiserToken)).notice).toBe(NOTICE)
    const freed = (await cardOf(codes[0]))!
    await store.claimEnd((await gameOf(codes[0])).id, 'chasers')
    expect((await yellow(organiserToken)).find((c) => c.id === freed.id)!.state).toBe('ready')
    const again = await make(organiserToken)
    expect(again.notice).toBeUndefined()
    expect((await cardOf(again.code))!.id).toBe(freed.id)
  })

  it('a game whose time ran out is no longer holding its card, even before anyone polls it', async () => {
    const g = await readyGame({ mode: 'full' })
    const card = (await cardOf(g.code))!
    await run('start', { code: g.code, organiserToken: g.organiserToken })
    now = T0 + 6 * 60 * MIN
    const others = []
    for (let k = 0; k < 3; k++) others.push((await cardOf((await make(g.organiserToken)).code))?.id)
    expect(others).toContain(card.id)
  })

  it('setMode to Full assigns a card; Core releases it (ruling R8), and Full again assigns one fresh', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await make(organiserToken, {})
    expect(await run('setMode', { code, organiserToken, mode: 'full' })).toEqual({ ok: true })
    const card = (await cardOf(code))!
    expect(card).toEqual({ id: expect.any(String), letter: expect.stringMatching(/^[ABC]$/) })
    const inGame = async () => (await run('listSecretCards', { organiserToken })).filter((c: { inGame: boolean }) => c.inGame)
    expect(await inGame()).toEqual([expect.objectContaining({ legendary: 'dato', letter: card.letter })])
    expect(await run('setMode', { code, organiserToken, mode: 'core' })).toEqual({ ok: true })
    expect((await gameOf(code)).dato_stash ?? null).toBeNull()
    expect(await inGame()).toEqual([])
    // The setting stays on, so Full again takes a card, fresh and not yet hidden.
    expect((await gameOf(code)).settings.legendaries.dato).toBe('stash')
    expect(await run('setMode', { code, organiserToken, mode: 'full' })).toEqual({ ok: true })
    expect((await gameOf(code)).dato_stash).toMatchObject({ card: { id: expect.any(String) }, lat: null, lng: null })
  })

  it('Full, drop, Core, Full (ruling R8): the new card is not dropped, placed.dato is gone and the walk shows the secret step again', async () => {
    const g = await readyGame({ mode: 'full' })
    const DROP = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }
    await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...DROP })
    await run('setKit', { code: g.code, organiserToken: g.organiserToken, placed: { id: 'dato', on: true } })
    const hosted = () => run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect((await hosted()).kit!.placed.dato).toBe(true)
    await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'core' })
    const core = await gameOf(g.code)
    expect(core.dato_stash ?? null).toBeNull()
    expect(core.kit?.placed ?? {}).not.toHaveProperty('dato')
    await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'full' })
    const full = await gameOf(g.code)
    expect(full.dato_stash).toMatchObject({ card: { id: expect.any(String) }, lat: null, lng: null, claimedBy: null })
    const v = await hosted()
    expect(v.datoStash).toBeNull()
    expect(v.kit!.places.map((p) => p.id)).toContain('dato')
    expect(v.kit!.placed.dato).toBeUndefined()
  })

  it('the walk counts the secret step done only when the stash is dropped, never from placed.dato alone (ruling R8)', async () => {
    const g = await readyGame({ mode: 'full' })
    await run('setKit', { code: g.code, organiserToken: g.organiserToken, placed: { id: 'dato', on: true } })
    expect((await gameOf(g.code)).kit!.placed.dato).toBe(true)
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.kit!.placed.dato).toBeUndefined()
    await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng })
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).kit!.placed.dato).toBe(true)
  })

  it('a reprint of a dropped lobby card clears the drop too, so the new print must be hidden again (ruling R8)', async () => {
    const g = await readyGame({ mode: 'full' })
    const card = (await cardOf(g.code))!
    await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng })
    await run('setKit', { code: g.code, organiserToken: g.organiserToken, placed: { id: 'dato', on: true } })
    await act(g.organiserToken, 'reprintSecretCard', 'dato', card.letter)
    const game = await gameOf(g.code)
    expect(game.dato_stash).toMatchObject({ card, lat: null, lng: null, code: (await act(g.organiserToken, 'secretCardCode', 'dato', card.letter)).code })
    expect(game.kit?.placed ?? {}).not.toHaveProperty('dato')
  })

  it('setMode to Full with no free card keeps Dato Seri wanted (ruling R9) and says so', async () => {
    const organiserToken = await createOrganiser()
    for (const l of ['A', 'B', 'C']) await act(organiserToken, 'retireSecretCard', 'dato', l)
    const { code } = await make(organiserToken, {})
    expect(await run('setMode', { code, organiserToken, mode: 'full' })).toEqual({ ok: true, notice: NOTICE })
    expect((await gameOf(code)).settings).toMatchObject({ mode: 'full', legendaries: { dato: 'stash', bomoh: 'off' } })
    expect((await gameOf(code)).dato_stash ?? null).toBeNull()
  })

  describe('no free card recovers (ruling R9)', () => {
    /** A Full lobby made while all three yellow cards wait to be printed. */
    async function waiting() {
      const organiserToken = await createOrganiser()
      for (const l of ['A', 'B', 'C']) await act(organiserToken, 'reprintSecretCard', 'dato', l)
      const r = await make(organiserToken)
      expect(r.notice).toBe(NOTICE)
      const ben = await run('join', { code: r.code, name: 'Ben', accepted: true })
      return { code: r.code, organiserToken, ben }
    }

    it('a card confirmed printed is assigned on the organiser poll', async () => {
      const g = await waiting()
      const v0 = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
      expect(v0.datoCard).toBeNull()
      await act(g.organiserToken, 'confirmSecretCardPrinted', 'dato', 'B')
      const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
      expect(v.datoCard).toEqual({ letter: 'B', code: (await act(g.organiserToken, 'secretCardCode', 'dato', 'B')).code })
      expect((await gameOf(g.code)).dato_stash).toMatchObject({ card: { letter: 'B' }, lat: null, lng: null })
    })

    it('a player poll never runs the re-check or the assignment', async () => {
      const g = await waiting()
      await act(g.organiserToken, 'confirmSecretCardPrinted', 'dato', 'B')
      const calls: string[] = []
      const realCards = store.secretCards.bind(store)
      const realGames = store.unfinishedGames.bind(store)
      store.secretCards = async (o) => (calls.push('secretCards'), realCards(o))
      store.unfinishedGames = async (o, since) => (calls.push('unfinishedGames'), realGames(o, since))
      await run('state', { code: g.code, token: g.ben.token })
      expect(calls).toEqual([])
      expect((await gameOf(g.code)).dato_stash ?? null).toBeNull()
    })

    it('a player poll on an expired lobby never re-checks either', async () => {
      const organiserToken = await createOrganiser()
      const { code } = await make(organiserToken)
      const ben = await run('join', { code, name: 'Ben', accepted: true })
      now = T0 + 25 * 60 * MIN
      const calls: string[] = []
      const realCards = store.secretCards.bind(store)
      store.secretCards = async (o) => (calls.push('secretCards'), realCards(o))
      await run('state', { code, token: ben.token })
      expect(calls).toEqual([])
    })

    it('setMode to Full and a drop retry the assignment', async () => {
      const g = await waiting()
      await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'core' })
      await act(g.organiserToken, 'confirmSecretCardPrinted', 'dato', 'A')
      expect(await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'full' })).toEqual({ ok: true })
      expect((await cardOf(g.code))!.letter).toBe('A')

      const h = await waiting()
      await rejects(run('dropDatoSeri', { code: h.code, organiserToken: h.organiserToken, lat: CENTER.lat, lng: CENTER.lng }), 409, NOTICE)
      await act(h.organiserToken, 'confirmSecretCardPrinted', 'dato', 'C')
      expect(await run('dropDatoSeri', { code: h.code, organiserToken: h.organiserToken, lat: CENTER.lat, lng: CENTER.lng })).toEqual({ ok: true })
      expect((await gameOf(h.code)).dato_stash).toMatchObject({ card: { letter: 'C' }, lat: CENTER.lat, lng: CENTER.lng })
    })

    it('start with still no card starts with Dato Seri off and returns the notice', async () => {
      const g = await readyGame({ mode: 'full' })
      const held = (await cardOf(g.code))!.letter
      for (const l of ['A', 'B', 'C'].filter((x) => x !== held)) await act(g.organiserToken, 'reprintSecretCard', 'dato', l)
      expect(await act(g.organiserToken, 'retireSecretCard', 'dato', held)).toEqual({ ok: true, notice: NOTICE })
      expect((await gameOf(g.code)).settings.legendaries.dato).toBe('stash')
      expect(await run('start', { code: g.code, organiserToken: g.organiserToken })).toEqual({ startedAt: expect.any(String), notice: NOTICE })
      const game = await gameOf(g.code)
      expect(game.dato_stash ?? null).toBeNull()
      expect(game.settings.legendaries.dato).toBe('off')
    })

    it('start picks up a card confirmed printed just before', async () => {
      const g = await readyGame({ mode: 'full' })
      const held = (await cardOf(g.code))!.letter
      const others = ['A', 'B', 'C'].filter((x) => x !== held)
      for (const l of others) await act(g.organiserToken, 'reprintSecretCard', 'dato', l)
      await act(g.organiserToken, 'retireSecretCard', 'dato', held)
      await act(g.organiserToken, 'confirmSecretCardPrinted', 'dato', others[0])
      expect(await run('start', { code: g.code, organiserToken: g.organiserToken })).toEqual({ startedAt: expect.any(String) })
      expect((await cardOf(g.code))!.letter).toBe(others[0])
    })
  })

  it('listSecretCards lists all six without codes, with state, foundAt and inGame', async () => {
    const organiserToken = await createOrganiser()
    const { code } = await make(organiserToken)
    const card = (await cardOf(code))!
    const list = await run('listSecretCards', { organiserToken })
    expect(list).toHaveLength(6)
    for (const c of list) expect(Object.keys(c).sort()).toEqual(['foundAt', 'inGame', 'legendary', 'letter', 'state'])
    expect(list.find((c: { legendary: string; letter: string }) => c.legendary === 'dato' && c.letter === card.letter)).toEqual({
      legendary: 'dato', letter: card.letter, state: 'ready', foundAt: null, inGame: true,
    })
    const codes = (await store.secretCards(await orgOf(organiserToken))).map((c) => c.code)
    for (const c of codes) expect(JSON.stringify(list)).not.toContain(c)
  })

  it('reprintSecretCard gives a new code and sets printing, which is not free; confirmSecretCardPrinted makes it ready', async () => {
    const organiserToken = await createOrganiser()
    const before = (await yellow(organiserToken)).find((c) => c.letter === 'A')!
    expect(await act(organiserToken, 'reprintSecretCard', 'dato', 'A')).toEqual({ ok: true })
    const after = (await yellow(organiserToken)).find((c) => c.letter === 'A')!
    expect(after.state).toBe('printing')
    expect(after.code).not.toBe(before.code)
    expect(after.code).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(await act(organiserToken, 'secretCardCode', 'dato', 'A')).toEqual({ code: after.code })
    const assigned = []
    for (let k = 0; k < 2; k++) assigned.push((await cardOf((await make(organiserToken)).code))!.letter)
    expect(assigned.sort()).toEqual(['B', 'C'])
    expect((await make(organiserToken)).notice).toBe(NOTICE)
    expect(await act(organiserToken, 'confirmSecretCardPrinted', 'dato', 'A')).toEqual({ ok: true })
    expect((await yellow(organiserToken)).find((c) => c.letter === 'A')!.state).toBe('ready')
    expect((await cardOf((await make(organiserToken)).code))!.letter).toBe('A')
  })

  it('confirmSecretCardPrinted only moves a printing card (409 otherwise)', async () => {
    const organiserToken = await createOrganiser()
    await rejects(act(organiserToken, 'confirmSecretCardPrinted', 'dato', 'A'), 409)
    await act(organiserToken, 'retireSecretCard', 'dato', 'A')
    await rejects(act(organiserToken, 'confirmSecretCardPrinted', 'dato', 'A'), 409)
    expect((await yellow(organiserToken)).find((c) => c.letter === 'A')!.state).toBe('retired')
  })

  it('retireSecretCard by hand makes a card not free', async () => {
    const organiserToken = await createOrganiser()
    expect(await act(organiserToken, 'retireSecretCard', 'dato', 'B')).toEqual({ ok: true })
    expect((await yellow(organiserToken)).find((c) => c.letter === 'B')).toMatchObject({ state: 'retired', found_at: null })
    const letters = []
    for (let k = 0; k < 2; k++) letters.push((await cardOf((await make(organiserToken)).code))!.letter)
    expect(letters.sort()).toEqual(['A', 'C'])
  })

  it('a player or a marshal calling any card action gets 403, and a bad card is 400', async () => {
    const g = await readyGame({ mode: 'full' })
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    const all: ActionName[] = ['listSecretCards', 'retireSecretCard', 'reprintSecretCard', 'confirmSecretCardPrinted', 'secretCardCode']
    for (const action of all) {
      for (const token of [g.aina.token, siti.token]) await rejects(run(action, { code: g.code, token, legendary: 'dato', letter: 'A' }), 403)
      await rejects(run(action, { legendary: 'dato', letter: 'A' }), 403)
    }
    await rejects(act(g.organiserToken, 'secretCardCode', 'dato', 'D'), 400)
    await rejects(act(g.organiserToken, 'retireSecretCard', 'joker', 'A'), 400)
  })

  it('each organisation has its own cards: one organiser never touches another organisation cards', async () => {
    const a = await createOrganiser()
    const b = await createOrganiser()
    await act(a, 'retireSecretCard', 'dato', 'A')
    expect((await yellow(b)).find((c) => c.letter === 'A')!.state).toBe('ready')
    expect((await act(a, 'secretCardCode', 'dato', 'B')).code).not.toBe((await act(b, 'secretCardCode', 'dato', 'B')).code)
  })

  it('the organiser view carries datoCard and the card letter on the packing list; a marshal and a runner do not', async () => {
    const g = await readyGame({ mode: 'full' })
    const { inviteToken } = await run('createMarshalInvite', { code: g.code, organiserToken: g.organiserToken })
    const siti = await run('redeemMarshalInvite', { code: g.code, inviteToken, name: 'Siti' })
    const game = await gameOf(g.code)
    const card = game.dato_stash!.card!
    const host = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(host.datoCard).toEqual({ letter: card.letter, code: game.dato_stash!.code })
    expect(host).not.toHaveProperty('datoCode')
    expect(host.kit!.items.find((i) => i.id === 'dato-card')!.label).toBe(`Yellow card ${card.letter}`)
    expect(host.kit!.places.map((p) => p.id)).toContain('dato')
    for (const token of [siti.token, g.aina.token, g.ben.token]) {
      const v = await run<View>('state', { code: g.code, token })
      expect(v).not.toHaveProperty('datoCard')
      expect(JSON.stringify(v)).not.toContain(`Yellow card ${card.letter}`)
      expect(JSON.stringify(v)).not.toContain(game.dato_stash!.code!)
    }
    // A Core game has datoCard null for the organiser.
    const core = await readyGame()
    expect((await run<View>('state', { code: core.code, organiserToken: core.organiserToken })).datoCard).toBeNull()
  })

  it('the organiser can tick the yellow card under its letter', async () => {
    const g = await readyGame({ mode: 'full' })
    await run('setKit', { code: g.code, organiserToken: g.organiserToken, tick: { id: 'dato-card', on: true } })
    const letter = (await cardOf(g.code))!.letter
    expect((await gameOf(g.code)).kit!.ticks).toEqual({ 'dato-card': `Yellow card ${letter}` })
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
  describe("Bomoh's purple cards: the same organiser lifecycle as Dato Seri's yellow ones", () => {
    const BOMOH_NOTICE = 'Reprint a purple card to use Bomoh.'
    const purple = async (organiserToken: string) => (await store.secretCards(await orgOf(organiserToken))).filter((c) => c.legendary === 'bomoh')
    const bomohOf = async (code: string) => (await gameOf(code)).bomoh_stash ?? null

    /** A Full lobby holding its first purple card directly: no drop/claim action exists yet (a later task adds it). */
    async function bomohLobby() {
      const g = await readyGame({ mode: 'full', legendaries: { bomoh: 'stash' } })
      const card = (await purple(g.organiserToken))[0]
      await store.updateGame((await gameOf(g.code)).id, {
        bomoh_stash: { code: card.code, card: { id: card.id, letter: card.letter }, lat: null, lng: null, claimedBy: null, claimedAt: null },
      })
      return { ...g, card }
    }

    it("retiring a lobby's purple card gives it another free purple card, or leaves it waiting with Bomoh's own notice (ruling R9)", async () => {
      const g = await bomohLobby()
      const first = g.card
      expect(await act(g.organiserToken, 'retireSecretCard', 'bomoh', first.letter)).toEqual({ ok: true })
      const second = await bomohOf(g.code)
      expect(second!.card!.id).not.toBe(first.id)
      // Not hidden yet: it has to be printed and dropped, same as a fresh Dato Seri card.
      expect(second).toMatchObject({ lat: null, lng: null })
      const last = ['A', 'B', 'C'].find((l) => l !== first.letter && l !== second!.card!.letter)!
      await act(g.organiserToken, 'retireSecretCard', 'bomoh', last)
      expect(await act(g.organiserToken, 'retireSecretCard', 'bomoh', second!.card!.letter)).toEqual({ ok: true, notice: BOMOH_NOTICE })
      const game = await gameOf(g.code)
      expect(game.bomoh_stash ?? null).toBeNull()
      expect(game.settings.legendaries.bomoh).toBe('stash')
    })

    it("reprinting a dropped lobby's purple card clears the drop and placed.bomoh, same as a yellow reprint (ruling R8)", async () => {
      const g = await bomohLobby()
      const DROPPED = { lat: CENTER.lat + 50 / 111_195, lng: CENTER.lng }
      const gameId = (await gameOf(g.code)).id
      await store.updateGame(gameId, { bomoh_stash: { ...(await bomohOf(g.code))!, ...DROPPED } })
      await store.setKitKey(gameId, 'placed', 'bomoh', true)
      const oldCode = (await bomohOf(g.code))!.code
      expect(await act(g.organiserToken, 'reprintSecretCard', 'bomoh', g.card.letter)).toEqual({ ok: true })
      const game = await gameOf(g.code)
      expect(game.bomoh_stash).toMatchObject({ card: { id: g.card.id, letter: g.card.letter }, lat: null, lng: null, claimedBy: null, claimedAt: null })
      expect(game.bomoh_stash!.code).not.toBe(oldCode)
      expect(game.kit?.placed ?? {}).not.toHaveProperty('bomoh')
    })

    it("an expired lobby's unused purple card is freed to be reassigned, the same way Dato Seri's yellow card is (ruling R3)", async () => {
      const g = await bomohLobby()
      const held = async () =>
        (await run('listSecretCards', { organiserToken: g.organiserToken })).find(
          (c: { legendary: string; letter: string }) => c.legendary === 'bomoh' && c.letter === g.card.letter,
        ).inGame
      expect(await held()).toBe(true)
      now = T0 + 25 * 60 * MIN
      expect(await held()).toBe(false)
    })
  })

  describe('lobbies hold their card for 24 hours (ruling R3)', () => {
    const HOUR = 60 * MIN

    it("a 25-hour-old lobby's card is free for a new game, and is listed as not in a game", async () => {
      const organiserToken = await createOrganiser()
      const old = await make(organiserToken)
      const oldCard = (await cardOf(old.code))!
      now = T0 + 25 * HOUR
      expect((await run('listSecretCards', { organiserToken })).find((c: { letter: string; legendary: string }) => c.legendary === 'dato' && c.letter === oldCard.letter).inGame).toBe(false)
      const fresh = []
      for (let k = 0; k < 3; k++) fresh.push((await cardOf((await make(organiserToken)).code))!.id)
      expect(fresh).toContain(oldCard.id)
    })

    it('a lobby under 24 hours old still holds its card', async () => {
      const organiserToken = await createOrganiser()
      const old = await make(organiserToken)
      now = T0 + 23 * HOUR
      const others = []
      for (let k = 0; k < 2; k++) others.push((await cardOf((await make(organiserToken)).code))!.id)
      expect(others).not.toContain((await cardOf(old.code))!.id)
      expect((await make(organiserToken)).notice).toBe(NOTICE)
    })

    it('an old lobby whose card was taken re-checks on start: another card is gone too, so it starts with Dato Seri off', async () => {
      const g = await readyGame({ mode: 'full' })
      now = T0 + 25 * HOUR
      for (let k = 0; k < 3; k++) await make(g.organiserToken)
      expect(await run('start', { code: g.code, organiserToken: g.organiserToken })).toEqual({ startedAt: expect.any(String), notice: NOTICE })
      const game = await gameOf(g.code)
      expect(game.dato_stash ?? null).toBeNull()
      expect(game.settings.legendaries.dato).toBe('off')
    })

    it('an old lobby whose card was taken gets another free one on start', async () => {
      const g = await readyGame({ mode: 'full' })
      const oldCard = (await cardOf(g.code))!
      now = T0 + 25 * HOUR
      const made = []
      for (let k = 0; k < 3; k++) made.push((await make(g.organiserToken)).code)
      // All three are taken now, the old lobby's included. Free a different one by ending its game.
      let freed = ''
      for (const code of made) {
        const c = (await cardOf(code))!
        if (c.id !== oldCard.id && !freed) {
          freed = c.id
          await store.claimEnd((await gameOf(code)).id, 'runners')
        }
      }
      expect(await run('start', { code: g.code, organiserToken: g.organiserToken })).toEqual({ startedAt: expect.any(String) })
      const now2 = (await cardOf(g.code))!
      expect(now2.id).toBe(freed)
      expect((await gameOf(g.code)).dato_stash!.code).toBe((await yellow(g.organiserToken)).find((c) => c.id === now2.id)!.code)
    })

    it('an old lobby keeps its card on start when nobody took it, taking a reprinted code', async () => {
      const g = await readyGame({ mode: 'full' })
      const card = (await cardOf(g.code))!
      now = T0 + 25 * HOUR
      // Not held any more, so a reprint doesn't touch the old lobby's stash.
      await act(g.organiserToken, 'reprintSecretCard', 'dato', card.letter)
      await act(g.organiserToken, 'confirmSecretCardPrinted', 'dato', card.letter)
      expect(await run('start', { code: g.code, organiserToken: g.organiserToken })).toEqual({ startedAt: expect.any(String) })
      expect(await cardOf(g.code)).toEqual(card)
      expect((await gameOf(g.code)).dato_stash!.code).toBe((await act(g.organiserToken, 'secretCardCode', 'dato', card.letter)).code)
    })

    const DROP = { lat: CENTER.lat + 100 / 111_195, lng: CENTER.lng }

    it('a dropped 25-hour-old lobby keeps its card: another game cannot draw it, and it starts with it', async () => {
      const g = await readyGame({ mode: 'full' })
      const card = (await cardOf(g.code))!
      await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...DROP })
      now = T0 + 25 * HOUR
      const drawn = []
      for (let k = 0; k < 2; k++) drawn.push((await cardOf((await make(g.organiserToken)).code))!.id)
      expect(drawn).not.toContain(card.id)
      expect((await make(g.organiserToken)).notice).toBe(NOTICE)
      expect((await run('listSecretCards', { organiserToken: g.organiserToken })).find((c: { legendary: string; letter: string }) => c.legendary === 'dato' && c.letter === card.letter).inGame).toBe(true)
      expect(await run('start', { code: g.code, organiserToken: g.organiserToken })).toEqual({ startedAt: expect.any(String) })
      expect(await cardOf(g.code)).toEqual(card)
      expect((await gameOf(g.code)).dato_stash).toMatchObject(DROP)
    })

    it('an undropped 25-hour-old lobby still frees its card', async () => {
      const g = await readyGame({ mode: 'full' })
      const card = (await cardOf(g.code))!
      now = T0 + 25 * HOUR
      const drawn = []
      for (let k = 0; k < 3; k++) drawn.push((await cardOf((await make(g.organiserToken)).code))!.id)
      expect(drawn).toContain(card.id)
    })

    it('a dropped card that is no longer claimable is let go, never kept as hidden: the lobby takes a fresh card it must hide (ruling R9)', async () => {
      const g = await readyGame({ mode: 'full' })
      const card = (await cardOf(g.code))!
      await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...DROP })
      await run('setKit', { code: g.code, organiserToken: g.organiserToken, placed: { id: 'dato', on: true } })
      now = T0 + 25 * HOUR
      // Forced: the hidden card is retired behind the lobby's back, while two other cards are free.
      await store.setSecretCard(card.id, { state: 'retired' })
      expect(await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'full' })).toEqual({ ok: true })
      const game = await gameOf(g.code)
      expect(game.dato_stash).toMatchObject({ lat: null, lng: null })
      expect(game.dato_stash!.card!.id).not.toBe(card.id)
      expect(game.kit?.placed ?? {}).not.toHaveProperty('dato')
    })

    it('the ghost-card guard with no other card free: the stash goes, and start runs with Dato Seri off and the notice', async () => {
      const g = await readyGame({ mode: 'full' })
      const card = (await cardOf(g.code))!
      await run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, ...DROP })
      now = T0 + 25 * HOUR
      for (const l of ['A', 'B', 'C'].filter((x) => x !== card.letter)) await act(g.organiserToken, 'retireSecretCard', 'dato', l)
      await store.setSecretCard(card.id, { state: 'retired' })
      expect(await run('start', { code: g.code, organiserToken: g.organiserToken })).toEqual({ startedAt: expect.any(String), notice: NOTICE })
      const game = await gameOf(g.code)
      expect(game.dato_stash ?? null).toBeNull()
      expect(game.settings.legendaries.dato).toBe('off')
    })

    it("state on an expired lobby shows the re-checked card, never one another game holds", async () => {
      const g = await readyGame({ mode: 'full' })
      const oldCard = (await cardOf(g.code))!
      now = T0 + 25 * HOUR
      const made = []
      for (let k = 0; k < 3; k++) made.push((await make(g.organiserToken)).code)
      let freed = ''
      for (const code of made) {
        const c = (await cardOf(code))!
        if (c.id !== oldCard.id && !freed) {
          freed = c.id
          await store.claimEnd((await gameOf(code)).id, 'runners')
        }
      }
      const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
      const freedCard = (await yellow(g.organiserToken)).find((c) => c.id === freed)!
      expect(v.datoCard).toEqual({ letter: freedCard.letter, code: freedCard.code })
      expect((await cardOf(g.code))!.id).toBe(freed)
    })

    it('an old lobby re-checks on setMode and on a drop too', async () => {
      const g = await readyGame({ mode: 'full' })
      now = T0 + 25 * HOUR
      for (let k = 0; k < 3; k++) await make(g.organiserToken)
      expect(await run('setMode', { code: g.code, organiserToken: g.organiserToken, mode: 'full' })).toEqual({ ok: true, notice: NOTICE })
      expect((await gameOf(g.code)).dato_stash ?? null).toBeNull()
      await rejects(run('dropDatoSeri', { code: g.code, organiserToken: g.organiserToken, lat: CENTER.lat, lng: CENTER.lng }), 409)
    })
  })
})
