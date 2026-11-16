import { describe, expect, it } from 'vitest'
import { BOMBA_LEFT_MIN, ENDGAME_LEFT_MS, endgamesOf, hebatLive, maskEndgame, pickWanted, pkpClosed, revealDue, revealed, rollEndgame, wantedOut } from './endgame.js'
import { event, game, iso, MIN, player, T0 } from './fixtures.js'
import { seeded } from './testing.js'
import { DEFAULT_SETTINGS, type Arrest, type EndgameKind, type EndgameState, type Settings } from './types.js'

const sw = (over: Partial<NonNullable<Settings['endgames']>>): NonNullable<Settings['endgames']> => ({ bomba: 'off', hebat: 'off', pkp: 'off', banjir: 'off', ...over })
const settings = (mode: 'core' | 'full', endgames?: Settings['endgames']): Settings => {
  const { endgames: _drop, ...rest } = DEFAULT_SETTINGS
  return { ...rest, mode, ...(endgames ? { endgames } : {}) }
}
const state = (kind: EndgameKind, over: Partial<EndgameState> = {}): EndgameState => ({ kind, revealedAt: null, wanted: null, bountyAt: null, ...over })
const arrest = { firedAt: iso(T0), route: 'catch', by: null, center: null, startedAt: null, ringId: 'x', catchEventId: null } as Arrest

describe('the exact values', () => {
  it('holds the reveal times and Bomba calls', () => {
    expect(ENDGAME_LEFT_MS).toEqual({ bomba: 10 * MIN, hebat: 10 * MIN, pkp: 5 * MIN, banjir: 10 * MIN })
    expect([...BOMBA_LEFT_MIN]).toEqual([8, 6, 5, 4, 3, 2, 1])
  })
})

describe('endgamesOf', () => {
  it('reads a game without switches as all off', () => {
    expect(endgamesOf(settings('full'))).toEqual(sw({}))
  })
  it('returns the stored switches', () => {
    expect(endgamesOf(settings('full', sw({ pkp: 'on' })))).toEqual(sw({ pkp: 'on' }))
  })
})

describe('rollEndgame', () => {
  it('gives Bomba in Core when its switch is on', () => {
    expect(rollEndgame(settings('core', sw({ bomba: 'on' })), seeded(1))).toBe('bomba')
  })
  it('gives nothing in Core when Bomba is off, whatever the others say', () => {
    expect(rollEndgame(settings('core', sw({ hebat: 'on', pkp: 'on' })), seeded(1))).toBeNull()
  })
  it('picks the only switched-on kind in Full', () => {
    expect(rollEndgame(settings('full', sw({ pkp: 'on' })), seeded(1))).toBe('pkp')
  })
  it('gives nothing in Full with everything off', () => {
    expect(rollEndgame(settings('full', sw({})), seeded(1))).toBeNull()
  })
  it('uses every switched-on kind, Banjir Kilat included', () => {
    const rng = seeded(7)
    const seen = new Set<EndgameKind | null>()
    const all = { bomba: 'on', hebat: 'on', pkp: 'on', banjir: 'on' } as unknown as Settings['endgames']
    for (let i = 0; i < 1000; i++) seen.add(rollEndgame(settings('full', all), rng))
    expect(seen).toEqual(new Set(['bomba', 'hebat', 'pkp', 'banjir']))
  })
  it('gives nothing for settings stored before endgames existed', () => {
    expect(rollEndgame(settings('full'), seeded(1))).toBeNull()
    expect(rollEndgame(settings('core'), seeded(1))).toBeNull()
  })
})

describe('revealDue', () => {
  // Default game: 5 min hiding, then 45 min of chase, so it ends at T0 + 50 min.
  const END = T0 + 50 * MIN
  const bomba = game({ endgame: state('bomba') })
  it('is not due at 10:01 left, and is due at 10:00', () => {
    expect(revealDue(bomba, END - 10 * MIN - 1_000)).toBe(false)
    expect(revealDue(bomba, END - 10 * MIN)).toBe(true)
  })
  it('is not due while paused', () => {
    expect(revealDue({ ...bomba, paused_at: iso(END - 11 * MIN) }, END - 9 * MIN)).toBe(false)
  })
  it('is not due once revealed', () => {
    expect(revealDue(game({ endgame: state('bomba', { revealedAt: iso(END - 10 * MIN) }) }), END - 9 * MIN)).toBe(false)
  })
  it('is not due with a final whistle pending, once ended, or with no endgame', () => {
    expect(revealDue({ ...bomba, final_whistle_at: iso(END - 9 * MIN) }, END - 8 * MIN)).toBe(false)
    expect(revealDue({ ...bomba, ended_at: iso(END - 9 * MIN) }, END - 8 * MIN)).toBe(false)
    expect(revealDue(game(), END - 8 * MIN)).toBe(false)
    expect(revealDue(game({ endgame: null }), END - 8 * MIN)).toBe(false)
  })
  it('is not due while hiding', () => {
    expect(revealDue(bomba, T0 + MIN)).toBe(false)
  })
  it('reveals PKP at 5 min left, not 5:01', () => {
    const pkp = game({ endgame: state('pkp') })
    expect(revealDue(pkp, END - 5 * MIN - 1_000)).toBe(false)
    expect(revealDue(pkp, END - 5 * MIN)).toBe(true)
  })
  it('moves later by a pause: a 15-minute chase paused 5 minutes while hiding', () => {
    // Hide 5, chase 15; the pause (1 to 6 min) pushes the chase to T0 + 10 and the end to T0 + 25.
    const g = game({
      settings: { ...DEFAULT_SETTINGS, lengthMin: 15, hideMin: 5 },
      pauses: [{ from: iso(T0 + MIN), to: iso(T0 + 6 * MIN) }],
      endgame: state('hebat'),
    })
    expect(revealDue(g, T0 + 15 * MIN - 1_000)).toBe(false)
    expect(revealDue(g, T0 + 15 * MIN)).toBe(true)
  })
})

