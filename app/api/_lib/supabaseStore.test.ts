// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { SupabaseStore } from './supabaseStore.js'

function fakeDb() {
  const inserts: { table: string; row: Record<string, unknown> }[] = []
  const db = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row })
        return { data: null, error: null }
      },
    }),
  } as unknown as SupabaseClient
  return { db, inserts }
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
})
