import type maplibregl from 'maplibre-gl'

/**
 * The map's drawn markers: the logo's own j (cut from the logo: volt for Dikejar and pings, white for Kejar), the
 * Penjara gate and the start flag. Each is a 2x image in /map; a layer that uses one draws as soon as it has loaded.
 */
export const MAP_ICONS = [
  'j-runner',
  'j-chaser',
  'j-ghost',
  'penjara',
  'start',
  'dia-volt',
  'dia-red',
  'dia-gold',
  'dia-purple',
  'gem-volt-float',
  'gem-gold-float',
  'gem-purple-float',
  'gem-red',
  'j-runner-float',
  'j-chaser-float',
  'j-ghost-float',
  'penjara-float',
  'start-float',
] as const
export function addMapIcons(m: maplibregl.Map) {
  if (typeof m.addImage !== 'function' || typeof Image === 'undefined') return
  for (const name of MAP_ICONS) {
    if (m.hasImage?.(name)) continue
    const img = new Image()
    img.onload = () => {
      if (!m.hasImage?.(name)) m.addImage(name, img, { pixelRatio: 2 })
    }
    img.src = `/map/${name}.png`
  }
}

/** The 3D view's soft ground shadow under a floating marker (radius 8 for a j, 13 for a gem). */
export const shadowPaint = (radius: number) => ({
  'circle-radius': radius,
  'circle-color': '#000',
  'circle-opacity': 0.55,
  'circle-blur': 0.7,
  'circle-pitch-alignment': 'map' as const,
})
export const FLOAT_ICON = { 'icon-anchor': 'bottom' as const, 'icon-allow-overlap': true, 'icon-ignore-placement': true }
/** The 3D view's gems (floating and landed) draw at this icon-size. */
export const GEM_SIZE = 1.2
/** CSS px of dotted stem under a floating marker's art (64 px in the 2x images: STEM in scripts/build-map-markers.py). */
export const STEM_PX = 32
/** A landed gem sits a little under its spot, in icon units (MapLibre scales icon-offset by icon-size). */
export const LANDED_OFFSET: [number, number] = [0, 6]
/**
 * Paint for every layer the float motion moves: MapLibre eases each icon-translate change over 300 ms by default, which
 * would turn a per-frame bob or drop into a lagging slide.
 */
/**
 * A mark's floating twin for 3D (Penjara, the start): its doodle on a dotted stem with a soft shadow on its spot,
 * hidden until the 3D view shows it. Layer ids are `float-<source>` and `float-shadow-<source>`.
 */
export function addFloatingMark(m: maplibregl.Map, source: string, image: string | maplibregl.ExpressionSpecification, before?: string) {
  m.addLayer({ id: `float-shadow-${source}`, type: 'circle', source, paint: shadowPaint(12), layout: { visibility: 'none' } }, before)
  m.addLayer({ id: `float-${source}`, type: 'symbol', source, layout: { 'icon-image': image, 'icon-size': 0.9, ...FLOAT_ICON, visibility: 'none' } }, before)
}

export const INSTANT_TRANSLATE = { 'icon-translate-transition': { duration: 0, delay: 0 } }
