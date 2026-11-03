import { describe, expect, it } from 'vitest'
import { event, game, iso, MIN, ping, player, pos, T0 } from './fixtures.js'
import { distanceM } from './geo.js'
import { DEFAULT_SETTINGS, type Player, type Position, type PowerUp } from './types.js'
import { BONUS_SEQ_BASE, SCHEDULED_ALERT_LEAD_MS } from './clock.js'
import { CHASER_SNAPSHOT_FUZZ_M, LEGENDARY_ZONE_M, viewFor } from './views.js'

const g = game()
const NOW = T0 + 16 * MIN // chase started at +5; pings revealed at +10 and +15
const pings = [ping(1, T0 + 10 * MIN), ping(2, T0 + 15 * MIN)]

const chaser = player('c1', 'chaser', { name: 'Ben' })
const aina = player('r1', 'runner', { name: 'Aina', tag_id: 7 })
const hafiz = player('r2', 'runner', { name: 'Hafiz', tag_id: 3 })
const wei = player('r3', 'runner', { name: 'Wei', tag_id: 14 })
const siti = player('m1', 'marshal', { name: 'Siti' })
const players = [chaser, aina, hafiz, wei, siti]

const A = { lat: 3.002, lng: 101.002 }
const B = { lat: 3.004, lng: 101.004 }
const positions: Record<string, Position[]> = {
  c1: [pos(3.005, 101.005, NOW - 5_000)],
  r1: [pos(A.lat, A.lng, T0 + 14.9 * MIN), pos(B.lat, B.lng, T0 + 15.5 * MIN)],
  r2: [pos(3.003, 101.003, T0 + 9 * MIN)],
  m1: [pos(3.006, 101.006, NOW - 2_000)],
}

const view = (me: Player, over: Partial<Parameters<typeof viewFor>[0]> = {}) =>
  viewFor({ game: g, me, players, positions, pings, events: [], now: NOW, results: null, powerUps: [], ...over })

describe('chaser view', () => {
  it('chaser sees runners fuzzed at the last reveal, not live', () => {
    const dot = view(chaser).dots.find((d) => d.id === 'r1')!
    expect(dot.kind).toBe('runner')
    expect(dot.fuzzy).toBe(true)
    expect(dot.label).toBe('#07')
    expect(distanceM(dot, A)).toBeLessThanOrEqual(15)
    expect(distanceM(dot, B)).toBeGreaterThan(100)
  })

  it('missed check-in shows last known position, flagged', () => {
    const dot = view(chaser).dots.find((d) => d.id === 'r2')!
    expect(dot.missed).toBe(true)
    expect(distanceM(dot, { lat: 3.003, lng: 101.003 })).toBeLessThanOrEqual(15)
  })

  it('a location sent before the 45 s window shows as missed, one inside it does not', () => {
    const at = (ms: number) => ({ ...positions, r2: [pos(3.003, 101.003, T0 + 15 * MIN - ms)] })
    expect(view(chaser, { positions: at(46_000) }).dots.find((d) => d.id === 'r2')!.missed).toBe(true)
    expect(view(chaser, { positions: at(30_000) }).dots.find((d) => d.id === 'r2')!.missed).toBeUndefined()
  })

  it('runner with no position at reveal is listed as never checked in', () => {
    const v = view(chaser)
    expect(v.dots.find((d) => d.id === 'r3')).toBeUndefined()
    expect(v.feed.map((f) => f.text)).toContain('#14 never checked in')
  })

  it('shows no runner dots before the first reveal', () => {
    const v = view(chaser, { pings: [], now: T0 + 6 * MIN })
    expect(v.dots.filter((d) => d.kind === 'runner')).toEqual([])
  })

  it('never shows jailed runners', () => {
    const jailed = { ...aina, jailed: true }
    const v = view(chaser, { players: [chaser, jailed, hafiz, wei, siti] })
    expect(v.dots.find((d) => d.id === 'r1')).toBeUndefined()
  })
})

describe('a just-jailed runner slides off before disappearing for good', () => {
  const caughtAt = T0 + 14 * MIN
  const lastSeenAt = T0 + 13.5 * MIN
  const positionsBeforeCaught = { ...positions, r1: [pos(A.lat, A.lng, lastSeenAt)] }

  it('a runner auto-jailed in the last 15s still has a dot, for the slide-off moment', () => {
    const jailed = { ...aina, jailed: true, caught_at: iso(caughtAt) }
    const v = view(chaser, { players: [chaser, jailed, hafiz, wei, siti], positions: positionsBeforeCaught, now: caughtAt + 5_000 })
    expect(v.dots.find((d) => d.id === 'r1')).toMatchObject({ lat: A.lat, lng: A.lng, caughtAt: iso(caughtAt) })
  })

  it('a runner jailed more than 15s ago has no dot, as today', () => {
    const jailed = { ...aina, jailed: true, caught_at: iso(caughtAt) }
    const v = view(chaser, { players: [chaser, jailed, hafiz, wei, siti], positions: positionsBeforeCaught, now: caughtAt + 20_000 })
    expect(v.dots.find((d) => d.id === 'r1')).toBeUndefined()
  })

  it('a runner whose auto-jail is undone mid-window does not keep sliding', () => {
    const unjailed = { ...aina, jailed: false, caught_at: iso(caughtAt) }
    const v = view(chaser, { players: [chaser, unjailed, hafiz, wei, siti], positions: positionsBeforeCaught, now: caughtAt + 5_000 })
    const dot = v.dots.find((d) => d.id === 'r1')
    expect(dot).toMatchObject({ kind: 'runner' }) // back to an ordinary free-runner dot, not mid-slide
    expect(dot?.caughtAt).toBeUndefined()
  })

  it('a marshal also sees a just-jailed runner mid-slide', () => {
    const jailed = { ...hafiz, jailed: true, caught_at: iso(caughtAt) }
    const v = view(siti, { players: [chaser, aina, jailed, wei, siti], now: caughtAt + 5_000 })
    expect(v.dots.find((d) => d.id === 'r2')).toMatchObject({ kind: 'runner', caughtAt: iso(caughtAt) })
  })

  it('a free runner viewing teammates also sees one mid-slide to Penjara', () => {
    const jailed = { ...hafiz, jailed: true, caught_at: iso(caughtAt) }
    const v = view(aina, { players: [chaser, aina, jailed, wei, siti], now: caughtAt + 5_000 })
    expect(v.dots.find((d) => d.id === 'r2')).toMatchObject({ kind: 'teammate', caughtAt: iso(caughtAt) })
  })
})

