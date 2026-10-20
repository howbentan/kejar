import { describe, expect, it } from 'vitest'
import { readPosition, submitCheckin, type CheckinDb } from './checkin'

const geo = (impl: (ok: (p: unknown) => void, err: (e: unknown) => void) => void) =>
  ({ getCurrentPosition: impl }) as unknown as Geolocation

function fakeDb(result: { error: { code?: string; message?: string } | null }) {
  const rows: Record<string, unknown>[] = []
  const db: CheckinDb = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        rows.push({ table, ...row })
        return result
      },
    }),
  }
  return { db, rows }
}

describe('readPosition', () => {
  it('returns coordinates and accuracy', async () => {
    const pos = await readPosition(geo((ok) => ok({ coords: { latitude: 3.1, longitude: 101.6, accuracy: 12 } })))
    expect(pos).toEqual({ lat: 3.1, lng: 101.6, accuracy_m: 12 })
  })
  it('maps permission denied', async () => {
    expect(await readPosition(geo((_ok, err) => err({ code: 1 })))).toEqual({ error: 'denied' })
  })
  it('maps unavailable', async () => {
    expect(await readPosition(geo((_ok, err) => err({ code: 2 })))).toEqual({ error: 'unavailable' })
  })
  it('maps timeout', async () => {
    expect(await readPosition(geo((_ok, err) => err({ code: 3 })))).toEqual({ error: 'timeout' })
  })
  it('reports unsupported without geolocation', async () => {
    expect(await readPosition(undefined)).toEqual({ error: 'unsupported' })
  })
})

describe('submitCheckin', () => {
  it('inserts a check-in with the position', async () => {
    const { db, rows } = fakeDb({ error: null })
    expect(await submitCheckin(db, 'p1', 'd1', { lat: 3.1, lng: 101.6, accuracy_m: 12 })).toBe('ok')
    expect(rows).toEqual([
      { table: 'spike_checkins', ping_id: 'p1', device_id: 'd1', lat: 3.1, lng: 101.6, accuracy_m: 12, error: null },
    ])
  })
  it('still records a check-in when location failed', async () => {
    const { db, rows } = fakeDb({ error: null })
    expect(await submitCheckin(db, 'p1', 'd1', { error: 'denied' })).toBe('ok')
    expect(rows[0]).toMatchObject({ lat: null, lng: null, accuracy_m: null, error: 'denied' })
  })
  it('treats a duplicate check-in as already done, not an error', async () => {
    const { db } = fakeDb({ error: { code: '23505', message: 'duplicate key' } })
    expect(await submitCheckin(db, 'p1', 'd1', { error: 'timeout' })).toBe('duplicate')
  })
  it('throws on any other database error', async () => {
    const { db } = fakeDb({ error: { code: '42501', message: 'permission denied' } })
    await expect(submitCheckin(db, 'p1', 'd1', { error: 'timeout' })).rejects.toThrow('permission denied')
  })
})
