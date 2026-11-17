export type Coords = { lat: number; lng: number; accuracy_m: number }

/** The newest fix this phone got from anywhere (a lookup below or the game's position watch), with when it came. */
let last: (Coords & { at: number }) | null = null

/** Keeps a fix as the latest known, for anything that can't wait for a fresh one (the rescue's heartbeat). */
export function rememberCoords(c: Coords): void {
  last = { ...c, at: Date.now() }
}

/** The latest known fix if it is at most `maxAgeMs` old, else null. */
export function lastCoords(maxAgeMs = 10_000): Coords | null {
  if (!last || Date.now() - last.at > maxAgeMs) return null
  return { lat: last.lat, lng: last.lng, accuracy_m: last.accuracy_m }
}

/** This phone's current coordinates for a scan, or {} if location isn't available in time. */
export function currentCoords(timeoutMs = 5_000): Promise<{ lat?: number; lng?: number; accuracy_m?: number }> {
  if (!('geolocation' in navigator)) return Promise.resolve({})
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy }
        rememberCoords(c)
        resolve(c)
      },
      () => resolve({}),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: timeoutMs },
    ),
  )
}
