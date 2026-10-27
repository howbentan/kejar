// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { SupabaseStore } from './supabaseStore.js'

function fakeDb() {
  const inserts: { table: string; row: Record<string, unknown> }[] = []
  const rpcs: { fn: string; args: Record<string, unknown> }[] = []
  const upserts: { table: string; row: Record<string, unknown>; opts: unknown }[] = []
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      return { data: 90000, error: null }
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row })
        return { data: null, error: null }
      },
      upsert: async (row: Record<string, unknown>, opts: unknown) => {
        upserts.push({ table, row, opts })
        return { data: null, error: null }
      },
    }),
  } as unknown as SupabaseClient
  return { db, inserts, rpcs, upserts }
}

describe('SupabaseStore', () => {
  it('stamps a new location with the game clock, so a scan can use the location it just sent', async () => {
    const { db, inserts } = fakeDb()
    const now = Date.parse('2026-10-25T09:07:00.000Z')
    await new SupabaseStore(db, () => now).addPosition('g1', 'p1', { lat: 3, lng: 101, accuracy_m: 8 })
    expect(inserts[0]).toEqual({
      table: 'locations',
      row: { game_id: 'g1', player_id: 'p1', lat: 3, lng: 101, accuracy_m: 8, at: '2026-10-25T09:07:00.000Z' },
    })
  })

  it('resumes through the resume_game function, stamped with the game clock', async () => {
    const { db, rpcs } = fakeDb()
    const now = Date.parse('2026-10-25T09:07:00.000Z')
    expect(await new SupabaseStore(db, () => now).resumeGame('g1')).toBe(90000)
    expect(rpcs).toEqual([{ fn: 'resume_game', args: { p_game: 'g1', p_at: '2026-10-25T09:07:00.000Z' } }])
  })

  it('osmCachePut upserts on key with the store clock', async () => {
    const { db, upserts } = fakeDb()
    const now = Date.parse('2026-10-27T09:00:00.000Z')
    await new SupabaseStore(db, () => now).osmCachePut('nominatim:klcc', [{ name: 'KLCC Park' }])
    expect(upserts).toEqual([
      {
        table: 'osm_cache',
        row: { key: 'nominatim:klcc', body: [{ name: 'KLCC Park' }], fetched_at: '2026-10-27T09:00:00.000Z' },
        opts: { onConflict: 'key' },
      },
    ])
  })

  it('arenaById treats an id that is not a uuid as not found, without asking the database', async () => {
    const { db } = fakeDb()
    const store = new SupabaseStore(db, () => 0)
    expect(await store.arenaById('abc')).toBeNull()
    expect(await store.arenaById('')).toBeNull()
  })
})