describe('runner view', () => {
  it('runner sees teammates but never chasers', () => {
    const v = view(aina)
    expect(v.dots.find((d) => d.id === 'r1')?.kind).toBe('me')
    expect(v.dots.find((d) => d.id === 'r2')?.kind).toBe('teammate')
    expect(v.dots.some((d) => d.kind === 'chaser')).toBe(false)
  })

  it('chaserNearby only when a fresh chaser fix is within 100 m', () => {
    const me = pos(3.0, 101.0, NOW - 5_000)
    const at = (dLat: number, ageMs: number) => ({ c1: [pos(3.0 + dLat, 101.0, NOW - ageMs)], r1: [me] })
    expect(view(aina, { positions: at(0.0008, 5_000) }).chaserNearby).toBe(true) // ~89 m, fresh
    expect(view(aina, { positions: at(0.0008, 2 * MIN) }).chaserNearby).toBe(false) // stale
    expect(view(aina, { positions: at(0.0011, 5_000) }).chaserNearby).toBe(false) // ~122 m
  })

  it('is never true for a chaser', () => {
    expect(view(chaser).chaserNearby).toBe(false)
  })
})

describe('marshal and jailed views', () => {
  it('marshal sees everyone live', () => {
    const v = view(siti)
    expect(v.dots.find((d) => d.id === 'r1')).toMatchObject({ kind: 'runner', lat: B.lat, lng: B.lng })
    expect(v.dots.find((d) => d.id === 'c1')?.kind).toBe('chaser')
  })

  it('jailed runner sees everyone delayed by the spectator delay', () => {
    const jailed = { ...hafiz, jailed: true }
    const ps = { ...positions, c1: [pos(3.001, 101.001, NOW - 3 * MIN), pos(3.009, 101.009, NOW - 1 * MIN)] }
    const v = view(jailed, { players: [chaser, aina, jailed, wei, siti], positions: ps })
    expect(v.dots.find((d) => d.id === 'c1')).toMatchObject({ lat: 3.001, lng: 101.001 })
  })

  it('a marshal sees the live position of a runner with an open SOS', () => {
    const events = [event('sos', T0, { actor_id: 'r1', data: { who: 'Aina #07' } })]
    const v = view(siti, { events, positions: { ...positions, r1: [pos(3.01, 101.01, T0 + MIN)] } })
    expect(v.sosPositions.r1).toEqual({ lat: 3.01, lng: 101.01 })
  })

  it('sosPositions is empty once the SOS is handled', () => {
    const events = [event('sos', T0, { actor_id: 'r1' }), event('handled', T0 + MIN, { data: { eventId: `sos-${T0}` } })]
    const v = view(siti, { events })
    expect(v.sosPositions).toEqual({})
  })

  it('sosPositions is empty for non-marshal roles even with an open SOS', () => {
    const events = [event('sos', T0, { actor_id: 'r1' })]
    const v = view(aina, { events, positions: { ...positions, r1: [pos(3.01, 101.01, T0 + MIN)] } })
    expect(v.sosPositions).toEqual({})
  })
})

describe('timers and counts', () => {
  it('gives the next alert and reveal during the chase', () => {
    const v = view(aina)
    expect(v.nextRevealAt).toBe(T0 + 20 * MIN)
    expect(v.nextAlertAt).toBe(T0 + 20 * MIN - SCHEDULED_ALERT_LEAD_MS)
  })
  it('counts free and jailed runners', () => {
    const v = view(chaser, { players: [chaser, { ...aina, jailed: true }, hafiz, wei, siti] })
    expect(v.counts).toEqual({ runnersFree: 2, runnersJailed: 1, chasers: 1 })
  })
})

describe('end of game and jail details', () => {
  it('shares the roster once the game has ended so results can show names', () => {
    const v = view(aina, { game: game({ ended_at: new Date(NOW).toISOString() }) })
    expect(v.roster.map((r) => r.name)).toContain('Ben')
  })
  it('hides the roster from players mid-game', () => {
    expect(view(aina).roster).toEqual([])
  })
  it('tells a jailed runner who caught them', () => {
    const jailed = { ...aina, jailed: true, caught_by: 'c1' }
    expect(view(jailed, { players: [chaser, jailed, hafiz, wei, siti] }).caughtBy).toBe('Ben')
    expect(view(aina).caughtBy).toBeNull()
  })
})

describe('ping moment', () => {
  it('tells every player when the last ping went out', () => {
    expect(view(aina).lastRevealAt).toBe(T0 + 15 * MIN)
    expect(view(chaser).lastRevealAt).toBe(T0 + 15 * MIN)
  })
  it('is null before the first ping', () => {
    expect(view(aina, { pings: [] }).lastRevealAt).toBeNull()
  })
})