describe('revealed, hebatLive, pkpClosed', () => {
  const at = iso(T0)
  it('needs revealedAt, and the kind when one is given', () => {
    expect(revealed({ endgame: null })).toBe(false)
    expect(revealed({})).toBe(false)
    expect(revealed({ endgame: state('pkp') })).toBe(false)
    expect(revealed({ endgame: state('pkp', { revealedAt: at }) })).toBe(true)
    expect(revealed({ endgame: state('pkp', { revealedAt: at }) }, 'pkp')).toBe(true)
    expect(revealed({ endgame: state('pkp', { revealedAt: at }) }, 'bomba')).toBe(false)
  })
  it('Hang Hebat is live once revealed with someone wanted', () => {
    expect(hebatLive({ endgame: state('hebat', { revealedAt: at }) })).toBe(false)
    expect(hebatLive({ endgame: state('hebat', { wanted: 'r1' }) })).toBe(false)
    expect(hebatLive({ endgame: state('hebat', { revealedAt: at, wanted: 'r1' }) })).toBe(true)
    expect(hebatLive({ endgame: state('bomba', { revealedAt: at, wanted: 'r1' }) })).toBe(false)
  })
  it('Penjara is closed only for a revealed PKP', () => {
    expect(pkpClosed({ endgame: state('pkp') })).toBe(false)
    expect(pkpClosed({ endgame: state('pkp', { revealedAt: at }) })).toBe(true)
    expect(pkpClosed({ endgame: state('hebat', { revealedAt: at }) })).toBe(false)
  })
})

describe('wantedOut', () => {
  it('is true when jailed, disqualified or under house arrest', () => {
    expect(wantedOut(player('r1', 'runner'))).toBe(false)
    expect(wantedOut(player('r1', 'runner', { jailed: true }))).toBe(true)
    expect(wantedOut(player('r1', 'runner', { disqualified_at: iso(T0) }))).toBe(true)
    expect(wantedOut(player('r1', 'runner', { arrest }))).toBe(true)
  })
})

