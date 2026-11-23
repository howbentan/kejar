/** The map credit OpenFreeMap's terms ask for, as one slim dim line in the corner of the map (replaces MapLibre's own box). */
export default function MapCredit() {
  const link = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  )
  return (
    <div className="map-credit">
      {link('https://openfreemap.org', 'OpenFreeMap')} © {link('https://www.openmaptiles.org/', 'OpenMapTiles')} Data from{' '}
      {link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')}
    </div>
  )
}
