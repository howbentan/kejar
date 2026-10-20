export type PositionResult =
  | { lat: number; lng: number; accuracy_m: number }
  | { error: 'denied' | 'unavailable' | 'timeout' | 'unsupported' }

type DbError = { code?: string; message?: string } | null

/** The slice of the Supabase client that check-ins need. */
export interface CheckinDb {
  from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: DbError }> }
}

const PROMPT_GRACE_MS = 2000

const GEO_ERRORS:Record<number, 'denied' | 'unavailable' | 'timeout'> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' }

export function readPosition(geo: Geolocation | undefined, timeoutMs = 10000): Promise<PositionResult> {
  if (!geo) return Promise.resolve({ error: 'unsupported' })
  return new Promise((resolve) => {
    // The browser's own timeout only starts after permission is granted, so an
    // unanswered location prompt would hang forever without this outer guard.
    const guard = setTimeout(() => resolve({ error: 'timeout' }), timeoutMs + PROMPT_GRACE_MS)
    const done = (result: PositionResult) => {
      clearTimeout(guard)
      resolve(result)
    }
    geo.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy }),
      (e) => done({ error: GEO_ERRORS[e.code] ?? 'unavailable' }),
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