describe('pickWanted', () => {
  const start = T0 + 5 * MIN
  const caught = (id: string, atMs: number) => event('caught', atMs, { id: `caught-${id}-${atMs}`, target_id: id })
  it('prefers never caught over freed at minute 3', () => {
    const a = player('a', 'runner', { tag_id: 1, freed_at: iso(start + 3 * MIN) })
    const b = player('b', 'runner', { tag_id: 2 })
    expect(pickWanted([a, b], [caught('a', start + MIN)], start)?.id).toBe('b')
  })
  it('prefers freed at minute 3 over freed at minute 6', () => {
    const a = player('a', 'runner', { tag_id: 1, freed_at: iso(start + 6 * MIN) })
    const b = player('b', 'runner', { tag_id: 2, freed_at: iso(start + 3 * MIN) })
    expect(pickWanted([a, b], [caught('a', start + MIN), caught('b', start + MIN)], start)?.id).toBe('b')
  })
  it('counts the end of a house arrest as a release', () => {
    const a = player('a', 'runner', { tag_id: 1 })
    const b = player('b', 'runner', { tag_id: 2, freed_at: iso(start + 2 * MIN) })
    const arrested = event('arrested', start + MIN, { target_id: 'a', data: { route: 'checkins', firedAt: iso(start + MIN) } })
    const ended = event('arrest-ended', start + 4 * MIN, { target_id: 'a', data: { outcome: 'free', firedAt: iso(start + MIN) } })
    // a's stretch restarted at minute 4, later than b's minute 2.
    expect(pickWanted([a, b], [caught('b', start + MIN), arrested, ended], start)?.id).toBe('b')
  })
  it('treats an undone catch as never having happened', () => {
    // a was caught at minute 5 and the catch was undone; undo stamps freed_at, but a has been free since the start.
    const a = player('a', 'runner', { tag_id: 1, freed_at: iso(start + 6 * MIN) })
    const b = player('b', 'runner', { tag_id: 2 })
    const c = caught('a', start + 5 * MIN)
    const undone = event('kejar-undone', start + 6 * MIN, { target_id: 'a', data: { eventId: c.id } })
    expect(pickWanted([a, b], [c, undone], start)?.id).toBe('a')
  })
  it('treats an undone Super Ring arrest as never having happened', () => {
    const a = player('a', 'runner', { tag_id: 1 })
    const b = player('b', 'runner', { tag_id: 2 })
    const firedAt = iso(start + 5 * MIN)
    const arrested = event('arrested', start + 5 * MIN, { target_id: 'a', data: { route: 'catch', firedAt } })
    const ended = event('arrest-ended', start + 6 * MIN, { target_id: 'a', data: { outcome: 'undone', firedAt } })
    const undone = event('kejar-undone', start + 6 * MIN, { target_id: 'a', data: { eventId: arrested.id, arrest: true } })
    expect(pickWanted([a, b], [arrested, ended, undone], start)?.id).toBe('a')
  })
  it('treats an undone auto-jail as never having happened', () => {
    const a = player('a', 'runner', { tag_id: 1, freed_at: iso(start + 6 * MIN) })
    const b = player('b', 'runner', { tag_id: 2 })
    const jailed = event('auto-jailed', start + 5 * MIN, { target_id: 'a', data: { cause: 'hijau' } })
    const undone = event('auto-jail-undone', start + 6 * MIN, { target_id: 'a', data: { eventId: jailed.id } })
    expect(pickWanted([a, b], [jailed, undone], start)?.id).toBe('a')
  })
  it('runs the stretch from the real release before an undone catch', () => {
    // a: caught at 1, rescued at 2, caught again at 5 and that catch undone at 6 (freed_at now says 6).
    // b: caught after the rescue and out by minute 3. a's stretch runs from minute 2, so a is wanted.
    const a = player('a', 'runner', { tag_id: 2, freed_at: iso(start + 6 * MIN) })
    const b = player('b', 'runner', { tag_id: 1, freed_at: iso(start + 3 * MIN) })
    const again = caught('a', start + 5 * MIN)
    const events = [
      caught('a', start + MIN),
      event('jailbreak', start + 2 * MIN, { data: { freed: 1 } }),
      caught('b', start + 2.5 * MIN),
      again,
      event('kejar-undone', start + 6 * MIN, { target_id: 'a', data: { eventId: again.id } }),
    ]
    expect(pickWanted([a, b], events, start)?.id).toBe('a')
  })
  it('skips house arrest, jailed, disqualified and removed runners, and chasers', () => {
    const players = [
      player('arrested', 'runner', { tag_id: 1, arrest }),
      player('jailed', 'runner', { tag_id: 2, jailed: true }),
      player('dq', 'runner', { tag_id: 3, disqualified_at: iso(T0) }),
      player('gone', 'runner', { tag_id: 4, removed_at: iso(T0) }),
      player('chaser', 'chaser', { tag_id: 5 }),
      player('ok', 'runner', { tag_id: 6, freed_at: iso(start + MIN) }),
    ]
    expect(pickWanted(players, [], start)?.id).toBe('ok')
  })
  it('gives a tie to the lowest tag id', () => {
    const nine = player('nine', 'runner', { tag_id: 9 })
    const four = player('four', 'runner', { tag_id: 4 })
    expect(pickWanted([nine, four], [], start)?.id).toBe('four')
  })
  it('skips `except`', () => {
    const a = player('a', 'runner', { tag_id: 1 })
    const b = player('b', 'runner', { tag_id: 2 })
    expect(pickWanted([a, b], [], start, 'a')?.id).toBe('b')
  })
  it('gives null when nobody is eligible', () => {
    expect(pickWanted([player('j', 'runner', { jailed: true })], [], start)).toBeNull()
    expect(pickWanted([], [], start)).toBeNull()
    expect(pickWanted([player('a', 'runner')], [], start, 'a')).toBeNull()
  })
})

describe('maskEndgame', () => {
  it('strips an unrevealed endgame', () => {
    const g = game({ endgame: state('bomba') })
    expect(maskEndgame(g).endgame).toBeNull()
    expect(g.endgame).not.toBeNull()
  })
  it('keeps a revealed one', () => {
    const e = state('pkp', { revealedAt: iso(T0) })
    expect(maskEndgame(game({ endgame: e })).endgame).toEqual(e)
  })
  it('leaves a game with none as null', () => {
    expect(maskEndgame(game()).endgame).toBeNull()
  })
})
