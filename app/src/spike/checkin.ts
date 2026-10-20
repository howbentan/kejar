export type PositionResult =
  | { lat: number; lng: number; accuracy_m: number }
  | { error: 'denied' | 'unavailable' | 'timeout' | 'unsupported' }

type DbError = { code?: string; message?: string } | null

/** The slice of the Supabase client that check-ins need. */
export interface CheckinDb {
  from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: DbError }> }
}

const GEO_ERRORS: Record<number, 'denied' | 'unavailable' | 'timeout'> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' }

export function readPosition(geo: Geolocation | undefined, timeoutMs = 10000): Promise<PositionResult> {
  if (!geo) return Promise.resolve({ error: 'unsupported' })
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy }),
      (e) => resolve({ error: GEO_ERRORS[e.code] ?? 'unavailable' }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    )
  })
}

export async function submitCheckin(
  db: CheckinDb,
  pingId: string,
  deviceId: string,
  pos: PositionResult,
): Promise<'ok' | 'duplicate'> {
  const located = 'lat' in pos
  const { error } = await db.from('spike_checkins').insert({
    ping_id: pingId,
    device_id: deviceId,
    lat: located ? pos.lat : null,
    lng: located ? pos.lng : null,
    accuracy_m: located ? pos.accuracy_m : null,
    error: located ? null : pos.error,
  })
  if (!error) return 'ok'
  if (error.code === '23505') return 'duplicate'
  throw new Error(error.message ?? 'Check-in failed')
}
