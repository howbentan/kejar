import type { StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl'

/** Faint grey names, so players can recognise where they are without competing with game colours. */
const LABEL: SymbolLayerSpecification['layout'] = { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'] }
const LABEL_PAINT: SymbolLayerSpecification['paint'] = { 'text-halo-color': '#0E120F', 'text-halo-width': 1.2 }

/** Minimal dark Kejar map on free OpenFreeMap vector tiles (OpenMapTiles schema). */
export const kejarMapStyle: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#0E120F' } },
    { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', paint: { 'fill-color': '#152219' } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#172A1D' } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#173A55' } },
    {
      id: 'buildings',
      type: 'fill',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-color': '#1D221F' },
    },
    {
      id: 'roads',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      paint: { 'line-color': '#2E3832', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 18, 6] },
    },
    {
      id: 'water-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'water_name',
      layout: { ...LABEL, 'text-size': 12, 'text-font': ['Noto Sans Italic'] },
      paint: { ...LABEL_PAINT, 'text-color': 'rgba(245, 245, 243, 0.45)' },
    },
    {
      id: 'street-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 14,
      layout: { ...LABEL, 'symbol-placement': 'line', 'text-size': 11 },
      paint: { ...LABEL_PAINT, 'text-color': 'rgba(245, 245, 243, 0.5)' },
    },
    {
      id: 'park-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'park',
      layout: { ...LABEL, 'text-size': 12 },
      paint: { ...LABEL_PAINT, 'text-color': 'rgba(245, 245, 243, 0.6)' },
    },
    {
      id: 'place-names',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      layout: { ...LABEL, 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 },
      paint: { ...LABEL_PAINT, 'text-color': 'rgba(245, 245, 243, 0.55)' },
    },
  ],
}
