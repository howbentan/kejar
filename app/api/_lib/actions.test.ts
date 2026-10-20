// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { MIN, T0 } from '../../shared/fixtures.js'
import { JAIL_QR, tagQr } from '../../shared/ids.js'
import { seeded } from '../../shared/testing.js'
import type { Role } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { ActionError, actions, type ActionName } from './actions.js'
import { MemoryStore } from './store.js'

const CENTER = { lat: 3.0, lng: 101.0 }
let now: number
let store: MemoryStore
let pushes: { endpoint: string; payload: unknown }[]

const run = <T = any>(action: ActionName, body: object) =>
  actions[action](
    {
      store,
      now,
      rng: seeded(7),
      push: async (sub, payload) => {
        pushes.push({ endpoint: sub.endpoint!, payload: JSON.parse(payload) })
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

beforeEach(() => {
  now = T0
  store = new MemoryStore(() => now)
  pushes = []
})

/** Creates a game with Ben (chaser), Aina #07 and Hafiz #03 (runners), all subscribed to push. */
async function readyGame(settings: object = {}) {
  const { code, hostKey } = await run('create', { arenaId: 'around-me', center: CENTER, settings })
  const join = async (name: string) => {
    const r = await run('join', { code, name, accepted: true })
    await run('subscribe', { code, token: r.token, subscription: { endpoint: `https://push/${name}` } })
    return r
  }
  const ben = await join('Ben')
  const aina = await join('Aina')
  const hafiz = await join('Hafiz')
  const roles: Record<string, Role> = { [ben.playerId]: 'chaser', [aina.playerId]: 'runner', [hafiz.playerId]: 'runner' }
  await run('setRoles', { code, hostKey, roles })
  await run('linkTag', { code, token: aina.token, tagId: 7 })
  await run('linkTag', { code, token: hafiz.token, tagId: 3 })
  return { code, hostKey, ben, aina, hafiz }
}

const at = (dLatM: number) => ({ lat: CENTER.lat + dLatM / 111_195, lng: CENTER.lng, accuracy_m: 8 })

describe('joining', () => {
  it('create then join returns a token and player', async () => {
    const { code, hostKey } = await run('create', { arenaId: 'around-me', center: CENTER })
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
    expect(hostKey).toHaveLength(43)
    const r = await run('join', { code, name: 'Aina', accepted: true })
    expect(r.token).toHaveLength(43)
    expect(r.playerId).toBeTruthy()
  })

  it('join without accepting the terms is rejected (400)', async () => {
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER })
    await rejects(run('join', { code, name: 'Aina', accepted: false }), 400, 'Accept')
  })

  it('rejoin with stored token returns the same player', async () => {
    const { code } = await run('create', { arenaId: 'around-me', center: CENTER })
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
    const { code, hostKey } = await run('create', { arenaId: 'around-me', center: CENTER })
    const a = await run('join', { code, name: 'Aina', accepted: true })
    const b = await run('join', { code, name: 'Hafiz', accepted: true })
    await run('setRoles', { code, hostKey, roles: { [a.playerId]: 'runner', [b.playerId]: 'runner' } })
    await rejects(run('start', { code, hostKey }), 409, 'Need at least 1 chaser')
  })

  it("start refuses when a runner has no tag (409 'Runner Aina has no tag')", async () => {
    const g = await readyGame()
    await store.updatePlayers([{ id: g.aina.playerId, patch: { tag_id: null } }])
    await rejects(run('start', { code: g.code, hostKey: g.hostKey }), 409, 'Runner Aina has no tag')
  })

  it("linkTag refuses a tag already linked (409 'Tag 07 is already taken')", async () => {
    const g = await readyGame()
    await rejects(run('linkTag', { code: g.code, token: g.hafiz.token, tagId: 7 }), 409, 'Tag 07 is already taken')
  })

  it('non-host cannot setRoles or start (403)', async () => {
    const g = await readyGame()
    await rejects(run('setRoles', { code: g.code, hostKey: 'wrong', shuffle: true }), 403)
    await rejects(run('start', { code: g.code, hostKey: g.aina.token }), 403)
  })

  it('shuffle assigns everyone a role and reports problems', async () => {
    const g = await readyGame()
    const r = await run('setRoles', { code: g.code, hostKey: g.hostKey, shuffle: true })
    expect(Object.keys(r.roles)).toHaveLength(3)
    expect(r.problems).toEqual([])
  })
})

describe('pings and check-ins', () => {
  it('state at the first alert time pushes once to runners with subscriptions in push mode', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, hostKey: g.hostKey })
    now = T0 + 10 * MIN - 30_000 // hide 5 + ping 5, minus 30 s
    await run('state', { code: g.code, token: g.ben.token })
    await run('state', { code: g.code, token: g.aina.token })
    expect(pushes.map((p) => p.endpoint).sort()).toEqual(['https://push/Aina', 'https://push/Hafiz'])
    expect(pushes[0].payload).toEqual({ type: 'checkin', code: g.code, seq: 1 })
  })

  it('schedule mode never pushes', async () => {
    const g = await readyGame({ checkinMode: 'schedule' })
    await run('start', { code: g.code, hostKey: g.hostKey })
    now = T0 + 10 * MIN
    await run('state', { code: g.code, token: g.ben.token })
    expect(pushes).toEqual([])
  })

  it('state never returns runner positions to a chaser except fuzzed at reveal', async () => {
    const g = await readyGame()
    await run('start', { code: g.code, hostKey: g.hostKey })
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
    await run('start', { code: g.code, hostKey: g.hostKey })
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
    expect(v.feed[0].text).toBe('#07 caught by Ben')
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
    now = T0 + 51 * MIN
    const v = await run<View>('state', { code: g.code, hostKey: g.hostKey })
    expect(v.phase).toBe('ended')
    expect(v.results?.winner).toBe('runners')
  })
})