describe('two-part feed', () => {
  const line = (me: Player, e: Parameters<typeof event>[2], type: Parameters<typeof event>[0]) =>
    view(me, { events: [event(type, T0 + 15.5 * MIN, e)] }).feed[0]
  const both = (type: Parameters<typeof event>[0], e: Parameters<typeof event>[2] = {}) => ({ runner: line(aina, e, type), chaser: line(chaser, e, type) })

  it('ping', () => {
    const { runner, chaser: c } = both('ping', { data: { seen: 5, missed: 1 } })
    expect(runner).toMatchObject({ text: 'Ping: 5 Dikejar seen, 1 missed check-in.', means: 'Kejar now know roughly where you were.', act: false, label: 'PING' })
    expect(c).toMatchObject({ means: 'Fresh circles are on your map.', act: false })
    expect(line(aina, { data: { seen: 5, missed: 0 } }, 'ping').text).toBe('Ping: 5 Dikejar seen.')
    expect(line(aina, { data: { seen: 3, missed: 2 } }, 'ping').text).toBe('Ping: 3 Dikejar seen, 2 missed check-ins.')
  })
  it('Mat Rempit', () => {
    const { runner, chaser: c } = both('used', { actor_id: 'c1', data: { kind: 'flare' } })
    expect(runner).toMatchObject({ text: 'A Kejar used Mat Rempit.', means: 'Check in now. An extra ping lands in 30 s.', act: true, label: 'Mat Rempit' })
    expect(c).toMatchObject({ means: 'Extra ping in 30 s. Get close to the circles.', act: false })
  })
  it('Pak Guard', () => {
    const { runner, chaser: c } = both('used', { actor_id: 'c1', data: { kind: 'focus' } })
    expect(runner).toMatchObject({
      text: 'A Kejar used Pak Guard.',
      means: 'At the next ping, anyone within 75 m of that Kejar shows exactly. Move away.',
      act: true,
      label: 'Pak Guard',
    })
    expect(c).toMatchObject({ means: 'Next ping shows Dikejar near them exactly.', act: false })
  })
  it('catch', () => {
    const { runner, chaser: c } = both('caught', { actor_id: 'c1', target_id: 'r1' })
    expect(runner).toMatchObject({ text: 'Ben caught #07.', means: '#07 is walking to Penjara. 3 Dikejar still free.', label: 'CATCH' })
    expect(c).toMatchObject({ means: 'Nice. 3 Dikejar left to find.' })
  })
  it('Durian', () => {
    const { runner, chaser: c } = both('shielded', { target_id: 'r1' })
    expect(runner).toMatchObject({ text: '#07 blocked a catch with Durian.', means: '#07 is still free. Their Durian is used up.', label: 'Durian' })
    expect(c).toMatchObject({ means: "That catch didn't count. #07 has no Durian now." })
  })
  it('jailbreak', () => {
    const { runner, chaser: c } = both('jailbreak', { actor_id: 'r3', data: { freed: 2 } })
    expect(runner).toMatchObject({ text: 'Wei freed 2 Dikejar from Penjara.', means: 'Penjara is empty again.', label: 'FREE' })
    expect(c).toMatchObject({ means: '2 more Dikejar are loose near Penjara.' })
  })
  it('auto-jail', () => {
    const { runner, chaser: c } = both('auto-jailed', { target_id: 'r2' })
    expect(runner).toMatchObject({
      text: '#03 missed 2 check-ins in a row.',
      means: "#03 went to Penjara. Check in when your phone buzzes, or you're next.",
      label: '2×',
    })
    expect(c).toMatchObject({ means: 'One less to find. #03 is in Penjara.' })
  })
  it('marshals get the line without a meaning', () => {
    expect(line(siti, { actor_id: 'c1', data: { kind: 'flare' } }, 'used')).toMatchObject({ text: 'A Kejar used Mat Rempit.', means: null, act: false })
  })
  it('runner power-ups stay secret', () => {
    const feed = view(chaser, { events: [event('used', T0 + 15.5 * MIN, { actor_id: 'r1', data: { kind: 'cloak' } })] }).feed
    expect(feed.some((f) => /Ponteng|used/i.test(f.text))).toBe(false)
  })
})

describe('check-in state', () => {
  // Next scheduled ping reveals at +20, its window opens at +19:15.
  const ALERT = T0 + 20 * MIN - SCHEDULED_ALERT_LEAD_MS
  const REVEAL = T0 + 20 * MIN
  const checkin = (me: Player, over: Partial<Parameters<typeof viewFor>[0]> = {}) => view(me, over).checkin

  it('is early before the window opens', () => {
    expect(checkin(aina, { now: REVEAL - 2 * MIN })).toEqual({ state: 'early', alertAt: ALERT, revealAt: REVEAL, missedInRow: 0 })
  })
  it('is open once the window opens and no fresh location has come in', () => {
    expect(checkin(aina, { now: REVEAL - 30_000 })?.state).toBe('open')
  })
  it('is in with a location inside the window', () => {
    const at = { ...positions, r1: [...positions.r1, pos(A.lat, A.lng, REVEAL - 20_000)] }
    expect(checkin(aina, { now: REVEAL - 15_000, positions: at })?.state).toBe('in')
  })
  it('is missed after a revealed ping with no check-in, until the next window', () => {
    expect(checkin(hafiz, { now: T0 + 16 * MIN })).toEqual({ state: 'missed', alertAt: ALERT, revealAt: REVEAL, missedInRow: 1 })
  })
  it("doesn't count a ping whose alert came before the runner was freed", () => {
    const freed = { ...hafiz, freed_at: new Date(T0 + 14.5 * MIN).toISOString() }
    expect(checkin(freed, { now: T0 + 16 * MIN, players: [chaser, aina, freed, wei, siti] })?.state).toBe('early')
  })
  it('is null for a chaser, a jailed runner, and during hiding', () => {
    expect(checkin(chaser)).toBeNull()
    const jailed = { ...aina, jailed: true }
    expect(checkin(jailed, { players: [chaser, jailed, hafiz, wei, siti] })).toBeNull()
    expect(checkin(aina, { now: T0 + 3 * MIN, pings: [] })).toBeNull()
  })
  it('a pause inside the window keeps a check-in sent before it', () => {
    const paused = game({ paused_at: new Date(T0 + 19.5 * MIN).toISOString() })
    const at = { ...positions, r1: [...positions.r1, pos(A.lat, A.lng, T0 + 19.4 * MIN)] }
    const c = checkin(aina, { game: paused, now: T0 + 20.2 * MIN, positions: at })
    expect(c?.state).toBe('in')
    expect(c?.revealAt).toBe(T0 + 20.7 * MIN)
  })
})

describe('deck and slot', () => {
  it("shows how many cards are left in my side's deck", () => {
    const v = view(aina, { game: { ...g, runner_sets: 1, runner_draws: 2 } })
    expect(v.deckLeft).toBe(4)
  })
  it('has no deck count for a marshal', () => {
    expect(view(siti, { game: { ...g, runner_sets: 1, runner_draws: 2 } }).deckLeft).toBeNull()
  })
  it('names a power-up whose effect is still running', () => {
    const durian: PowerUp = { id: 'u9', game_id: 'g1', player_id: 'r1', kind: 'shield', station: 1, claimed_at: '', used_at: new Date(NOW - MIN).toISOString(), consumed_at: null, sealed: false, taken_at: null, offer: null }
    expect(view(aina, { powerUps: [durian] }).activePowerUp).toBe('shield')
    expect(view(aina).activePowerUp).toBeNull()
  })
  const card = (over: Partial<PowerUp>): PowerUp => ({ id: 'u9', game_id: 'g1', player_id: 'r1', kind: 'shield', station: 1, claimed_at: '', used_at: null, consumed_at: null, sealed: false, taken_at: null, offer: null, ...over })
  it('a running Durian says when it ends; other running effects wait for the next ping', () => {
    const usedAt = NOW - MIN
    expect(view(aina, { powerUps: [card({ used_at: new Date(usedAt).toISOString() })] }).activeEndsAt).toBe(usedAt + 10 * MIN)
    expect(view(aina, { powerUps: [card({ kind: 'cloak', used_at: new Date(usedAt).toISOString() })] }).activeEndsAt).toBeNull()
    expect(view(aina).activeEndsAt).toBeNull()
  })
  it('a chaser holding Mat Rempit during the team cooldown sees when it unlocks', () => {
    const flare = card({ player_id: 'c1', kind: 'flare' })
    const bonus = ping(BONUS_SEQ_BASE, NOW - MIN)
    expect(view(chaser, { powerUps: [flare], pings: [...pings, bonus] }).flareReadyAt).toBe(NOW - MIN + 3 * MIN)
    expect(view(chaser, { powerUps: [flare] }).flareReadyAt).toBeNull()
    expect(view(chaser, { pings: [...pings, bonus] }).flareReadyAt).toBeNull()
  })
})

