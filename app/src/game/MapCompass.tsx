import { useEffect, useId, useState } from 'react'
import type maplibregl from 'maplibre-gl'

/**
 * The doodled compass (design 2026-11-24 §2): its needle points north as the map turns (dragging or the 3D view's
 * bearing), and a tap turns the map back to north, then the needle wiggles. "u" is utara. It sits on the map's right
 * side above the 3D button: the top right is the SOS button's.
 */
export default function MapCompass({ map, ready }: { map: maplibregl.Map | null; ready: boolean }) {
  const [bearing, setBearing] = useState(0)
  const [wiggle, setWiggle] = useState(0)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  useEffect(() => {
    if (!map || !ready) return
    // Test maps may lack these; a real one always has them.
    const on = () => setBearing(map.getBearing?.() ?? 0)
    on()
    map.on('rotate', on)
    return () => {
      map.off?.('rotate', on)
    }
  }, [map, ready])
  const north = () => {
    if (!map) return
    map.easeTo({ bearing: 0, duration: 450 })
    window.setTimeout(() => setWiggle((w) => w + 1), 460)
  }
  return (
    <button type="button" className="map-compass" onClick={north} aria-label="Compass: turn the map back to north">
      <svg viewBox="0 0 62 62" aria-hidden="true">
        <defs>
          <filter id={`cw-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves={2} seed={4} />
            <feDisplacementMap in="SourceGraphic" scale={2.4} />
          </filter>
        </defs>
        <g filter={`url(#cw-${id})`} fill="none" stroke="#F5F5F3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="31" cy="31" r="25" fill="#0A0A0B" strokeWidth="2" />
          <path d="M31 9.5 C44 10 52.6 19 52.3 31.6 C52 43.4 43 52.4 30.6 52.2 C18.6 52 9.8 43.4 10 30.8 C10.3 19.6 18.5 10.4 32.2 9.9" strokeWidth="1" opacity=".5" />
          <path d="M31 7v3.5M31 51.5V55M7 31h3.5M51.5 31H55" strokeWidth="1.6" />
        </g>
        <g key={wiggle} className={wiggle ? 'needle wiggle' : 'needle'} style={{ transform: `rotate(${-bearing}deg)` }} filter={`url(#cw-${id})`} stroke="#0A0A0B" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M31 13 L36.5 31 L25.5 31 Z" fill="#F5F5F3" />
          <path d="M31 49 L36.5 31 L25.5 31 Z" fill="#3a3a3f" stroke="#F5F5F3" strokeWidth="1" />
          <circle cx="31" cy="31" r="2.4" fill="#0A0A0B" stroke="#F5F5F3" />
          <text x="31" y="5.5" textAnchor="middle" fill="#F5F5F3" stroke="none" fontFamily="Kejar Hand, cursive" fontSize="11">
            u
          </text>
        </g>
      </svg>
    </button>
  )
}
