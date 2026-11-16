import { describe, expect, it } from 'vitest'
import { game } from './fixtures.js'
import { distanceM } from './geo.js'
import { inPlayArea } from './playArea.js'
import { boxFor, judgeSlip, mirroredSpots, sideOf } from './tupperware.js'
import { DEFAULT_SETTINGS, type Game, type Slip } from './types.js'

const full = (over: Partial<Game> = {}, legendaries: Partial<Game['settings']['legendaries']> = {}) =>
  game({
    settings: { ...DEFAULT_SETTINGS, mode: 'full', legendaries: { dato: 'off', ring: 'off', bomoh: 'off', hijau: 'off', ...legendaries } },
    ...over,
  })

const dropped = { lat: 3.006, lng: 101.006, claimedBy: null, claimedAt: null }

describe('sideOf', () => {
  it('maps runners to dikejar and chasers to kejar', () => {
    expect(sideOf('runner')).toBe('dikejar')
    expect(sideOf('chaser')).toBe('kejar')
    expect(sideOf('marshal')).toBeNull()
    expect(sideOf(null)).toBeNull()
  })
})

describe('boxFor', () => {
  it('finds the side legendary that is on a stash and has been dropped', () => {
    const g = full({ ring_stash: dropped }, { ring: 'stash' })
    expect(boxFor(g, 'dikejar')).toEqual({ legendary: 'ring', spot: dropped })
  })
  it('is null when the stash is not dropped yet', () => {
    const g = full({ ring_stash: { lat: null, lng: null, claimedBy: null, claimedAt: null } as never }, { ring: 'stash' })
    expect(boxFor(g, 'dikejar')).toBeNull()
  })
  it('is null in Core mode', () => {
    const g = game({ ring_stash: dropped, settings: { ...DEFAULT_SETTINGS, legendaries: { ...DEFAULT_SETTINGS.legendaries, ring: 'stash' } } })
    expect(boxFor(g, 'dikejar')).toBeNull()
  })
  it('never gives dikejar a Kejar legendary', () => {
    const g = full({ bomoh_stash: dropped }, { bomoh: 'stash' })
    expect(boxFor(g, 'dikejar')).toBeNull()
    expect(boxFor(g, 'kejar')?.legendary).toBe('bomoh')
  })
  it('is null for a legacy colour card dropped before the Tupperware (a stash with a code)', () => {
    const g = full({ dato_stash: { ...dropped, code: 'legacy-card-code', card: { id: 'sc1', letter: 'A' } } }, { dato: 'stash' })
    expect(boxFor(g, 'dikejar')).toBeNull()
  })
  it('reads older games that lack legendary keys', () => {
    const g = full({ hijau_stash: dropped })
    g.settings.legendaries = { hijau: 'stash' } as never
    expect(boxFor(g, 'kejar')?.legendary).toBe('hijau')
  })
})

describe('judgeSlip', () => {
  const slip = (over: Partial<Slip> = {}): Slip => ({
    id: 's1',
    organisation_id: 'org',
    side: 'dikejar',
    number: 1,
    token: 't',
    bound_game_id: null,
    bound_at: null,
    used_at: null,
    used_by: null,
    ...over,
  })
  const box: NonNullable<ReturnType<typeof boxFor>> = { legendary: 'ring', spot: dropped }
  const base = { slip: slip(), organisationId: 'org', gameId: 'g1', side: 'dikejar' as const, triedBefore: false, box }
  const verdict = (over: Partial<Omit<typeof base, 'slip' | 'box'>> & { slip?: Slip | null; box?: typeof box | null }) =>
    judgeSlip({ ...base, ...over })

  it('accepts a good slip', () => expect(verdict({})).toEqual({ ok: true }))
  it('no-try wins over everything', () => {
    expect(verdict({ triedBefore: true })).toEqual({ ok: false, reason: 'no-try' })
    expect(verdict({ triedBefore: true, slip: null, box: null })).toEqual({ ok: false, reason: 'no-try' })
  })
  it('wrong: no slip, other organisation, used, or bound to another game', () => {
    const wrong = { ok: false, reason: 'wrong' }
    expect(verdict({ slip: null })).toEqual(wrong)
    expect(verdict({ slip: slip({ organisation_id: 'other' }) })).toEqual(wrong)
    expect(verdict({ slip: slip({ used_at: '2026-01-01T00:00:00Z' }) })).toEqual(wrong)
    expect(verdict({ slip: slip({ bound_game_id: 'g2' }) })).toEqual(wrong)
    expect(verdict({ slip: slip({ side: 'kejar', used_at: '2026-01-01T00:00:00Z' }) })).toEqual(wrong)
    expect(verdict({ slip: slip({ side: 'kejar', bound_game_id: 'g2' }), box: null })).toEqual(wrong)
  })
  it('a slip bound to this game still works', () => {
    expect(verdict({ slip: slip({ bound_game_id: 'g1' }) })).toEqual({ ok: true })
  })
  it('not-yours wins over no-box and taken', () => {
    expect(verdict({ slip: slip({ side: 'kejar' }) })).toEqual({ ok: false, reason: 'not-yours' })
    expect(verdict({ slip: slip({ side: 'kejar' }), box: null })).toEqual({ ok: false, reason: 'not-yours' })
  })
  it('no-box wins over taken', () => expect(verdict({ box: null })).toEqual({ ok: false, reason: 'no-box' }))
  it('taken when someone already claimed it', () => {
    const taken: typeof box = { legendary: 'ring', spot: { ...dropped, claimedBy: 'p9', claimedAt: 'x' } }
    expect(verdict({ box: taken })).toEqual({ ok: false, reason: 'taken' })
  })
})

describe('mirroredSpots', () => {
  const arena = game().arena
  it('puts both spots inside the play area, equally far from the start', () => {
    const s = mirroredSpots(arena, 'seed-a')
    expect(inPlayArea(s.dikejar, arena)).toBe(true)
    expect(inPlayArea(s.kejar, arena)).toBe(true)
    expect(Math.abs(distanceM(arena.start, s.dikejar) - distanceM(arena.start, s.kejar))).toBeLessThan(1)
    expect(distanceM(arena.start, s.dikejar)).toBeGreaterThanOrEqual(20)
  })
  it('is deterministic per seed and differs between seeds', () => {
    expect(mirroredSpots(arena, 'seed-a')).toEqual(mirroredSpots(arena, 'seed-a'))
    expect(mirroredSpots(arena, 'seed-a')).not.toEqual(mirroredSpots(arena, 'seed-b'))
  })
  it('falls back to the start when no direction has room', () => {
    const tiny = {
      start: arena.start,
      boundary: [
        { lat: 3.005, lng: 101.005 },
        { lat: 3.005, lng: 101.00501 },
        { lat: 3.00501, lng: 101.00501 },
        { lat: 3.00501, lng: 101.005 },
      ],
    }
    expect(mirroredSpots(tiny, 'x')).toEqual({ dikejar: arena.start, kejar: arena.start })
  })
})