describe('Toyol and Ah Long', () => {
  const stolen = (kind: 'toyol' | 'along') =>
    event('stolen', T0 + 15.5 * MIN, { actor_id: kind === 'toyol' ? 'r1' : 'c1', target_id: kind === 'toyol' ? 'c1' : 'r1', data: { kind, takenKind: 'flare' } })
  const texts = (me: Player, e = stolen('toyol')) => view(me, { events: [e] }).feed.map((f) => f.text)
  it('the feed never says who stole or who lost', () => {
    expect(texts(aina)).toEqual(['Toyol stole a power-up!'])
    expect(texts(siti)).toEqual(['Toyol stole a power-up!'])
    expect(texts(hafiz, stolen('along'))).toEqual(['Ah Long came to collect!'])
    expect(texts(siti, stolen('along'))).toEqual(['Ah Long came to collect!'])
  })
  it('the player who lost the card sees a personal line naming it', () => {
    expect(texts(chaser)).toContain('Toyol took your Mat Rempit!')
    expect(texts(chaser)).not.toContain('Toyol stole a power-up!')
    expect(texts(aina, stolen('along'))).toEqual(['Ah Long took your Mat Rempit!'])
  })
  it("the victim's own line buzzes and gets the needs-you outline; everyone else's stays plain", () => {
    expect(view(chaser, { events: [stolen('toyol')] }).feed[0]).toMatchObject({ text: 'Toyol took your Mat Rempit!', act: true })
    expect(view(aina, { events: [stolen('toyol')] }).feed[0]).toMatchObject({ act: false })
  })
  it('a taken card leaves the hand', () => {
    const c = (over: Partial<PowerUp>): PowerUp => ({ id: 'u9', game_id: 'g1', player_id: 'c1', kind: 'flare', station: 1, claimed_at: '', used_at: null, consumed_at: null, sealed: false, taken_at: null, offer: null, ...over })
    expect(view(chaser, { powerUps: [c({})] }).hand).toHaveLength(1)
    expect(view(chaser, { powerUps: [c({ taken_at: new Date(NOW).toISOString() })] }).hand).toEqual([])
  })
  it('a card row from before migration 0011 (no taken_at at all) still counts as in the hand', () => {
    const { taken_at: _, ...old } = { id: 'u9', game_id: 'g1', player_id: 'c1', kind: 'flare' as const, station: 1, claimed_at: '', used_at: null, consumed_at: null, sealed: false, taken_at: null, offer: null }
    expect(view(chaser, { powerUps: [old as PowerUp] }).hand).toHaveLength(1)
    // And a jailed holder of such a Dato Seri can still Settle.
    const holder = { ...aina, jailed: true }
    const dato = { ...old, player_id: 'r1', kind: 'dato' as const, station: null }
    expect(view(holder, { players: [chaser, holder, hafiz, wei, siti], powerUps: [dato as PowerUp] }).settle).not.toBeNull()
  })
})

describe('jail reason', () => {
  const jailedHafiz = { ...hafiz, jailed: true }
  it('says missed-checkins when my latest jailing was an auto-jail', () => {
    const v = view(jailedHafiz, { players: [chaser, aina, jailedHafiz, wei, siti], events: [event('auto-jailed', T0 + 15 * MIN, { target_id: 'r2' })] })
    expect(v.jailReason).toBe('missed-checkins')
  })
  it('says caught when a chaser caught me', () => {
    const caught = { ...hafiz, jailed: true, caught_by: 'c1' }
    const v = view(caught, { players: [chaser, aina, caught, wei, siti], events: [event('caught', T0 + 12 * MIN, { actor_id: 'c1', target_id: 'r2' })] })
    expect(v.jailReason).toBe('caught')
  })
  it('is null while free', () => {
    expect(view(aina).jailReason).toBeNull()
  })
  it('an auto-jailed runner sees the check-ins it was judged on; nobody else does', () => {
    const checkins = [
      { revealAt: T0 + 10 * MIN, ok: true },
      { revealAt: T0 + 15 * MIN, ok: false },
    ]
    const events = [event('auto-jailed', T0 + 15 * MIN, { target_id: 'r2', data: { checkins } })]
    const players = [chaser, aina, jailedHafiz, wei, siti]
    expect(view(jailedHafiz, { players, events }).jailCheckins).toEqual([
      { at: T0 + 10 * MIN, ok: true },
      { at: T0 + 15 * MIN, ok: false },
    ])
    expect(view(aina, { players, events }).jailCheckins).toBeNull()
    const caught = { ...hafiz, jailed: true, caught_by: 'c1' }
    expect(view(caught, { players: [chaser, aina, caught, wei, siti], events }).jailCheckins).toBeNull()
  })
})

