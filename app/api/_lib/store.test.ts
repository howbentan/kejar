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
    organiser_id: 'test-organiser',
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

describe('organiser accounts', () => {
  it('creates an organisation and an organiser in it', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    const organiser = await store.createOrganiser({
      organisation_id: org.id,
      name: 'Owner',
      created_at: new Date(1_000).toISOString(),
      session_token_hash: 'hash1',
      session_created_at: new Date(1_000).toISOString(),
    })
    expect(await store.organiserBySessionTokenHash('hash1')).toMatchObject({ id: organiser.id, name: 'Owner' })
    expect(await store.organiserBySessionTokenHash('nope')).toBeNull()
  })

  it('redeems an organiser invite once, creating a new organiser', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    await store.createOrganiserInvite({
      organisation_id: org.id,
      organiser_id: null,
      name: 'Partner',
      token_hash: 'tok1',
      created_at: new Date(1_000).toISOString(),
      expires_at: new Date(2_000).toISOString(),
      redeemed_at: null,
    })
    const first = await store.redeemOrganiserInvite('tok1', 1_500, 'session1')
    expect(first.ok).toBe(true)
    const second = await store.redeemOrganiserInvite('tok1', 1_500, 'session2')
    expect(second).toEqual({ ok: false, reason: 'redeemed' })
  })

  it('refuses an expired organiser invite', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    await store.createOrganiserInvite({
      organisation_id: org.id,
      organiser_id: null,
      name: 'Partner',
      token_hash: 'tok1',
      created_at: new Date(1_000).toISOString(),
      expires_at: new Date(2_000).toISOString(),
      redeemed_at: null,
    })
    expect(await store.redeemOrganiserInvite('tok1', 2_500, 'session1')).toEqual({ ok: false, reason: 'expired' })
  })

  it('refuses an unknown invite token', async () => {
    const store = new MemoryStore(() => 1_000)
    expect(await store.redeemOrganiserInvite('nope', 1_000, 'session1')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('a re-link invite (organiser_id set) overwrites that organiser\'s session instead of creating a new one', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    const organiser = await store.createOrganiser({
      organisation_id: org.id,
      name: 'Owner',
      created_at: new Date(1_000).toISOString(),
      session_token_hash: 'oldHash',
      session_created_at: new Date(1_000).toISOString(),
    })
    await store.createOrganiserInvite({
      organisation_id: org.id,
      organiser_id: organiser.id,
      name: 'Owner',
      token_hash: 'relink1',
      created_at: new Date(1_000).toISOString(),
      expires_at: new Date(2_000).toISOString(),
      redeemed_at: null,
    })
    const result = await store.redeemOrganiserInvite('relink1', 1_500, 'newHash')
    expect(result).toEqual({ ok: true, organiserId: organiser.id })
    expect(await store.organiserBySessionTokenHash('oldHash')).toBeNull()
    expect(await store.organiserBySessionTokenHash('newHash')).toMatchObject({ id: organiser.id })
  })

  it('redeems a marshal invite once', async () => {
    const store = new MemoryStore(() => 1_000)
    const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(1_000).toISOString() })
    const organiser = await store.createOrganiser({
      organisation_id: org.id,
      name: 'Owner',
      created_at: new Date(1_000).toISOString(),
      session_token_hash: 'h',
      session_created_at: new Date(1_000).toISOString(),
    })
    const game = await store.createGame({
      code: 'ABC234',
      arena: { id: 'a', name: 'A', boundary: [], jail: { lat: 0, lng: 0 }, start: { lat: 0, lng: 0 } },
      settings: { lengthMin: 45, hideMin: 5, pingMin: 5, spectatorDelayMin: 2, checkinMode: 'push' },
      started_at: null,
      ended_at: null,
      winner: null,
      paused_at: null,
      pauses: [],
      organiser_id: organiser.id,
    })
    await store.createMarshalInvite({
      game_id: game.id,
      token_hash: 'mtok1',
      created_at: new Date(1_000).toISOString(),
      expires_at: new Date(2_000).toISOString(),
      redeemed_at: null,
    })
    const first = await store.redeemMarshalInvite('mtok1', 1_500, game.id)
    expect(first).toEqual({ ok: true, gameId: game.id })
    expect(await store.redeemMarshalInvite('mtok1', 1_500, game.id)).toEqual({ ok: false, reason: 'redeemed' })
  })
})
