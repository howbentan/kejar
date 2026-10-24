// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/types.js'
import { iso, MIN, T0 } from '../../shared/fixtures.js'
import { MemoryStore } from './store.js'

let now: number
let store: MemoryStore

beforeEach(() => {
  now = T0
  store = new MemoryStore(() => now)
})

async function startedGame() {
  return store.createGame({
    code: 'ABC234',
    arena: { id: 'a', name: 'a', boundary: [], jail: { lat: 0, lng: 0 }, start: { lat: 0, lng: 0 } },
    settings: { ...DEFAULT_SETTINGS },
    started_at: iso(T0),
    ended_at: null,
    winner: null,
    paused_at: null,
    pauses: [],
    host_key_hash: 'h',
  })
}

const newPlayer = (gameId: string, name: string) =>
  store.addPlayer({
    game_id: gameId,
    name,
    role: 'runner',
    tag_id: null,
    accepted_at: iso(T0),
    caught_at: null,
    caught_by: null,
    jailed: false,
    freed_once: false,
    push: null,
    removed_at: null,
    outside: false,
    left_start: false,
    token_hash: `t-${name}`,
  })

describe('MemoryStore safety methods', () => {
  it('pauseGame is true once, then false while paused', async () => {
    const g = await startedGame()
    expect(await store.pauseGame(g.id)).toBe(true)
    expect(await store.pauseGame(g.id)).toBe(false)
    expect((await store.gameByCode('ABC234'))!.paused_at).toBe(iso(T0))
  })

  it('pauseGame refuses a game that has not started or has ended', async () => {
    const g = await startedGame()
    await store.updateGame(g.id, { started_at: null })
    expect(await store.pauseGame(g.id)).toBe(false)
    await store.updateGame(g.id, { started_at: iso(T0), ended_at: iso(T0) })
    expect(await store.pauseGame(g.id)).toBe(false)
  })

  it('resumeGame shifts only unrevealed pings and records the pause', async () => {
    const g = await startedGame()
    await store.addPings([
      { game_id: g.id, seq: 1, alert_at: iso(T0 + 4 * MIN), reveal_at: iso(T0 + 5 * MIN), alerted: true, revealed: true },
      { game_id: g.id, seq: 2, alert_at: iso(T0 + 9 * MIN), reveal_at: iso(T0 + 10 * MIN), alerted: false, revealed: false },
    ])
    await store.pauseGame(g.id)
    now = T0 + 90_000
    expect(await store.resumeGame(g.id)).toBe(90_000)
    const [p1, p2] = await store.pings(g.id)
    expect(p1.reveal_at).toBe(iso(T0 + 5 * MIN))
    expect(p2.alert_at).toBe(iso(T0 + 9 * MIN + 90_000))
    expect(p2.reveal_at).toBe(iso(T0 + 10 * MIN + 90_000))
    const after = (await store.gameByCode('ABC234'))!
    expect(after.paused_at).toBeNull()
    expect(after.pauses).toEqual([{ from: iso(T0), to: iso(T0 + 90_000) }])
    expect(await store.resumeGame(g.id)).toBeNull()
  })

  it('setFlag reports only real changes', async () => {
    const g = await startedGame()
    const p = await newPlayer(g.id, 'Aina')
    expect(await store.setFlag(p.id, 'outside', true)).toBe(true)
    expect(await store.setFlag(p.id, 'outside', true)).toBe(false)
    expect(await store.setFlag(p.id, 'outside', false)).toBe(true)
    expect(await store.setFlag(p.id, 'left_start', false)).toBe(false)
  })

  it('removed players vanish from players() but not from playerByToken()', async () => {
    const g = await startedGame()
    const p = await newPlayer(g.id, 'Aina')
    await newPlayer(g.id, 'Ben')
    expect(await store.removePlayer(p.id)).toBe(true)
    expect(await store.removePlayer(p.id)).toBe(false)
    expect((await store.players(g.id)).map((x) => x.name)).toEqual(['Ben'])
    expect((await store.playerByToken(g.id, 't-Aina'))!.removed_at).toBe(iso(T0))
  })

  it('addEvent returns the stored event', async () => {
    const g = await startedGame()
    const e = await store.addEvent({ game_id: g.id, type: 'sos', actor_id: null, target_id: null, data: {} })
    expect(e).toMatchObject({ type: 'sos', at: iso(T0) })
    expect((await store.events(g.id))[0].id).toBe(e.id)
  })
})
