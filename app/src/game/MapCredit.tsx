import type { MapTiles } from './mapTiles'

/**
 * The map credit as one slim dim line in the corner (replaces MapLibre's own box). Our own Protomaps file only needs
 * OpenStreetMap's credit; OpenFreeMap's terms ask for all three.
 */
export default function MapCredit({ tiles = 'openfreemap' }: { tiles?: MapTiles }) {
  const link = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  )
  if (tiles === 'own') return <div className="map-credit">© {link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}</div>
  return (
    <div className="map-credit">
      {link('https://openfreemap.org', 'OpenFreeMap')} © {link('https://www.openmaptiles.org/', 'OpenMapTiles')} Data from{' '}
      {link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}
    </div>
  )
}
