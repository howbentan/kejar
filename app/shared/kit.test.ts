import { describe, expect, it } from 'vitest'
import { game } from './fixtures.js'
import { crewFor, isTicked, packItems, placeItems } from './kit.js'
import { DEFAULT_SETTINGS, type Game } from './types.js'

const withArena = (over: Partial<Game> = {}) =>
  game({
    arena: {
      ...game().arena,
      stations: Array.from({ length: 8 }, (_, i) => ({ lat: 3.001 + i / 1000, lng: 101.001 })),
    },
    ...over,
  })
const full = (over: Partial<Game> = {}) => withArena({ settings: { ...DEFAULT_SETTINGS, mode: 'full' }, ...over })
const label = (items: { id: string; label: string }[], id: string) => items.find((i) => i.id === id)?.label

describe('packItems', () => {
  it('always packs armbands #01–#40, whatever the band', () => {
    for (const playersBand of [20, 30, 40] as const) {
      const items = packItems(withArena({ settings: { ...DEFAULT_SETTINGS, playersBand } }), {})
      expect(label(items, 'armbands')).toBe('Armbands #01–#40')
    }
  })

  it('the band changes only the lime vests count (a fifth of the band, rounded up)', () => {
    const vests = (playersBand: 20 | 30 | 40) =>
      label(packItems(withArena({ settings: { ...DEFAULT_SETTINGS, playersBand } }), {}), 'vests-kejar')
    expect(vests(20)).toBe('4 lime vests')
    expect(vests(30)).toBe('6 lime vests')
    expect(vests(40)).toBe('8 lime vests')
  })

  it('lists the other items in the mockup order and wording', () => {
    const items = packItems(withArena(), {})
    expect(items.map((i) => [i.id, i.label, i.group])).toEqual([
      ['armbands', 'Armbands #01–#40', 'pack'],
      ['vests-kejar', '4 lime vests', 'pack'],
      ['vests-marshal', '2 marshal vests', 'pack'],
      ['stations', 'Station cards 1–8', 'pack'],
      ['penjara', 'Penjara card', 'pack'],
      ['tape', 'Tape, zip bags, power bank', 'pack'],
      ['walk', 'Walk the park', 'day'],
      ['brief-helper', 'Brief your helper', 'day'],
    ])
    expect(items.find((i) => i.id === 'brief-helper')?.note).toBe('Penjara, dares, SOS')
  })

  it('leaves out the station cards when the park has no stations', () => {
    expect(packItems(game(), {}).map((i) => i.id)).not.toContain('stations')
  })

  it('Core lists no secret card, even when a letter is passed', () => {
    expect(packItems(withArena(), { dato: 'B' }).map((i) => i.id)).not.toContain('dato-card')
  })

  it('Full with a yellow letter lists Yellow card B, yellow and secret, after Penjara', () => {
    const items = packItems(full(), { dato: 'B' })
    const card = items.find((i) => i.id === 'dato-card')!
    expect(card).toMatchObject({ label: 'Yellow card B', tone: 'yellow', note: '(secret)', group: 'pack' })
    expect(items.map((i) => i.id).indexOf('dato-card')).toBe(items.map((i) => i.id).indexOf('penjara') + 1)
  })

  it('Full with no letter, or Dato Seri off, lists no yellow card', () => {
    expect(packItems(full(), {}).map((i) => i.id)).not.toContain('dato-card')
    const off = full({ settings: { ...DEFAULT_SETTINGS, mode: 'full', legendaries: { dato: 'off', bomoh: 'off' } } })
    expect(packItems(off, { dato: 'B' }).map((i) => i.id)).not.toContain('dato-card')
  })

  it('an older game with no band or legendaries reads the defaults', () => {
    const { playersBand: _b, legendaries: _l, ...old } = DEFAULT_SETTINGS
    const g = withArena({ settings: old as Game['settings'] })
    expect(label(packItems(g, {}), 'vests-kejar')).toBe('4 lime vests')
  })
})

