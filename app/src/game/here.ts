/** This phone's current coordinates for a scan, or {} if location isn't available within 5 s. */
export function currentCoords(): Promise<{ lat?: number; lng?: number; accuracy_m?: number }> {
  if (!('geolocation' in navigator)) return Promise.resolve({})
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy }),
      () => resolve({}),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 5_000 },
    ),
  )
}
