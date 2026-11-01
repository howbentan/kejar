import { useEffect, useRef, useState } from 'react'
import { distanceM } from '../../shared/geo.js'
import type { Arena, LatLng } from '../../shared/types.js'
import GameMap from './Map'

/** Within this distance the runner has reached Penjara, and the spectator view takes over (motion design §5). */
export const ARRIVED_M = 30
/** No fix by now: point at the pin instead of waiting. */
const NO_FIX_MS = 10_000

/**
 * Walk to Penjara (motion design §5): worked out on this phone only. It watches the phone's own GPS and never
 * sends it, so a jailed runner still isn't tracked (base spec §6).
 */
export function WalkGuide({ jail, arena, onArrived }: { jail: LatLng; arena?: Arena; onArrived: () => void }) {
  const [here, setHere] = useState<LatLng | null>(null)
  const [lost, setLost] = useState(false)
  const arrived = useRef(false)

  useEffect(() => {
    const geo = navigator.geolocation
    if (!geo) {
      setLost(true)
      return
    }
    const give = window.setTimeout(() => setLost(true), NO_FIX_MS)
    const id = geo.watchPosition(
      (p) => {
        window.clearTimeout(give)
        setLost(false)
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => setLost(true),
      { enableHighAccuracy: true, maximumAge: 5_000 },
    )
    return () => {
      window.clearTimeout(give)
      geo.clearWatch(id)
    }
  }, [])

  const metres = here ? distanceM(here, jail) : null
  useEffect(() => {
    if (metres !== null && metres <= ARRIVED_M && !arrived.current) {
      arrived.current = true
      onArrived()
    }
  }, [metres, onArrived])

  return (
    <div className="walk-guide">
      {arena && (
        <GameMap
          arena={arena}
          dots={here ? [{ id: 'me', kind: 'me', lat: here.lat, lng: here.lng, at: new Date().toISOString() }] : []}
          route={here ? { from: here, to: jail } : null}
          height={220}
        />
      )}
      {metres !== null && !lost ? (
        <p className="walk-distance">{`${Math.round(metres / 10) * 10} M · WALK, DON'T RUN`}</p>
      ) : (
        <p className="muted">{lost ? 'Walk to the PENJARA pin on the map.' : 'Finding you…'}</p>
      )}
    </div>
  )
}