describe('crewFor', () => {
  it('is 2, 3 and 4', () => {
    expect([20, 30, 40].map((b) => crewFor(b as 20 | 30 | 40))).toEqual([2, 3, 4])
  })
})

describe('isTicked', () => {
  it('is true only while the stored label still matches', () => {
    const g20 = withArena({ kit: { ticks: { 'vests-kejar': '4 lime vests' }, placed: {} } })
    const item = packItems(g20, {}).find((i) => i.id === 'vests-kejar')!
    expect(isTicked(g20, item)).toBe(true)
    const g30 = { ...g20, settings: { ...g20.settings, playersBand: 30 as const } }
    const item30 = packItems(g30, {}).find((i) => i.id === 'vests-kejar')!
    expect(item30.label).toBe('6 lime vests')
    expect(isTicked(g30, item30)).toBe(false)
  })

  it('a game with no kit has nothing ticked', () => {
    const g = withArena()
    expect(packItems(g, {}).some((i) => isTicked(g, i))).toBe(false)
  })

  it('Walk the park ticks itself once every non-secret place is placed', () => {
    const ids = [...Array.from({ length: 8 }, (_, i) => `station-${i + 1}`), 'penjara']
    const placed = Object.fromEntries(ids.map((id) => [id, true]))
    const g = withArena({ kit: { ticks: {}, placed } })
    expect(isTicked(g, packItems(g, {}).find((i) => i.id === 'walk')!)).toBe(true)
    const short = withArena({ kit: { ticks: {}, placed: { ...placed, 'station-3': false } } })
    expect(isTicked(short, packItems(short, {}).find((i) => i.id === 'walk')!)).toBe(false)
  })

  it('the secret place does not hold up the auto-tick', () => {
    const ids = [...Array.from({ length: 8 }, (_, i) => `station-${i + 1}`), 'penjara']
    const g = full({ kit: { ticks: {}, placed: Object.fromEntries(ids.map((id) => [id, true])) } })
    expect(isTicked(g, packItems(g, { dato: 'B' }).find((i) => i.id === 'walk')!)).toBe(true)
  })
})

describe('placeItems', () => {
  it('lists stations 1 to 8, then Penjara, at their arena spots', () => {
    const g = withArena()
    const places = placeItems(g, false, {})
    expect(places.map((p) => p.id)).toEqual([...Array.from({ length: 8 }, (_, i) => `station-${i + 1}`), 'penjara'])
    expect(places.at(-1)).toMatchObject({ lat: g.arena.jail.lat, lng: g.arena.jail.lng })
    expect(places[0]).toMatchObject({ lat: g.arena.stations![0].lat, lng: g.arena.stations![0].lng })
  })

  it('puts dato last, yellow, and only for the organiser', () => {
    const g = full()
    expect(placeItems(g, true, { dato: 'B' }).at(-1)).toMatchObject({ id: 'dato', tone: 'yellow' })
    expect(placeItems(g, false, { dato: 'B' }).map((p) => p.id)).not.toContain('dato')
  })

  it('no dato place in Core, with no card assigned, or once the card is claimed', () => {
    expect(placeItems(withArena(), true, { dato: 'B' }).map((p) => p.id)).not.toContain('dato')
    expect(placeItems(full(), true, {}).map((p) => p.id)).not.toContain('dato')
    const claimed = full({ dato_stash: { lat: 3.002, lng: 101.002, claimedBy: 'p1', claimedAt: 'x' } })
    expect(placeItems(claimed, true, { dato: 'B' }).map((p) => p.id)).not.toContain('dato')
  })

  it('dato sits where the stash was dropped', () => {
    const g = full({ dato_stash: { lat: 3.002, lng: 101.003, claimedBy: null, claimedAt: null } })
    expect(placeItems(g, true, { dato: 'B' }).at(-1)).toMatchObject({ lat: 3.002, lng: 101.003 })
  })
})
