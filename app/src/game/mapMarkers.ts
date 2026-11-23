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