describe('feed wording', () => {
  const feedOf = (events: Parameters<typeof viewFor>[0]['events']) => view(siti, { events }).feed.map((f) => f.text)
  it('says one Dikejar for one', () => {
    expect(
      feedOf([
        event('ping', T0 + 10 * MIN, { data: { seen: 1 } }),
        event('jailbreak', T0 + 11 * MIN, { actor_id: 'r3', data: { freed: 1 } }),
      ]),
    ).toEqual(['Wei freed 1 Dikejar from Penjara.', 'Ping: 1 Dikejar seen.'])
  })
  it('announces pauses and resumes', () => {
    expect(feedOf([event('paused', T0 + 10 * MIN), event('resumed', T0 + 11 * MIN)])).toEqual([
      'Game resumed',
      'Game paused by a marshal',
    ])
  })
  it('announces an undone auto-jail', () => {
    expect(feedOf([event('auto-jail-undone', T0 + 16 * MIN, { target_id: 'r2' })])).toEqual(['#03 is back in the game (marshal)'])
  })
  it('announces an auto-jail', () => {
    expect(feedOf([event('auto-jailed', T0 + 15 * MIN, { target_id: 'r2' })])).toEqual(['#03 missed 2 check-ins in a row.'])
  })
  it('says how many Dikejar a ping saw', () => {
    expect(feedOf([event('ping', T0 + 10 * MIN, { data: { seen: 0 } })])).toEqual(['Ping: 0 Dikejar seen.'])
  })
})

describe('power-up effects', () => {
  const used = (id: string, playerId: string, kind: PowerUp['kind'], usedAt: number): PowerUp => ({
    id,
    game_id: 'g1',
    player_id: playerId,
    kind,
    station: 1,
    claimed_at: new Date(usedAt - MIN).toISOString(),
    used_at: new Date(usedAt).toISOString(),
    consumed_at: null,
    sealed: false,
    taken_at: null, offer: null,
  })

  it('cloaked runner is missing from the next reveal only', () => {
    const cloak = used('u1', 'r1', 'cloak', T0 + 14 * MIN)
    expect(view(chaser, { powerUps: [cloak] }).dots.find((d) => d.id === 'r1')).toBeUndefined()
    const later = [...pings, ping(3, T0 + 20 * MIN)]
    const ps = { ...positions, r1: [...positions.r1, pos(B.lat, B.lng, T0 + 19 * MIN)] }
    expect(
      view(chaser, { powerUps: [cloak], pings: later, positions: ps, now: T0 + 21 * MIN }).dots.find((d) => d.id === 'r1'),
    ).toBeDefined()
  })

  it('decoyed runner appears 120–180 m from their real spot at the next reveal', () => {
    const dot = view(chaser, { powerUps: [used('u1', 'r1', 'decoy', T0 + 14 * MIN)] }).dots.find((d) => d.id === 'r1')!
    const d = distanceM(dot, A)
    expect(d).toBeGreaterThanOrEqual(119)
    expect(d).toBeLessThanOrEqual(181)
  })

  it("decoy and ordinary fuzz are seeded with the game's secret seed, not just the public player id and ping number", () => {
    // Same player, same ping, same real position — only the game's secret seed differs.
    const decoyAt = (deck_seed: string) =>
      view(chaser, { game: { ...g, deck_seed }, powerUps: [used('u1', 'r1', 'decoy', T0 + 14 * MIN)] }).dots.find((d) => d.id === 'r1')
    expect(decoyAt('secret-one')).not.toEqual(decoyAt('secret-two'))
    expect(decoyAt('secret-one')).toEqual(decoyAt('secret-one'))

    const fuzzAt = (deck_seed: string) => view(chaser, { game: { ...g, deck_seed } }).dots.find((d) => d.id === 'r1')
    expect(fuzzAt('secret-one')).not.toEqual(fuzzAt('secret-two'))
    expect(fuzzAt('secret-one')).toEqual(fuzzAt('secret-one'))
  })

  it('focus shows nearby runners exactly at the next reveal', () => {
    const ps = { ...positions, c1: [pos(A.lat + 0.0005, A.lng, T0 + 14.8 * MIN)] } // ~56 m from Aina
    const dot = view(chaser, { positions: ps, powerUps: [used('u1', 'c1', 'focus', T0 + 14 * MIN)] }).dots.find(
      (d) => d.id === 'r1',
    )!
    expect(dot).toMatchObject({ lat: A.lat, lng: A.lng, exact: true })
    expect(dot.fuzzy).toBeUndefined()
  })

  it('a runner shown exactly because of Pak Guard carries revealedBy: focus', () => {
    const ps = { ...positions, c1: [pos(A.lat + 0.0005, A.lng, T0 + 14.8 * MIN)] } // ~56 m from Aina
    const dot = view(chaser, { positions: ps, powerUps: [used('u1', 'c1', 'focus', T0 + 14 * MIN)] }).dots.find(
      (d) => d.id === 'r1',
    )
    expect(dot?.revealedBy).toBe('focus')
  })

  it('an ordinarily-exact dot (a teammate) does not carry revealedBy', () => {
    const dot = view(aina, {}).dots.find((d) => d.kind === 'teammate')
    expect(dot?.revealedBy).toBeNull()
  })

  it('a flare reveal between scheduled pings becomes the last reveal', () => {
    const flare = ping(BONUS_SEQ_BASE, T0 + 16.5 * MIN)
    const v = view(chaser, { pings: [...pings, flare], now: T0 + 17 * MIN })
    expect(v.lastRevealAt).toBe(T0 + 16.5 * MIN)
    const dot = v.dots.find((d) => d.id === 'r1')!
    expect(distanceM(dot, B)).toBeLessThanOrEqual(15) // Aina's spot at 15.5 min, not the 15-min reveal
  })

  it('a scheduled reveal after a flare is the last reveal (ordered by time, not number)', () => {
    const flare = ping(BONUS_SEQ_BASE, T0 + 16.5 * MIN)
    const v = view(chaser, { pings: [...pings, flare, ping(3, T0 + 20 * MIN)], now: T0 + 21 * MIN })
    expect(v.lastRevealAt).toBe(T0 + 20 * MIN)
  })

  it('hand lists my unused power-ups only, and shows an active shield', () => {
    const mine = { ...used('u1', 'r1', 'decoy', T0), used_at: null }
    const v = view(aina, {
      powerUps: [mine, used('u2', 'r1', 'shield', T0 + 15 * MIN), { ...used('u3', 'c1', 'flare', T0), used_at: null }],
    })
    expect(v.hand.map((u) => u.id)).toEqual(['u1'])
    expect(v.shieldActive).toBe(true)
  })

  it('lists the stations with their numbers', () => {
    const S = { lat: 3.004, lng: 101.004 }
    const v = view(aina, { game: game({ arena: { ...g.arena, stations: [S] } }) })
    expect(v.stations).toEqual([{ n: 1, lat: S.lat, lng: S.lng }])
  })

  it('feed announces pickups and chaser power-ups but not runner ones', () => {
    const feed = view(siti, {
      events: [
        event('powerup', T0 + 10 * MIN, { actor_id: 'r1' }),
        event('used', T0 + 11 * MIN, { actor_id: 'c1', data: { kind: 'flare' } }),
        event('used', T0 + 12 * MIN, { actor_id: 'c1', data: { kind: 'focus' } }),
        event('used', T0 + 13 * MIN, { actor_id: 'r1', data: { kind: 'cloak' } }),
        event('shielded', T0 + 14 * MIN, { target_id: 'r1' }),
      ],
    }).feed.map((f) => f.text)
    expect(feed).toEqual([
      '#07 blocked a catch with Durian.',
      'A Kejar used Pak Guard.',
      'A Kejar used Mat Rempit.',
      'Aina picked up a power-up',
    ])
  })
})

