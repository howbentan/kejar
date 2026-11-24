import type { ExpressionSpecification, FilterSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl'

/** The owner's handwriting; glyph files live in public/fonts/Kejar Hand Regular. */
export const MAP_FONT = ['Kejar Hand Regular']
/** Station numbers on the map stay in Geist (owner's call): the handwriting is for names. */
export const MAP_NUMBER_FONT = ['Geist Regular']
export const FLAT_BUILDING_LAYERS = ['buildings', 'buildings-line']
export const BUILDINGS_3D = 'buildings-3d'

const origin = typeof location === 'undefined' ? '' : location.origin

/** Lowercase Kejar Hand names; sizes are set per layer. */
const label = (size: number, extra: SymbolLayerSpecification['layout'] = {}): SymbolLayerSpecification['layout'] => ({
  'text-field': ['get', 'name'],
  'text-font': MAP_FONT,
  'text-size': size,
  'text-transform': 'lowercase',
  'text-letter-spacing': 0,
  ...extra,
})
const labelPaint = (color: string): SymbolLayerSpecification['paint'] => ({
  'text-color': color,
  'text-halo-color': '#0A0A0B',
  'text-halo-width': 1.2,
})

/**
 * Where each Ink layer reads from, per tile format. Layer ids stay the same in both, so the rest of the map code
 * (3D toggles, label lists) doesn't care which tiles are on.
 */
type Schema = {
  source: StyleSpecification['sources'][string]
  landcover: { layer: string; filter?: FilterSpecification }
  park: { layer: string; filter?: FilterSpecification }
  building: string
  height: string
  base: string
  roads: { layer: string; paths: ExpressionSpecification }
  waterNames: { layer: string; filter?: FilterSpecification }
  streetNames: string
  parkNames: { layer: string; filter?: FilterSpecification }
  places: string
}

const PARK_KINDS = ['park', 'garden', 'playground', 'pitch', 'nature_reserve', 'golf_course', 'dog_park', 'national_park']

/** OpenFreeMap's planet (OpenMapTiles schema): the fallback when our own file can't be reached. */
const OPENFREEMAP: Schema = {
  source: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  landcover: { layer: 'landcover' },
  park: { layer: 'park' },
  building: 'building',
  height: 'render_height',
  base: 'render_min_height',
  roads: { layer: 'transportation', paths: ['in', ['get', 'class'], ['literal', ['path', 'track']]] },
  waterNames: { layer: 'water_name' },
  streetNames: 'transportation_name',
  parkNames: { layer: 'park' },
  places: 'place',
}

/** Our own Malaysia + Singapore file on Cloudflare R2 (Protomaps schema), read through the pmtiles protocol. */
const protomaps = (url: string): Schema => ({
  source: { type: 'vector', url: `pmtiles://${url}` },
  landcover: { layer: 'landuse', filter: ['!', ['in', ['get', 'kind'], ['literal', PARK_KINDS]]] },
  park: { layer: 'landuse', filter: ['in', ['get', 'kind'], ['literal', PARK_KINDS]] },
  building: 'buildings',
  height: 'height',
  base: 'min_height',
  roads: { layer: 'roads', paths: ['==', ['get', 'kind'], 'path'] },
  waterNames: { layer: 'water', filter: ['==', ['geometry-type'], 'Point'] },
  streetNames: 'roads',
  parkNames: { layer: 'pois', filter: ['in', ['get', 'kind'], ['literal', PARK_KINDS]] },
  places: 'places',
})

const f = (filter?: FilterSpecification) => (filter ? { filter } : {})

/** Black, white and grey "Ink" map, drawn the same from either tile source. */
function inkStyle(s: Schema): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
    sources: { omt: s.source },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#0A0A0B' } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': s.landcover.layer, ...f(s.landcover.filter), paint: { 'fill-color': '#121213' } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': s.park.layer, ...f(s.park.filter), paint: { 'fill-color': '#161618' } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#232428' } },
      { id: 'buildings', type: 'fill', source: 'omt', 'source-layer': s.building, minzoom: 14, paint: { 'fill-color': '#202023' } },
      {
        id: 'buildings-line',
        type: 'line',
        source: 'omt',
        'source-layer': s.building,
        minzoom: 14,
        paint: { 'line-color': 'rgba(245,245,243,.42)', 'line-width': 1.1 },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'omt',
        'source-layer': s.roads.layer,
        filter: ['!', s.roads.paths],
        paint: { 'line-color': '#2C2C2F', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 18, 6] },
      },
      {
        id: 'paths',
        type: 'line',
        source: 'omt',
        'source-layer': s.roads.layer,
        filter: s.roads.paths,
        paint: {
          'line-color': 'rgba(245,245,243,.32)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 18, 2],
          'line-dasharray': [2, 1.5],
        },
      },
      {
        id: BUILDINGS_3D,
        type: 'fill-extrusion',
        source: 'omt',
        'source-layer': s.building,
        minzoom: 14,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': '#2E2E33',
          'fill-extrusion-height': ['coalesce', ['get', s.height], 8],
          'fill-extrusion-base': ['coalesce', ['get', s.base], 0],
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      {
        id: 'water-names',
        type: 'symbol',
        source: 'omt',
        'source-layer': s.waterNames.layer,
        ...f(s.waterNames.filter),
        layout: label(17),
        paint: labelPaint('rgba(245,245,243,.42)'),
      },
      {
        id: 'street-names',
        type: 'symbol',
        source: 'omt',
        'source-layer': s.streetNames,
        minzoom: 14,
        layout: label(15, { 'symbol-placement': 'line' }),
        paint: labelPaint('rgba(245,245,243,.42)'),
      },
      {
        id: 'park-names',
        type: 'symbol',
        source: 'omt',
        'source-layer': s.parkNames.layer,
        ...f(s.parkNames.filter),
        layout: label(17),
        paint: labelPaint('rgba(245,245,243,.62)'),
      },
      {
        id: 'place-names',
        type: 'symbol',
        source: 'omt',
        'source-layer': s.places,
        layout: label(17),
        paint: labelPaint('rgba(245,245,243,.42)'),
      },
    ],
  }
}

/** The Ink map on OpenFreeMap's tiles (the fallback). */
export const kejarMapStyle: StyleSpecification = inkStyle(OPENFREEMAP)
/** The Ink map on our own file at `url`. */
export const ownMapStyle = (url: string): StyleSpecification => inkStyle(protomaps(url))
