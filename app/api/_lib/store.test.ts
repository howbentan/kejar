// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/types.js'
import { iso, MIN, T0 } from '../../shared/fixtures.js'
import { readFileSync } from 'node:fs'
import { MemoryStore, WIPE_EVENT_KEYS } from './store.js'

let now: number
let store: MemoryStore

beforeEach(() => {
  now = T0
  store = new MemoryStore(() => now)
})

async function startedGame(code = 'ABC234') {
  return store.createGame({
    code,
    arena: { id: 'a', name: 'a', boundary: [], jail: { lat: 0, lng: 0 }, start: { lat: 0, lng: 0 } },
    settings: { ...DEFAULT_SETTINGS },
    started_at: iso(T0),
    ended_at: null,
    winner: null,
    paused_at: null,
    pauses: [],
    final_whistle_at: null,
    wiped_at: null,
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
    freed_at: null,
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

  it('claimPing alerted records alert_sent_at once; revealed leaves it alone', async () => {
    const g = await startedGame()
    await store.addPings([3, 4].map((seq) => ({ game_id: g.id, seq, alert_at: iso(T0), reveal_at: iso(T0 + MIN), alerted: false, revealed: false, alert_sent_at: null })))
    now = T0 + 20_000
    expect(await store.claimPing(g.id, 3, 'alerted')).toBe(true)
    expect((await store.pings(g.id)).find((p) => p.seq === 3)!.alert_sent_at).toBe(iso(T0 + 20_000))
    now = T0 + 40_000
    expect(await store.claimPing(g.id, 3, 'alerted')).toBe(false)
    expect((await store.pings(g.id)).find((p) => p.seq === 3)!.alert_sent_at).toBe(iso(T0 + 20_000))
    expect(await store.claimPing(g.id, 4, 'revealed')).toBe(true)
    expect((await store.pings(g.id)).find((p) => p.seq === 4)!.alert_sent_at).toBeNull()
  })

  it('resumeGame leaves the alert time of a ping that already alerted alone', async () => {
    const g = await startedGame()
    await store.addPings([
      { game_id: g.id, seq: 2, alert_at: iso(T0 + 9 * MIN), reveal_at: iso(T0 + 10 * MIN), alerted: true, revealed: false, alert_sent_at: iso(T0 + 9 * MIN) },
    ])
    await store.pauseGame(g.id)
    now = T0 + 90_000
    await store.resumeGame(g.id)
    const [p2] = await store.pings(g.id)
    expect(p2.alert_at).toBe(iso(T0 + 9 * MIN))
    expect(p2.reveal_at).toBe(iso(T0 + 10 * MIN + 90_000))
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

  it('markOutside warns, then disqualifies, then changes nothing; clearOutWarning resets only a warning', async () => {
    const g = await startedGame()
    const p = await newPlayer(g.id, 'Aina')
    const at1 = iso(T0 + MIN)
    const at2 = iso(T0 + 2 * MIN)
    expect(await store.markOutside(p.id, at1)).toBe('warned')
    expect((await store.players(g.id))[0].out_warned_at).toBe(at1)
    await store.clearOutWarning(p.id)
    expect((await store.players(g.id))[0].out_warned_at).toBeNull()
    expect(await store.markOutside(p.id, at1)).toBe('warned')
    expect(await store.markOutside(p.id, at2)).toBe('disqualified')
    expect((await store.players(g.id))[0].disqualified_at).toBe(at2)
    expect(await store.markOutside(p.id, iso(T0 + 3 * MIN))).toBe('unchanged')
    await store.clearOutWarning(p.id)
    const after = (await store.players(g.id))[0]
    expect(after.out_warned_at).toBe(at1)
    expect(after.disqualified_at).toBe(at2)
  })

  it('markOutside leaves a jailed player alone, and catchRunner refuses a disqualified one', async () => {
    const g = await startedGame()
    const jailed = await newPlayer(g.id, 'Aina')
    await store.updatePlayers([{ id: jailed.id, patch: { jailed: true } }])
    expect(await store.markOutside(jailed.id, iso(T0))).toBe('unchanged')
    expect((await store.players(g.id)).find((p) => p.id === jailed.id)!.out_warned_at).toBeFalsy()
    const dq = await newPlayer(g.id, 'Ben')
    await store.markOutside(dq.id, iso(T0))
    expect(await store.markOutside(dq.id, iso(T0 + 30_000))).toBe('disqualified')
    expect(await store.catchRunner(dq.id, null)).toBe(false)
    expect((await store.players(g.id)).find((p) => p.id === dq.id)!.jailed).toBe(false)
  })

  it('markOutside disqualifies only 30 s or more after the warning', async () => {
    const g = await startedGame()
    const p = await newPlayer(g.id, 'Aina')
    expect(await store.markOutside(p.id, iso(T0))).toBe('warned')
    expect(await store.markOutside(p.id, iso(T0 + 1_000))).toBe('unchanged')
    expect(await store.markOutside(p.id, iso(T0 + 29_000))).toBe('unchanged')
    expect((await store.players(g.id))[0].disqualified_at).toBeFalsy()
    expect(await store.markOutside(p.id, iso(T0 + 30_000))).toBe('disqualified')
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

  it('releaseCaught frees only for the catching chaser, leaves freed_once alone, and only the first call wins', async () => {
    const g = await startedGame()
    const p = await newPlayer(g.id, 'Aina')
    await store.catchRunner(p.id, 'c1')
    await store.updatePlayers([{ id: p.id, patch: { freed_once: true } }])
    now = T0 + MIN
    expect(await store.releaseCaught(p.id, 'c2', iso(now))).toBe(false)
    expect((await store.players(g.id))[0].jailed).toBe(true)
    expect(await store.releaseCaught(p.id, 'c1', iso(now))).toBe(true)
    expect(await store.releaseCaught(p.id, 'c1', iso(now))).toBe(false)
    const after = (await store.players(g.id))[0]
    expect(after).toMatchObject({ jailed: false, caught_by: null, caught_at: null, freed_at: iso(now), freed_once: true })
  })

  it('releaseCaught never frees an auto-jailed runner', async () => {
    const g = await startedGame()
    const p = await newPlayer(g.id, 'Aina')
    await store.catchRunner(p.id, null)
    expect(await store.releaseCaught(p.id, 'c1', iso(now))).toBe(false)
  })

  it('claimFinalWhistle is true only the first time, never once ended, and clearFinalWhistle re-arms it', async () => {
    const g = await startedGame()
    expect(await store.claimFinalWhistle(g.id, iso(T0 + MIN))).toBe(true)
    expect(await store.claimFinalWhistle(g.id, iso(T0 + 2 * MIN))).toBe(false)
    expect((await store.gameByCode('ABC234'))!.final_whistle_at).toBe(iso(T0 + MIN))
    await store.clearFinalWhistle(g.id)
    expect((await store.gameByCode('ABC234'))!.final_whistle_at).toBeNull()
    await store.claimEnd(g.id, 'runners')
    expect(await store.claimFinalWhistle(g.id, iso(T0 + 3 * MIN))).toBe(false)
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
      final_whistle_at: null,
      wiped_at: null,
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

  it('two concurrent phone-move redeems: only one wins, and the player keeps the winning token', async () => {
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
      final_whistle_at: null,
      wiped_at: null,
      organiser_id: organiser.id,
    })
    const player = await store.addPlayer({
      game_id: game.id, name: 'Aina', role: 'runner', tag_id: null, accepted_at: new Date(1_000).toISOString(),
      caught_at: null, caught_by: null, jailed: false, freed_once: false, freed_at: null,
      push: { endpoint: 'https://push/Aina' }, removed_at: null, outside: false, left_start: false, token_hash: 'old',
    })
    await store.createPhoneMove({
      game_id: game.id,
      player_id: player.id,
      token_hash: 'ptok1',
      created_at: new Date(1_000).toISOString(),
      expires_at: new Date(2_000).toISOString(),
      redeemed_at: null,
    })
    const results = await Promise.all([
      store.redeemPhoneMove('ptok1', 1_500, game.id, 'newA'),
      store.redeemPhoneMove('ptok1', 1_500, game.id, 'newB'),
    ])
    expect(results.filter((r) => r.ok)).toEqual([{ ok: true, playerId: player.id }])
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'redeemed' }])
    const winner = results[0].ok ? 'newA' : 'newB'
    expect(await store.playerByToken(game.id, 'old')).toBeNull()
    expect(await store.playerByToken(game.id, winner)).toMatchObject({ id: player.id, push: null })
    expect(await store.redeemPhoneMove('nope', 1_500, game.id, 'x')).toEqual({ ok: false, reason: 'invalid' })
    expect(await store.redeemPhoneMove('ptok1', 2_500, game.id, 'x')).toEqual({ ok: false, reason: 'redeemed' })
  })
})

describe('saved arenas', () => {
  const arena = { id: 'x', name: 'Park', boundary: [], jail: { lat: 0, lng: 0 }, start: { lat: 0, lng: 0 } }
  const draft = {
    name: 'Park', source: 'circle' as const, osmRef: null, outline: null, circle: { center: { lat: 0, lng: 0 }, radiusM: 200 },
    water: [], toilets: [], waterChecked: true, jail: null, start: null, stations: [],
  }
  const add = (org: string, name: string) => store.addArena({ organisation_id: org, name, draft, arena, water_checked: true })

  it('arenas are listed per organisation, newest first', async () => {
    await add('o1', 'KLCC')
    now += MIN
    const b = await add('o1', 'Titiwangsa')
    await add('o2', 'Elsewhere')
    expect((await store.arenasFor('o1')).map((a) => a.name)).toEqual(['Titiwangsa', 'KLCC'])
    expect((await store.arenaById(b.id))!.organisation_id).toBe('o1')
    await store.deleteArena(b.id)
    expect(await store.arenaById(b.id)).toBeNull()
  })

  it('updateArena bumps updated_at', async () => {
    const a = await add('o1', 'KLCC')
    now += 5 * MIN
    await store.updateArena(a.id, { name: 'KLCC Park', water_checked: false })
    const after = (await store.arenaById(a.id))!
    expect(after).toMatchObject({ name: 'KLCC Park', water_checked: false, created_at: iso(T0), updated_at: iso(T0 + 5 * MIN) })
  })

  it('osm cache returns nothing once older than maxAge', async () => {
    await store.osmCachePut('k', { hits: 1 })
    now += 10_000
    expect(await store.osmCacheGet('k', 60_000)).toEqual({ hits: 1 })
    now += 60_000
    expect(await store.osmCacheGet('k', 60_000)).toBeNull()
    await store.osmCachePut('k', { hits: 2 })
    expect(await store.osmCacheGet('k', 60_000)).toEqual({ hits: 2 })
  })
})

describe('drawCard', () => {
  it("counts each side's draws separately, starting at 0", async () => {
    const g = await startedGame()
    expect(await store.drawCard(g.id, 'runner')).toBe(0)
    expect(await store.drawCard(g.id, 'runner')).toBe(1)
    expect(await store.drawCard(g.id, 'chaser')).toBe(0)
  })

  it('never hands two simultaneous draws the same number', async () => {
    const g = await startedGame()
    const got = await Promise.all(Array.from({ length: 5 }, () => store.drawCard(g.id, 'runner')))
    expect([...got].sort()).toEqual([0, 1, 2, 3, 4])
  })
})

describe('Abang Grab', () => {
  async function grab() {
    const g = await startedGame()
    const u = await store.addPowerUp({ game_id: g.id, player_id: 'p1', kind: 'grab', station: 1 })
    return { g, u }
  }

  it('reserves n draws at once and returns the first, once per Grab', async () => {
    const { g, u } = await grab()
    await store.drawCard(g.id, 'runner')
    expect(await store.openGrab(u.id, 'runner', 3)).toEqual({ first: 1, offer: null })
    await store.updatePowerUp(u.id, { offer: ['shield', 'cloak', 'decoy'] })
    expect(await store.openGrab(u.id, 'runner', 3)).toEqual({ first: 1, offer: ['shield', 'cloak', 'decoy'] })
    expect(await store.drawCard(g.id, 'runner')).toBe(4)
  })

  it('two simultaneous opens reserve once', async () => {
    const { g, u } = await grab()
    const [a, b] = await Promise.all([store.openGrab(u.id, 'chaser', 3), store.openGrab(u.id, 'chaser', 3)])
    expect(a).toEqual(b)
    expect(await store.drawCard(g.id, 'chaser')).toBe(3)
  })

  it('a pick on a Grab that Toyol or Ah Long took says taken', async () => {
    const { u } = await grab()
    await store.updatePowerUp(u.id, { offer: ['shield', 'cloak', 'decoy'], taken_at: iso(T0) })
    expect(await store.pickGrab(u.id, 'p1', 0)).toEqual({ ok: false, reason: 'taken' })
  })

  it("won't open a Grab that was used or taken", async () => {
    const { u } = await grab()
    await store.updatePowerUp(u.id, { taken_at: iso(T0) })
    expect(await store.openGrab(u.id, 'runner', 3)).toBeNull()
  })

  it('a pick marks the Grab used and adds the sealed, station-less card; a second pick is refused', async () => {
    const { g, u } = await grab()
    await store.updatePowerUp(u.id, { offer: ['shield', 'cloak', 'decoy'] })
    expect(await store.pickGrab(u.id, 'p2', 0)).toEqual({ ok: false, reason: 'not-yours' })
    expect(await store.pickGrab(u.id, 'p1', 3)).toEqual({ ok: false, reason: 'bad-choice' })
    const r = await store.pickGrab(u.id, 'p1', 2)
    expect(r).toMatchObject({ ok: true, powerUp: { player_id: 'p1', kind: 'decoy', sealed: true, station: null, used_at: null } })
    expect(await store.pickGrab(u.id, 'p1', 1)).toEqual({ ok: false, reason: 'already-used' })
    const rows = await store.powerUps(g.id)
    expect(rows.find((x) => x.id === u.id)!.used_at).not.toBeNull()
    expect(rows).toHaveLength(2)
  })
})

describe('MemoryStore.hitRateLimit', () => {
  it('allows the 120th call in a window and refuses the 121st', async () => {
    for (let i = 1; i <= 120; i++) expect(await store.hitRateLimit('k', 60_000, 120)).toBe(true)
    expect(await store.hitRateLimit('k', 60_000, 120)).toBe(false)
  })

  it('starts again at 1 in a new window', async () => {
    for (let i = 0; i < 121; i++) await store.hitRateLimit('k', 60_000, 120)
    now += 60_000
    expect(await store.hitRateLimit('k', 60_000, 1)).toBe(true)
    expect(await store.hitRateLimit('k', 60_000, 1)).toBe(false)
  })

  it('counts different keys separately', async () => {
    expect(await store.hitRateLimit('a', 60_000, 1)).toBe(true)
    expect(await store.hitRateLimit('a', 60_000, 1)).toBe(false)
    expect(await store.hitRateLimit('b', 60_000, 1)).toBe(true)
  })
})

describe('MemoryStore.addPosition gap', () => {
  const pos = { lat: 3, lng: 101, accuracy_m: 5 }
  it('refuses a second fix inside the gap, accepts one after it, and always accepts with no gap', async () => {
    expect(await store.addPosition('g', 'p', pos, 2_000)).toBe(true)
    now += 1_000
    expect(await store.addPosition('g', 'p', pos, 2_000)).toBe(false)
    expect(await store.addPosition('g', 'p', pos)).toBe(true)
    now += 2_000
    expect(await store.addPosition('g', 'p', pos, 2_000)).toBe(true)
  })

  it('lets two simultaneous calls through only once', async () => {
    const r = await Promise.all([store.addPosition('g', 'p', pos, 2_000), store.addPosition('g', 'p', pos, 2_000)])
    expect(r.filter(Boolean)).toHaveLength(1)
  })

  it('only counts rows at or after `since` against the gap', async () => {
    const t0 = now
    expect(await store.addPosition('g', 'p', pos, 2_000)).toBe(true)
    now += 1_000
    // The earlier row is before `since`, so it doesn't block this one.
    expect(await store.addPosition('g', 'p', pos, 2_000, t0 + 500)).toBe(true)
    now += 500
    // Now a row sits at or after `since`, so the gap applies again.
    expect(await store.addPosition('g', 'p', pos, 2_000, t0 + 500)).toBe(false)
    // A row exactly at `since` counts too.
    expect(await store.addPosition('g', 'p', pos, 2_000, t0 + 1_000)).toBe(false)
  })
})

describe('MemoryStore secret card sets', () => {
  it('the first read of a secret card set makes six ready cards: A-C yellow and A-C purple', async () => {
    const cards = await store.secretCards('org1')
    expect(cards.map((c) => `${c.legendary}:${c.letter}`).sort()).toEqual(['bomoh:A', 'bomoh:B', 'bomoh:C', 'dato:A', 'dato:B', 'dato:C'])
    for (const c of cards) {
      expect(c).toMatchObject({ organisation_id: 'org1', state: 'ready', found_at: null })
      expect(c.code).toMatch(/^[A-Za-z0-9_-]{22}$/)
    }
    expect(new Set(cards.map((c) => c.code)).size).toBe(6)
    // A second read finds the same six, and another organisation has its own.
    expect(await store.secretCards('org1')).toEqual(cards)
    const other = await store.secretCards('org2')
    expect(other).toHaveLength(6)
    expect(other.some((c) => cards.some((x) => x.id === c.id || x.code === c.code))).toBe(false)
  })

  it('setSecretCard changes only the fields given', async () => {
    const [card] = await store.secretCards('org1')
    await store.setSecretCard(card.id, { state: 'retired', found_at: iso(T0) })
    const after = (await store.secretCards('org1')).find((c) => c.id === card.id)!
    expect(after).toEqual({ ...card, state: 'retired', found_at: iso(T0) })
  })

  it('unfinishedGames lists the games of every organiser in the organisation that have not ended, and started or are recent', async () => {
    const org = await store.createOrganisation({ name: 'o', created_at: iso(T0) })
    const mk = (name: string) =>
      store.createOrganiser({ organisation_id: org.id, name, created_at: iso(T0), session_token_hash: name, session_created_at: iso(T0) })
    const a = await mk('a')
    const b = await mk('b')
    const base = (await startedGame()) as unknown as Record<string, unknown>
    const { id: _id, ...rest } = base
    const g1 = await store.createGame({ ...(rest as never), code: 'AAA222', organiser_id: a.id })
    const g2 = await store.createGame({ ...(rest as never), code: 'BBB222', organiser_id: b.id })
    await store.createGame({ ...(rest as never), code: 'CCC222', organiser_id: b.id, ended_at: iso(T0) })
    const oldLobby = await store.createGame({ ...(rest as never), code: 'DDD222', organiser_id: b.id, started_at: null })
    expect((await store.unfinishedGames(org.id, iso(T0 - 1))).map((g) => g.id).sort()).toEqual([g1.id, g2.id, oldLobby.id].sort())
    // Made before the cutoff: only the started games are left, and a lobby whose stash is dropped.
    expect((await store.unfinishedGames(org.id, iso(T0))).map((g) => g.id).sort()).toEqual([g1.id, g2.id].sort())
    await store.updateGame(oldLobby.id, { dato_stash: { code: 'c', lat: 1, lng: 2, claimedBy: null, claimedAt: null } })
    expect((await store.unfinishedGames(org.id, iso(T0))).map((g) => g.id).sort()).toEqual([g1.id, g2.id, oldLobby.id].sort())
    // Same for a dropped-but-unclaimed Bomoh stash: an old lobby holding one is still worth listing.
    const oldLobby2 = await store.createGame({ ...(rest as never), code: 'EEE222', organiser_id: b.id, started_at: null })
    expect((await store.unfinishedGames(org.id, iso(T0))).map((g) => g.id).sort()).toEqual([g1.id, g2.id, oldLobby.id].sort())
    await store.updateGame(oldLobby2.id, { bomoh_stash: { code: 'd', lat: 3, lng: 4, claimedBy: null, claimedAt: null } })
    expect((await store.unfinishedGames(org.id, iso(T0))).map((g) => g.id).sort()).toEqual([g1.id, g2.id, oldLobby.id, oldLobby2.id].sort())
  })
})

describe('MemoryStore.setKitKey', () => {
  it('sets and removes one key, keeping the rest, even with no kit yet', async () => {
    const g = await startedGame()
    await store.setKitKey(g.id, 'ticks', 'tape', 'Tape')
    await store.setKitKey(g.id, 'placed', 'station-1', true)
    await store.setKitKey(g.id, 'ticks', 'penjara', 'Penjara card')
    expect((await store.gameByCode('ABC234'))!.kit).toEqual({ ticks: { tape: 'Tape', penjara: 'Penjara card' }, placed: { 'station-1': true } })
    await store.setKitKey(g.id, 'ticks', 'tape', null)
    await store.setKitKey(g.id, 'placed', 'nope', null)
    expect((await store.gameByCode('ABC234'))!.kit).toEqual({ ticks: { penjara: 'Penjara card' }, placed: { 'station-1': true } })
  })
})

describe('MemoryStore.claimBomoh', () => {
  const dropped = { code: 'bomoh-code', lat: 1, lng: 2, claimedBy: null, claimedAt: null }

  it('goes to one of two simultaneous claims, stamps the stash, and inserts no powerups row', async () => {
    const g = await startedGame()
    await store.updateGame(g.id, { bomoh_stash: dropped })
    const results = await Promise.all([store.claimBomoh(g.id, 'p1', new Date(now)), store.claimBomoh(g.id, 'p2', new Date(now))])
    expect(results.filter((r) => r === true)).toHaveLength(1)
    const stash = (await store.gameByCode('ABC234'))!.bomoh_stash!
    expect(['p1', 'p2']).toContain(stash.claimedBy)
    expect(stash.claimedAt).toBe(iso(T0))
    expect(await store.powerUps(g.id)).toEqual([])
  })

  it('refuses a stash that was never dropped, is already claimed, or belongs to no game', async () => {
    const g = await startedGame()
    await store.updateGame(g.id, { bomoh_stash: { ...dropped, lat: null, lng: null } })
    expect(await store.claimBomoh(g.id, 'p1', new Date(now))).toBe(false)
    await store.updateGame(g.id, { bomoh_stash: { ...dropped, claimedBy: 'p0', claimedAt: iso(T0) } })
    expect(await store.claimBomoh(g.id, 'p1', new Date(now))).toBe(false)
    expect(await store.claimBomoh('no-such-game', 'p1', new Date(now))).toBe(false)
  })
})

describe('wiping a game', () => {
  const NAMES = ['Aina', 'Hafiz', 'Ben', 'Siti']
  async function playedGame() {
    const g = await startedGame()
    const mk = async (name: string, role: 'runner' | 'chaser' | 'marshal') => {
      const p = await store.addPlayer({ ...(await newPlayerRow(g.id, name)), role, push: { endpoint: `https://push/${name}` } })
      await store.addPosition(g.id, p.id, { lat: 3.1, lng: 101.1, accuracy_m: 5 })
      return p
    }
    const aina = await mk('Aina', 'runner')
    const hafiz = await mk('Hafiz', 'runner')
    const ben = await mk('Ben', 'chaser')
    const siti = await mk('Siti', 'marshal')
    const ev = (type: string, data: Record<string, unknown>, actor: string | null = null, target: string | null = null) =>
      store.addEvent({ game_id: g.id, type, actor_id: actor, target_id: target, data })
    await ev('caught', { flagged: false, who: 'Aina #07', chaser: 'Ben' }, ben.id, aina.id)
    await ev('caught', { flagged: false, who: 'Hafiz #03', chaser: 'Ben' }, ben.id, hafiz.id)
    await ev('sos', { who: 'Aina', lat: 3.1, lng: 101.1, text: 'a man is following me' }, aina.id)
    await ev('report', { name: 'Aina', targetName: 'Ben', reason: 'rude', note: 'shouted at me' }, aina.id, ben.id)
    await ev('out-warned', { who: 'Hafiz' }, hafiz.id)
    await ev('handled', { eventId: 'e1', name: 'Siti', outcome: 'ok' }, siti.id)
    await ev('removed', { name: 'Ben' }, siti.id, ben.id)
    await ev('ended', { winner: 'chasers' })
    await store.addSafetyRecord({
      game_id: g.id, type: 'sos', player_id: aina.id, target_id: null, lat: 3.1, lng: 101.1,
      data: { game_code: 'ABC234', name: 'Aina', note: 'a man is following me' },
    })
    await store.addPowerUp({ game_id: g.id, player_id: aina.id, kind: 'shield', station: 1 })
    await store.addPings([{ game_id: g.id, seq: 1, alert_at: iso(T0), reveal_at: iso(T0), alerted: true, revealed: true } as never])
    await store.createPhoneMove({ game_id: g.id, player_id: aina.id, token_hash: 'pm-secret', created_at: iso(T0), expires_at: iso(T0 + MIN), redeemed_at: null })
    await store.createMarshalInvite({ game_id: g.id, token_hash: 'mi-secret', created_at: iso(T0), expires_at: iso(T0 + MIN), redeemed_at: null })
    await store.updateGame(g.id, { ended_at: iso(T0 + 45 * MIN), winner: 'chasers', host_push: { endpoint: 'https://push/host' } })
    return g
  }
  const newPlayerRow = async (gameId: string, name: string) => ({
    game_id: gameId, name, role: 'runner' as const, tag_id: null, accepted_at: iso(T0), caught_at: null, caught_by: null,
    jailed: false, freed_once: false, freed_at: null, push: null, removed_at: null, outside: false, left_start: false, token_hash: `t-${name}`,
  })
  const dump = async (id: string) => {
    const s = store as unknown as Record<string, unknown>
    return JSON.stringify([
      await store.players(id), await store.events(id), await store.powerUps(id), await store.pings(id),
      (await store.gameByCode('ABC234')), s.locs, s.safetyRows, s.phoneMoveRows, s.marshalInviteRows, s.playerRows, s.games,
    ])
  }

  it('leaves no name, SOS text, token or location behind, numbers players by join order, and only runs once', async () => {
    const g = await playedGame()
    expect(await dump(g.id)).toContain('a man is following me')
    expect(await store.wipeGame(g.id)).toBe(true)
    const left = await dump(g.id)
    for (const secret of [...NAMES, 'following me', 'shouted', 'pm-secret', 'mi-secret', 'https://push', 't-Aina', '3.1,']) {
      expect(left, secret).not.toContain(secret)
    }
    expect((await store.players(g.id)).map((p) => p.name)).toEqual(['Dikejar 1', 'Dikejar 2', 'Kejar 1', 'Marshal 1'])
    expect((await store.gameByCode('ABC234'))!.wiped_at).toBe(iso(T0))
    expect((await store.events(g.id)).find((e) => e.type === 'ended')!.data).toEqual({ winner: 'chasers' })
    expect((await store.events(g.id)).find((e) => e.type === 'caught')!.data).toEqual({ flagged: false })
    expect(await store.wipeGame(g.id)).toBe(false)
  })

  it('gives every player a fresh token, so an old session link no longer works', async () => {
    const g = await playedGame()
    await store.wipeGame(g.id)
    expect(await store.playerByToken(g.id, 't-Aina')).toBeNull()
  })

  it('gamesToWipe lists ended, unwiped games older than the cut-off, oldest first, up to the limit', async () => {
    const old = await playedGame()
    const young = await startedGame('YNG234')
    await store.updateGame(young.id, { ended_at: iso(T0 + 20 * MIN) })
    const never = await startedGame('NVR234')
    expect(await store.gamesToWipe(iso(T0 + 30 * MIN), 5)).toEqual([young.id])
    expect(await store.gamesToWipe(iso(T0 + 60 * MIN), 5)).toEqual([young.id, old.id])
    expect(await store.gamesToWipe(iso(T0 + 60 * MIN), 1)).toEqual([young.id])
    await store.wipeGame(young.id)
    expect(await store.gamesToWipe(iso(T0 + 60 * MIN), 5)).toEqual([old.id])
    expect(never.id).toBeTruthy()
  })

  it('strips the same event keys in the SQL as in the store', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/0016_fair_play.sql', import.meta.url), 'utf8')
    const body = sql.slice(sql.indexOf('function wipe_game'))
    const listed = [...body.matchAll(/array\[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((k) => k[1]))
    expect([...listed].sort()).toEqual([...WIPE_EVENT_KEYS].sort())
  })
})