describe('power-up secrecy', () => {
  const used = (playerId: string, kind: PowerUp['kind'], usedAt: number): PowerUp => ({
    id: `${playerId}-${kind}`,
    game_id: 'g1',
    player_id: playerId,
    kind,
    station: 1,
    claimed_at: new Date(usedAt - MIN).toISOString(),
    used_at: new Date(usedAt).toISOString(),
    consumed_at: null,
    sealed: false,
    taken_at: null, offer: null,
  })

  it('a cloaked runner looks exactly like a runner who never checked in', () => {
    const v = view(chaser, { powerUps: [used('r1', 'cloak', T0 + 14 * MIN)] })
    expect(v.dots.find((d) => d.id === 'r1')).toBeUndefined()
    expect(v.feed.map((f) => f.text)).toContain('#07 never checked in')
  })

  it('a decoyed runner inside a Focus is shown exactly at the decoy spot, like the others', () => {
    const ps = { ...positions, c1: [pos(A.lat + 0.0005, A.lng, T0 + 14.8 * MIN)] }
    const dot = view(chaser, {
      positions: ps,
      powerUps: [used('r1', 'decoy', T0 + 14 * MIN), used('c1', 'focus', T0 + 14 * MIN)],
    }).dots.find((d) => d.id === 'r1')!
    expect(dot.exact).toBe(true)
    expect(dot.fuzzy).toBeUndefined()
    expect(distanceM(dot, A)).toBeGreaterThanOrEqual(119)
  })
})

