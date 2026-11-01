// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { MIN, T0 } from '../../shared/fixtures.js'
import { BONUS_SEQ_BASE } from '../../shared/clock.js'
import { cardAt, deckFor } from '../../shared/deck.js'
import { JAIL_QR, stationQr, tagQr } from '../../shared/ids.js'
import { seeded } from '../../shared/testing.js'
import type { PowerUpKind, Role } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { ActionError, actions, type ActionName } from './actions.js'
import { hashToken } from './secrets.js'
import { MemoryStore } from './store.js'

const CENTER = { lat: 3.0, lng: 101.0 }
let now: number
let store: MemoryStore
let pushes: { endpoint: string; payload: unknown }[]
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
    await rejects(run('setRoles', { code: g.code, organiserToken: 'wrong', shuffle: true }), 403)
    await rejects(run('start', { code: g.code, organiserToken: g.aina.token }), 403)
  })

  it("another organiser's valid session cannot setRoles or start this game (403)", async () => {
    const gameA = await readyGame()
    const gameB = await readyGame()
    await rejects(run('setRoles', { code: gameA.code, organiserToken: gameB.organiserToken, shuffle: true }), 403, 'Organiser only')
    await rejects(run('start', { code: gameA.code, organiserToken: gameB.organiserToken }), 403, 'Organiser only')
  })

  it('shuffle assigns everyone a role and reports problems', async () => {
    const g = await readyGame()
    const r = await run('setRoles', { code: g.code, organiserToken: g.organiserToken, shuffle: true })
    expect(Object.keys(r.roles)).toHaveLength(3)
    expect(r.problems).toEqual([])
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
    expect(pushes[0].payload).toEqual({ type: 'checkin', code: g.code, seq: 1 })
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
      now = T0 + 6 * MIN + i * 1000
      await run('location', { code: g.code, token: g.ben.token, ...at(i) })
      // The runners check in every minute, so nobody is auto-jailed and the game keeps going.
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

  it('flare adds a bonus ping that pushes now and reveals in 30 s', async () => {
    const g = await chasingWithStation()
    const flare = await give(g.gameId, g.ben.playerId, 'flare')
    pushes = []
    expect(await run('usePowerup', { code: g.code, token: g.ben.token, powerupId: flare.id })).toEqual({ ok: true, kind: 'flare' })
    await run('state', { code: g.code, token: g.ben.token })
    expect(pushes.map((p) => p.payload)).toContainEqual({ type: 'checkin', code: g.code, seq: BONUS_SEQ_BASE })
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
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toEqual({ ok: false, reason: 'shielded' })
    const v = await run<View>('state', { code: g.code, token: g.ben.token })
    expect(v.feed[0].text).toBe('#07 blocked a catch with Durian.')
    expect(await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(7) })).toMatchObject({ ok: true })
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
  const siti = await run('join', { code: g.code, name: 'Siti', accepted: true })
  await run('subscribe', { code: g.code, token: siti.token, subscription: { endpoint: 'https://push/Siti' } })
  await run('setRoles', { code: g.code, organiserToken: g.organiserToken, roles: { [siti.playerId]: 'marshal' } })
  await run('start', { code: g.code, organiserToken: g.organiserToken })
  now = T0 + 7 * MIN
  pushes = []
  const gameId = (await store.gameByCode(g.code))!.id
  return { ...g, siti, gameId }
}

describe('game mode', () => {
  it('defaults to Core, and Full can be chosen', async () => {
    const core = await readyGame()
    expect((await store.gameByCode(core.code))!.settings.mode).toBe('core')
    const full = await readyGame({ mode: 'full' })
    expect((await store.gameByCode(full.code))!.settings.mode).toBe('full')
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
    expect(await run('sos', { code: g.code, token: g.aina.token, ...at(30) })).toEqual({ ok: true, notified: 1 })
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
    await rejects(run('handleAlert', { code: g.code, token: g.ben.token, eventId: alert.id }), 403)
    expect(await run('handleAlert', { code: g.code, token: g.siti.token, eventId: alert.id })).toEqual({ ok: true })
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).alerts[0].handled).toBe(true)
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

  it('a flagged catch shows as Check catch', async () => {
    const g = await safetyGame()
    await run('location', { code: g.code, token: g.ben.token, ...at(0) })
    now = T0 + 7 * MIN
    // Hafiz has never sent a location: the catch counts but is flagged.
    const r = await run('catch', { code: g.code, token: g.ben.token, tagQr: tagQr(3) })
    expect(r).toMatchObject({ ok: true, flagged: true })
    const v = await run<View>('state', { code: g.code, organiserToken: g.organiserToken })
    expect(v.alerts.map((a) => a.text)).toEqual(['Check catch: #03 by Ben (position unknown)'])
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
    expect(r).toEqual({ ok: true, notified: 2 })
    expect(pushes.map((p) => p.endpoint).sort()).toEqual(['https://push/Siti', 'https://push/organiser'])
    expect((await run<View>('state', { code: g.code, organiserToken: g.organiserToken })).me.push).toEqual({ endpoint: 'https://push/organiser' })
  })

  it('SOS says when no marshal could be reached', async () => {
    const g = await safetyGame()
    await store.updatePlayers([{ id: g.siti.playerId, patch: { push: null } }])
    expect(await run('sos', { code: g.code, token: g.aina.token })).toEqual({ ok: true, notified: 0 })
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
