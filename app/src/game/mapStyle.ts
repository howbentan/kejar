import type { FilterSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl'

/** The owner's handwriting; glyph files live in public/fonts/Kejar Hand Regular. */
export const MAP_FONT = ['Kejar Hand Regular']
export const FLAT_BUILDING_LAYERS = ['buildings', 'buildings-line']
export const BUILDINGS_3D = 'buildings-3d'

const origin = typeof location === 'undefined' ? '' : location.origin

const PATHS: FilterSpecification = ['in', ['get', 'class'], ['literal', ['path', 'track']]]
const ROADS: FilterSpecification = ['!', PATHS]

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

/** Black, white and grey "Ink" map on free OpenFreeMap vector tiles (OpenMapTiles schema). */
export const kejarMapStyle: StyleSpecification = {
  version: 8,
  glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#0A0A0B' } },
    { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', paint: { 'fill-color': '#121213' } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#161618' } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#232428' } },
    {
      id: 'buildings',
      type: 'fill',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-color': '#1B1B1D' },
    },
    {
      id: 'buildings-line',
      type: 'line',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'line-color': '#26262A', 'line-width': 0.6 },
    },
    {
      id: 'roads',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: ROADS,
      paint: { 'line-color': '#2C2C2F', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 18, 6] },
    },
    {
      id: 'paths',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      filter: PATHS,
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
      'source-layer': 'building',
      minzoom: 14,
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': '#2E2E33',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      id: 'water-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'water_name',
      layout: label(17),
      paint: labelPaint('rgba(245,245,243,.42)'),
    },
    {
      id: 'street-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 14,
      layout: label(15, { 'symbol-placement': 'line' }),
      paint: labelPaint('rgba(245,245,243,.42)'),
    },
    {
      id: 'park-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'park',
      layout: label(17),
      paint: labelPaint('rgba(245,245,243,.62)'),
    },
    {
      id: 'place-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      layout: label(17),
      paint: labelPaint('rgba(245,245,243,.42)'),
    },
  ],
}