describe('the chaser snapshot at check-in (checkins design §5)', () => {
  const on = game({ settings: { ...DEFAULT_SETTINGS, mode: 'full', chaserSnapshot: true } })
  /** Scheduled ping k reveals at +5 + 5k minutes; its alert (the snapshot moment) is 45 s before. */
  const alertAt = (k: number) => T0 + (5 + 5 * k) * MIN - SCHEDULED_ALERT_LEAD_MS
  const BEN_1 = { lat: 3.001, lng: 101.001 }
  const BEN_2 = { lat: 3.002, lng: 101.008 }
  const BEN_3 = { lat: 3.008, lng: 101.002 }
  const BEN_LATER = { lat: 3.008, lng: 101.008 }
  const benTrail = [
    pos(BEN_1.lat, BEN_1.lng, alertAt(1) - 3_000),
    pos(BEN_2.lat, BEN_2.lng, alertAt(2) - 5_000),
    pos(BEN_LATER.lat, BEN_LATER.lng, alertAt(2) + 20_000),
    pos(BEN_3.lat, BEN_3.lng, alertAt(3) - 2_000),
  ]
  const snap = (me: Player, aina: Position[], over: Partial<Parameters<typeof viewFor>[0]> = {}) =>
    view(me, { game: on, positions: { c1: benTrail, r1: aina }, ...over }).chaserSnapshot

  it("with the switch on, a runner who just checked in sees chasers as of that window's alert time, fuzzed to 30 m", () => {
    const s = snap(aina, [pos(A.lat, A.lng, alertAt(2) + 10_000)], { now: alertAt(2) + 20_000 })
    expect(s?.positions).toHaveLength(1)
    expect(s?.positions[0]).toMatchObject({ name: 'Ben', stale: false })
    expect(distanceM(s!.positions[0], BEN_2)).toBeLessThanOrEqual(CHASER_SNAPSHOT_FUZZ_M)
    expect(distanceM(s!.positions[0], BEN_LATER)).toBeGreaterThan(100)
  })

  it("is frozen: the circles don't move between polls while the chaser does", () => {
    const aina2 = [pos(A.lat, A.lng, alertAt(2) + 10_000)]
    const first = snap(aina, aina2, { now: alertAt(2) + 20_000 })
    expect(snap(aina, aina2, { now: alertAt(2) + 40_000 })).toEqual(first)
    expect(snap(aina, aina2, { now: T0 + 17 * MIN })).toEqual(first)
  })

  it("is fuzzed with the game's secret seed, so knowing the game and player ids can't undo it", () => {
    const aina2 = [pos(A.lat, A.lng, alertAt(2) + 10_000)]
    const at = (deck_seed: string) => snap(aina, aina2, { now: alertAt(2) + 20_000, game: { ...on, deck_seed } })!.positions[0]
    expect(at('secret-one')).not.toEqual(at('secret-two'))
    expect(at('secret-one')).toEqual(at('secret-one'))
  })

  it('a chaser whose last position is over 60 s old at the alert is marked stale', () => {
    const at = (ms: number) => snap(aina, [pos(A.lat, A.lng, alertAt(2) + 10_000)], { now: alertAt(2) + 20_000, positions: { c1: [pos(BEN_2.lat, BEN_2.lng, alertAt(2) - ms)], r1: [pos(A.lat, A.lng, alertAt(2) + 10_000)] } })
    expect(at(61_000)?.positions[0].stale).toBe(true)
    expect(at(59_000)?.positions[0].stale).toBe(false)
  })

  it('a chaser with no position at all before the alert is left out', () => {
    const s = snap(aina, [pos(A.lat, A.lng, alertAt(2) + 10_000)], {
      now: alertAt(2) + 20_000,
      positions: { c1: [pos(BEN_LATER.lat, BEN_LATER.lng, alertAt(2) + 1_000)], r1: [pos(A.lat, A.lng, alertAt(2) + 10_000)] },
    })
    expect(s).toEqual({ positions: [] })
  })

  it('the switch off means no chaser snapshot, even after checking in', () => {
    const v = view(aina, { positions: { c1: benTrail, r1: [pos(A.lat, A.lng, alertAt(2) + 10_000)] }, now: alertAt(2) + 20_000 })
    expect(v.chaserSnapshot).toBeNull()
  })

  it("missing this window keeps last window's snapshot showing, per design doc §5.4", () => {
    const missed3 = [pos(A.lat, A.lng, alertAt(2) + 10_000)]
    // Window 3 is open and she hasn't checked in yet, then it reveals without her.
    for (const now of [alertAt(3) + 10_000, T0 + 20.5 * MIN]) {
      const s = snap(aina, missed3, { now })
      expect(distanceM(s!.positions[0], BEN_2)).toBeLessThanOrEqual(CHASER_SNAPSHOT_FUZZ_M)
    }
    // The next check-in replaces it.
    const s = snap(aina, [...missed3, pos(A.lat, A.lng, alertAt(3) + 5_000)], { now: alertAt(3) + 10_000 })
    expect(distanceM(s!.positions[0], BEN_3)).toBeLessThanOrEqual(CHASER_SNAPSHOT_FUZZ_M)
  })

  it('before any check-in has ever succeeded, the chaser snapshot is null', () => {
    // One location before window 1, one after its reveal but before window 2's alert: neither is a check-in.
    expect(snap(aina, [pos(A.lat, A.lng, alertAt(1) - 60_000), pos(A.lat, A.lng, T0 + 12 * MIN)], { now: T0 + 16 * MIN })).toBeNull()
  })

  it('a Mat Rempit bonus ping never produces or updates a snapshot', () => {
    const bonus = ping(BONUS_SEQ_BASE, T0 + 17 * MIN)
    const ben = [...benTrail, pos(BEN_LATER.lat, BEN_LATER.lng, T0 + 16.5 * MIN - 1_000)]
    const inBonusOnly = [pos(A.lat, A.lng, T0 + 16.75 * MIN)]
    const over = { pings: [...pings, bonus], now: T0 + 17.5 * MIN }
    expect(view(aina, { game: on, positions: { c1: ben, r1: inBonusOnly }, ...over }).chaserSnapshot).toBeNull()
    const s = view(aina, { game: on, positions: { c1: ben, r1: [pos(A.lat, A.lng, alertAt(2) + 10_000), ...inBonusOnly] }, ...over }).chaserSnapshot
    expect(distanceM(s!.positions[0], BEN_2)).toBeLessThanOrEqual(CHASER_SNAPSHOT_FUZZ_M)
  })

  it('a check-in recorded at the reveal counts, even when the view no longer has that location', () => {
    const revealed = event('ping', T0 + 10 * MIN, { data: { seq: 1, seen: 1, missed: 0, checkedIn: ['r1'] } })
    const s = snap(aina, [pos(A.lat, A.lng, T0 + 12 * MIN)], { now: T0 + 16 * MIN, events: [revealed] })
    expect(distanceM(s!.positions[0], BEN_1)).toBeLessThanOrEqual(CHASER_SNAPSHOT_FUZZ_M)
  })

  it('a location sent while jailed is not a check-in for a runner freed afterwards', () => {
    const freed = { ...aina, freed_once: true, freed_at: iso(T0 + 15.5 * MIN) }
    const s = view(freed, { game: on, players: [chaser, freed, hafiz, wei, siti], positions: { c1: benTrail, r1: [pos(A.lat, A.lng, alertAt(2) + 10_000)] }, now: T0 + 16 * MIN })
    expect(s.chaserSnapshot).toBeNull()
  })

  it('jailed runners keep their spectator map; chasers and marshals never get a snapshot', () => {
    const jailed = { ...aina, jailed: true }
    const aina2 = [pos(A.lat, A.lng, alertAt(2) + 10_000)]
    const over = { now: alertAt(2) + 20_000, players: [chaser, jailed, hafiz, wei, siti] }
    expect(snap(jailed, aina2, over)).toBeNull()
    expect(snap(chaser, aina2, { now: alertAt(2) + 20_000 })).toBeNull()
    expect(snap(siti, aina2, { now: alertAt(2) + 20_000 })).toBeNull()
  })
})

describe("the snapshot marker on a chaser's own screen (checkins design §5.4)", () => {
  const on = game({ settings: { ...DEFAULT_SETTINGS, mode: 'full', chaserSnapshot: true } })
  const alertAt = (k: number) => T0 + (5 + 5 * k) * MIN - SCHEDULED_ALERT_LEAD_MS
  const SNAP = 'Snapshot taken — Dikejar can see where you were'

  it('a chaser is snapshotted from a scheduled alert until that ping reveals', () => {
    expect(view(chaser, { game: on, now: alertAt(3) + 1_000 }).snapshotted).toBe(true)
    expect(view(chaser, { game: on, now: T0 + 20 * MIN - 1 }).snapshotted).toBe(true)
    expect(view(chaser, { game: on, now: T0 + 16 * MIN }).snapshotted).toBe(false)
  })

  it('a Mat Rempit bonus ping never snapshots anyone', () => {
    const bonus = ping(BONUS_SEQ_BASE, T0 + 17 * MIN, { revealed: false })
    expect(view(chaser, { game: on, pings: [...pings, bonus], now: T0 + 16.8 * MIN }).snapshotted).toBe(false)
  })

  it('with the switch off, or for anyone but a chaser, snapshotted is false', () => {
    expect(view(chaser, { now: alertAt(3) + 1_000 }).snapshotted).toBe(false)
    expect(view(aina, { game: on, now: alertAt(3) + 1_000 }).snapshotted).toBe(false)
    expect(view(siti, { game: on, now: alertAt(3) + 1_000 }).snapshotted).toBe(false)
  })

  it('the feed tells chasers and marshals in plain English, keeping only the latest alert line', () => {
    for (const me of [chaser, siti]) {
      const lines = view(me, { game: on }).feed.filter((f) => f.text === SNAP)
      expect(lines.map((f) => f.at)).toEqual([iso(alertAt(2))])
    }
  })

  it("runners never get the snapshot line in their feed (ruling R16)", () => {
    expect(view(aina, { game: on }).feed.some((f) => f.text === SNAP)).toBe(false)
  })

  it('a Core game ignores the switch: no snapshot, no marker, no feed line (rules §3)', () => {
    const core = game({ settings: { ...DEFAULT_SETTINGS, mode: 'core', chaserSnapshot: true } })
    expect(view(chaser, { game: core, now: alertAt(3) + 1_000 }).snapshotted).toBe(false)
    for (const me of [chaser, siti]) expect(view(me, { game: core }).feed.some((f) => f.text === SNAP)).toBe(false)
    const checkedIn = view(aina, { game: core, positions: { c1: [pos(3.002, 101.008, alertAt(2) - 5_000)], r1: [pos(A.lat, A.lng, alertAt(2) + 10_000)] }, now: alertAt(2) + 20_000 })
    expect(checkedIn.chaserSnapshot).toBeNull()
  })

  it('with 2-minute pings, snapshot lines never crowd catches out of the 20-line feed', () => {
    const fast = game({ settings: { ...DEFAULT_SETTINGS, mode: 'full', chaserSnapshot: true, pingMin: 2, lengthMin: 90 } })
    const catches = [0, 1, 2].map((k) => event('caught', T0 + (6 + k) * MIN, { actor_id: 'c1', target_id: 'r2' }))
    const feed = view(chaser, { game: fast, events: catches, pings: [], now: T0 + 60 * MIN }).feed
    expect(feed.filter((f) => f.text === SNAP)).toHaveLength(1)
    expect(feed.filter((f) => /caught/.test(f.text))).toHaveLength(3)
  })

  it('no snapshot lines with the switch off, for bonus pings, or after the game ended', () => {
    expect(view(chaser).feed.some((f) => f.text === SNAP)).toBe(false)
    const bonus = ping(BONUS_SEQ_BASE, T0 + 17 * MIN)
    expect(view(chaser, { game: on, pings: [...pings, bonus], now: T0 + 18 * MIN }).feed.filter((f) => f.text === SNAP).map((f) => f.at)).toEqual([iso(alertAt(2))])
    const ended = game({ settings: on.settings, ended_at: iso(T0 + 12 * MIN) })
    expect(view(chaser, { game: ended, now: T0 + 30 * MIN }).feed.filter((f) => f.text === SNAP).map((f) => f.at)).toEqual([iso(alertAt(1))])
  })
})

