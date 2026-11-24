import { describe, expect, it } from 'vitest'
import { BUILDINGS_3D, FLAT_BUILDING_LAYERS, MAP_FONT, kejarMapStyle, ownMapStyle } from './mapStyle'

type AnyLayer = { id: string; type: string; filter?: unknown; paint?: Record<string, unknown>; layout?: Record<string, unknown> }
const all = kejarMapStyle.layers as AnyLayer[]
const byId = (id: string) => all.find((l) => l.id === id)!
const labels = all.filter((l) => l.type === 'symbol')

describe('kejarMapStyle', () => {
  it('paints the base map in Ink only', () => {
    expect(byId('background').paint!['background-color']).toBe('#0A0A0B')
    expect(byId('landcover').paint!['fill-color']).toBe('#121213')
    expect(byId('park').paint!['fill-color']).toBe('#161618')
    expect(byId('water').paint!['fill-color']).toBe('#232428')
    expect(byId('buildings').paint!['fill-color']).toBe('#202023')
    expect(byId('buildings-line').type).toBe('line')
    expect(byId('buildings-line').paint!['line-color']).toBe('rgba(245,245,243,.42)')
    expect(byId('roads').paint!['line-color']).toBe('#2C2C2F')
    expect(JSON.stringify(all)).not.toMatch(/c6ff3d|198, ?255, ?61/i)
    expect(FLAT_BUILDING_LAYERS).toEqual(['buildings', 'buildings-line'])
  })

  it('draws footpaths as their own fine dashed lines', () => {
    const paths = byId('paths')
    expect(paths.filter).toEqual(['in', ['get', 'class'], ['literal', ['path', 'track']]])
    expect(paths.paint!['line-color']).toBe('rgba(245,245,243,.32)')
    expect(paths.paint!['line-dasharray']).toEqual([2, 1.5])
    expect(byId('roads').filter).toEqual(['!', paths.filter])
  })

  it('writes every name in Kejar Hand, lowercase', () => {
    expect(labels.length).toBeGreaterThan(0)
    for (const l of labels) {
      expect(l.layout!['text-font']).toEqual(MAP_FONT)
      expect(l.layout!['text-transform']).toBe('lowercase')
      expect(l.layout!['text-letter-spacing']).toBe(0)
    }
  })

  it('has 3D buildings, hidden until asked for', () => {
    const b = byId(BUILDINGS_3D)
    expect(b.type).toBe('fill-extrusion')
    expect(b.paint!['fill-extrusion-color']).toBe('#2E2E33')
    expect(b.paint!['fill-extrusion-opacity']).toBe(0.9)
    expect(b.paint!['fill-extrusion-height']).toEqual(['coalesce', ['get', 'render_height'], 8])
    expect(b.paint!['fill-extrusion-base']).toEqual(['coalesce', ['get', 'render_min_height'], 0])
    expect(b.layout!.visibility).toBe('none')
  })

  it('loads its glyphs from our own origin', () => {
    expect(kejarMapStyle.glyphs!.endsWith('/fonts/{fontstack}/{range}.pbf')).toBe(true)
    expect(kejarMapStyle.glyphs).not.toContain('openfreemap')
  })

  it('draws names below the game layers', () => {
    const ids = all.map((l) => l.id)
    expect(ids[ids.length - 1]).not.toBe('arena')
    expect(ids.indexOf('street-names')).toBeGreaterThan(ids.indexOf('roads'))
  })
})

describe('ownMapStyle (our Protomaps file)', () => {
  const own = ownMapStyle('https://maps.example/my-sg.pmtiles')
  const layers = own.layers as AnyLayer[]
  const get = (id: string) => layers.find((l) => l.id === id)! as AnyLayer & { 'source-layer'?: string }

  it('reads our file through the pmtiles protocol', () => {
    expect(own.sources.omt).toEqual({ type: 'vector', url: 'pmtiles://https://maps.example/my-sg.pmtiles' })
    expect(JSON.stringify(own)).not.toContain('openfreemap')
  })

  it('keeps every layer id and Ink colour of the OpenFreeMap style', () => {
    expect(layers.map((l) => l.id)).toEqual(all.map((l) => l.id))
    for (const l of all) if (l.id !== BUILDINGS_3D) expect(get(l.id).paint).toEqual(l.paint)
  })

  it('maps each layer to the Protomaps names', () => {
    expect(get('buildings')['source-layer']).toBe('buildings')
    expect(get('roads')['source-layer']).toBe('roads')
    expect(get('paths').filter).toEqual(['==', ['get', 'kind'], 'path'])
    expect(get('roads').filter).toEqual(['!', ['==', ['get', 'kind'], 'path']])
    expect(get('park')['source-layer']).toBe('landuse')
    expect(get('place-names')['source-layer']).toBe('places')
    expect(get(BUILDINGS_3D).paint!['fill-extrusion-height']).toEqual(['coalesce', ['get', 'height'], 8])
    expect(get(BUILDINGS_3D).paint!['fill-extrusion-base']).toEqual(['coalesce', ['get', 'min_height'], 0])
  })
})
