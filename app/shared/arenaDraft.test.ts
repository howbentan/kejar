import { describe, expect, it } from 'vitest'
import { arenaAroundPoint } from './arenas.js'
import { arenaFromDraft, pointProblems, type ArenaDraft } from './arenaDraft.js'
import { distanceM } from './geo.js'
import { buildPlayArea, inPlayArea } from './playArea.js'
import type { LatLng } from './types.js'

const C = { lat: 3.15, lng: 101.7 }
const M = 111_195
const at = (dx: number, dy: number): LatLng => ({ lat: C.lat + dy / M, lng: C.lng + dx / (M * Math.cos((C.lat * Math.PI) / 180)) })
const rect = (x0: number, y0: number, x1: number, y1: number): LatLng[] => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]

const park: ArenaDraft = {
  name: 'Test Park',
  source: 'osm',
  osmRef: 'way/1',
  outline: rect(-200, -200, 200, 200),
  circle: null,
  water: [rect(-50, -50, 50, 50)],
  toilets: [],
  waterChecked: true,
  jail: null,
  start: null,
  stations: [],
}

describe('arenaFromDraft', () => {
  it('defaults jail and start into the play area', () => {
    const a = arenaFromDraft(park, 'a1')
    expect(a).toMatchObject({ id: 'a1', name: 'Test Park' })
    expect(inPlayArea(a.jail, a)).toBe(true)
    expect(inPlayArea(a.start, a)).toBe(true)
    expect(a.holes).toHaveLength(1)
  })

  it('rejects a station in the lake with "Station 2 must be inside the play area"', () => {
    expect(() => arenaFromDraft({ ...park, stations: [at(150, 0), at(0, 0)] }, 'a1')).toThrow(
      'Station 2 must be inside the play area',
    )
  })

  it('rejects a jail or start outside the play area', () => {
    expect(() => arenaFromDraft({ ...park, jail: at(0, 300) }, 'a1')).toThrow('Jail must be inside the play area')
    expect(() => arenaFromDraft({ ...park, start: at(10, 10) }, 'a1')).toThrow('Start must be inside the play area')
  })

  it('rejects an over-cap park without a circle', () => {
    expect(() => arenaFromDraft({ ...park, outline: rect(-500, -500, 500, 500), water: [] }, 'a1')).toThrow(
      'Too big — use part of the park (circle)',
    )
    // The same park with a circle is fine.
    expect(() =>
      arenaFromDraft({ ...park, outline: rect(-500, -500, 500, 500), water: [], circle: { center: C, radiusM: 300 } }, 'a1'),
    ).not.toThrow()
  })

  it('checks the circle size, the station count and the name', () => {
    expect(() => arenaFromDraft({ ...park, circle: { center: C, radiusM: 600 } }, 'a1')).toThrow('100–500 m')
    expect(() => arenaFromDraft({ ...park, stations: Array(9).fill(at(150, 0)) }, 'a1')).toThrow('At most 8 stations')
    expect(() => arenaFromDraft({ ...park, name: '   ' }, 'a1')).toThrow('Give the park a name')
  })

  it('keeps only toilets inside the play area', () => {
    const a = arenaFromDraft({ ...park, toilets: [at(100, 100), at(0, 400), at(0, 0)] }, 'a1')
    expect(a.toilets).toEqual([at(100, 100)])
  })

  it('a circle on its own is a play area', () => {
    const a = arenaFromDraft({ ...park, source: 'circle', osmRef: null, outline: null, water: [], circle: { center: C, radiusM: 200 } }, 'a1')
    expect(distanceM(a.boundary[0], C)).toBeCloseTo(200, -1)
  })
})

describe('pointProblems', () => {
  it('lists what moved out after the area shrank', () => {
    const dry = arenaFromDraft({ ...park, water: [], jail: at(0, 0), start: at(150, 0), stations: [at(0, 20)] }, 'a1')
    const area = buildPlayArea({ outline: park.outline, water: park.water, circle: null })
    expect(pointProblems({ ...dry, boundary: area.boundary, holes: area.holes })).toEqual([
      'Jail must be inside the play area',
      'Station 1 must be inside the play area',
    ])
    expect(pointProblems(dry)).toEqual([])
  })
})

describe('arenaAroundPoint', () => {
  it('still builds a 200 m circle by default', () => {
    const a = arenaAroundPoint(C)
    expect(a.id).toBe('around-me')
    expect(distanceM(a.boundary[0], C)).toBeCloseTo(200, -1)
    expect(a.jail).toEqual(C)
  })
})