describe("Dato Seri's hint zone (jail design §4b)", () => {
  const stash = { lat: 3.004, lng: 101.004, claimedBy: null, claimedAt: null }
  const full = (id: string) => game({ id, settings: { ...DEFAULT_SETTINGS, mode: 'full' }, dato_stash: stash })

  it('always has the stash well inside, never at the centre, whatever the game', () => {
    for (let k = 0; k < 40; k++) {
      const z = view(aina, { game: full(`game-${k}`) }).legendaryZone!
      expect(z.radiusM).toBe(LEGENDARY_ZONE_M)
      const d = distanceM(z, stash)
      expect(d).toBeGreaterThanOrEqual(0.3 * LEGENDARY_ZONE_M - 0.5)
      expect(d).toBeLessThanOrEqual(0.8 * LEGENDARY_ZONE_M + 0.5)
    }
  })

  it("is placed with the game's secret seed, not the game id players can see", () => {
    const zone = (deck_seed: string) => view(aina, { game: { ...full('g1'), deck_seed } }).legendaryZone
    expect(zone('secret-one')).not.toEqual(zone('secret-two'))
    expect(zone('secret-one')).toEqual(zone('secret-one'))
  })

  it('is the same for runners and chasers, jailed or free; marshals get the exact stash instead', () => {
    const z = view(aina, { game: full('g1') }).legendaryZone
    expect(view(chaser, { game: full('g1') }).legendaryZone).toEqual(z)
    expect(view({ ...aina, jailed: true }, { game: full('g1') }).legendaryZone).toEqual(z)
    const m = view(siti, { game: full('g1') })
    expect(m.legendaryZone).toBeNull()
    expect(m.datoStash).toEqual(stash)
  })

  it("the card's code is for marshals only, never in a player's view (ruling R15)", () => {
    const g = { ...full('g1'), dato_stash: { ...stash, code: 'Secret-card-code-12345' } }
    expect(view(siti, { game: g }).datoCode).toBe('Secret-card-code-12345')
    expect(view(siti, { game: g }).datoStash).toEqual(stash)
    for (const me of [aina, chaser, { ...aina, jailed: true }]) {
      const v = view(me, { game: g })
      expect(v).not.toHaveProperty('datoCode')
      expect(JSON.stringify(v)).not.toContain('Secret-card-code-12345')
    }
  })

  it('a stash made with the game but not dropped yet has no zone, and no pin for marshals', () => {
    const g = { ...full('g1'), dato_stash: { code: 'c0de', lat: null, lng: null, claimedBy: null, claimedAt: null } }
    expect(view(aina, { game: g }).legendaryZone).toBeNull()
    expect(view(siti, { game: g }).datoStash).toBeNull()
    expect(view(siti, { game: g }).datoCode).toBe('c0de')
  })

  it("the Settle picker is offered only during the chase, and not while paused", () => {
    const holder = { ...aina, jailed: true }
    const dato: PowerUp = { id: 'u1', game_id: 'g1', player_id: 'r1', kind: 'dato', station: null, claimed_at: iso(NOW), used_at: null, consumed_at: null, sealed: false, taken_at: null, offer: null }
    const over = { players: [chaser, holder, hafiz, wei, siti], powerUps: [dato] }
    expect(view(holder, over).settle).toEqual({ canFreeSelf: true, options: [] })
    expect(view(holder, { ...over, game: game({ paused_at: iso(NOW - MIN) }) }).settle).toBeNull()
    expect(view(holder, { ...over, game: game({ ended_at: iso(NOW - MIN) }) }).settle).toBeNull()
    expect(view(holder, { ...over, now: T0 + 2 * MIN }).settle).toBeNull()
  })

  it('is gone once claimed, and outside the chase', () => {
    const claimed = game({ settings: { ...DEFAULT_SETTINGS, mode: 'full' }, dato_stash: { ...stash, claimedBy: 'r2', claimedAt: iso(NOW) } })
    expect(view(aina, { game: claimed }).legendaryZone).toBeNull()
    expect(view(aina, { game: full('g1'), now: T0 + 2 * MIN }).legendaryZone).toBeNull()
    expect(view(aina, { game: { ...full('g1'), ended_at: iso(NOW - MIN) } }).legendaryZone).toBeNull()
  })
})
