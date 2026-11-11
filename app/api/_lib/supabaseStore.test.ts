// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
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
  it('setKitKey sets or removes one packing-list key through set_kit_key, in one call', async () => {
    const { db, rpcs } = fakeDb()
    const store = new SupabaseStore(db, () => 0)
    await store.setKitKey('g1', 'ticks', 'tape', 'Tape')
    await store.setKitKey('g1', 'placed', 'penjara', true)
    await store.setKitKey('g1', 'ticks', 'tape', null)
    expect(rpcs).toEqual([
      { fn: 'set_kit_key', args: { p_game: 'g1', p_group: 'ticks', p_key: 'tape', p_value: 'Tape' } },
      { fn: 'set_kit_key', args: { p_game: 'g1', p_group: 'placed', p_key: 'penjara', p_value: true } },
      { fn: 'set_kit_key', args: { p_game: 'g1', p_group: 'ticks', p_key: 'tape', p_value: null } },
    ])
  })

  it('stamps a new location with the game clock, so a scan can use the location it just sent', async () => {
    const { db, inserts } = fakeDb()
    const now = Date.parse('2026-10-25T09:07:00.000Z')
    await new SupabaseStore(db, () => now).addPosition('g1', 'p1', { lat: 3, lng: 101, accuracy_m: 8 })
    expect(inserts[0]).toEqual({
      table: 'locations',
      row: { game_id: 'g1', player_id: 'p1', lat: 3, lng: 101, accuracy_m: 8, at: '2026-10-25T09:07:00.000Z' },
    })
  })

  describe('addPosition with a gap', () => {
    const now = Date.parse('2026-10-25T09:07:00.000Z')
    const pos = { lat: 3, lng: 101, accuracy_m: 8 }
    function rpcDb(replies: { data: unknown; error: { message: string; code?: string } | null }[]) {
      const inserts: Record<string, unknown>[] = []
      const rpcs: { fn: string; args: Record<string, unknown> }[] = []
      const db = {
        rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), replies.shift()),
        from: () => ({ insert: async (row: Record<string, unknown>) => (inserts.push(row), { data: null, error: null }) }),
      } as unknown as SupabaseClient
      return { db, inserts, rpcs }
    }

    it('calls add_position with the window bound, or null without one', async () => {
      const { db, rpcs } = rpcDb([{ data: true, error: null }, { data: false, error: null }])
      const store = new SupabaseStore(db, () => now)
      expect(await store.addPosition('g1', 'p1', pos, 2_000)).toBe(true)
      expect(await store.addPosition('g1', 'p1', pos, 2_000, now - 500)).toBe(false)
      const base = { p_game: 'g1', p_player: 'p1', p_lat: 3, p_lng: 101, p_accuracy: 8, p_at: '2026-10-25T09:07:00.000Z', p_min_gap_ms: 2_000 }
      expect(rpcs).toEqual([
        { fn: 'add_position', args: { ...base, p_since: null } },
        { fn: 'add_position', args: { ...base, p_since: '2026-10-25T09:06:59.500Z' } },
      ])
    })

    it('falls back to a plain insert when add_position is missing, logging only once', async () => {
      const { db, inserts } = rpcDb([
        { data: null, error: { message: 'Could not find the function public.add_position', code: 'PGRST202' } },
        { data: null, error: { message: 'function add_position(...) does not exist', code: '42883' } },
      ])
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const store = new SupabaseStore(db, () => now)
      expect(await store.addPosition('g1', 'p1', pos, 2_000)).toBe(true)
      expect(await store.addPosition('g1', 'p1', pos, 2_000)).toBe(true)
      expect(inserts).toHaveLength(2)
      expect(inserts[0]).toEqual({ game_id: 'g1', player_id: 'p1', ...pos, at: '2026-10-25T09:07:00.000Z' })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('[api/game] add_position missing — run 0012')
      spy.mockRestore()
    })

    it('still throws any other add_position error', async () => {
      const { db, inserts } = rpcDb([{ data: null, error: { message: 'connection reset', code: '08006' } }])
      await expect(new SupabaseStore(db, () => now).addPosition('g1', 'p1', pos, 2_000)).rejects.toThrow('connection reset')
      expect(inserts).toEqual([])
    })
  })

  it('resumes through the resume_game function, stamped with the game clock', async () => {
    const { db, rpcs } = fakeDb()
    const now = Date.parse('2026-10-25T09:07:00.000Z')
    expect(await new SupabaseStore(db, () => now).resumeGame('g1')).toBe(90000)
    expect(rpcs).toEqual([{ fn: 'resume_game', args: { p_game: 'g1', p_at: '2026-10-25T09:07:00.000Z' } }])
  })

  it('undoes a kejar through release_caught and claims the final whistle through claim_final_whistle', async () => {
    const rpcs: { fn: string; args: Record<string, unknown> }[] = []
    const replies = [true, false]
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: replies.shift(), error: null }),
    } as unknown as SupabaseClient
    const store = new SupabaseStore(db, () => 0)
    expect(await store.releaseCaught('p1', 'c1', '2026-10-25T09:07:00.000Z')).toBe(true)
    expect(await store.claimFinalWhistle('g1', '2026-10-25T09:08:00.000Z')).toBe(false)
    expect(rpcs).toEqual([
      { fn: 'release_caught', args: { p_player: 'p1', p_by: 'c1', p_at: '2026-10-25T09:07:00.000Z' } },
      { fn: 'claim_final_whistle', args: { p_game: 'g1', p_at: '2026-10-25T09:08:00.000Z' } },
    ])
  })

  it('undoes an auto-jail through release_auto_jailed, which refuses an ended game', async () => {
    const rpcs: { fn: string; args: Record<string, unknown> }[] = []
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: true, error: null }),
    } as unknown as SupabaseClient
    expect(await new SupabaseStore(db, () => 0).releaseAutoJailed('p1', '2026-10-25T09:07:00.000Z')).toBe(true)
    expect(rpcs).toEqual([{ fn: 'release_auto_jailed', args: { p_player: 'p1', p_at: '2026-10-25T09:07:00.000Z' } }])
  })

  it('draws a card through the draw_card function', async () => {
    const { db, rpcs } = fakeDb()
    expect(await new SupabaseStore(db, () => 0).drawCard('g1', 'chaser')).toBe(90000)
    expect(rpcs).toEqual([{ fn: 'draw_card', args: { p_game: 'g1', p_side: 'chaser' } }])
  })

  it("opens Abang Grab through open_grab, reserving the side's next 3 draws in one call", async () => {
    const rpcs: { fn: string; args: Record<string, unknown> }[] = []
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: [{ first_draw: 6, offer: null }], error: null }),
    } as unknown as SupabaseClient
    expect(await new SupabaseStore(db, () => 0).openGrab('u1', 'runner', 3)).toEqual({ first: 6, offer: null })
    expect(rpcs).toEqual([{ fn: 'open_grab', args: { p_powerup: 'u1', p_side: 'runner', p_n: 3 } }])
  })

  it('picks through pick_grab, stamped with the game clock, and passes refusals on', async () => {
    const rpcs: { fn: string; args: Record<string, unknown> }[] = []
    const replies = [[{ result: 'ok', powerup: { id: 'u2', kind: 'shield', sealed: true } }], [{ result: 'already-used', powerup: null }], [{ result: 'taken', powerup: null }]]
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: replies.shift(), error: null }),
    } as unknown as SupabaseClient
    const store = new SupabaseStore(db, () => Date.parse('2026-10-25T09:07:00.000Z'))
    expect(await store.pickGrab('u1', 'p1', 2)).toEqual({ ok: true, powerUp: { id: 'u2', kind: 'shield', sealed: true } })
    expect(await store.pickGrab('u1', 'p1', 0)).toEqual({ ok: false, reason: 'already-used' })
    expect(await store.pickGrab('u1', 'p1', 0.5)).toEqual({ ok: false, reason: 'bad-choice' })
    expect(await store.pickGrab('u1', 'p1', 0)).toEqual({ ok: false, reason: 'taken' })
    expect(rpcs[0]).toEqual({ fn: 'pick_grab', args: { p_powerup: 'u1', p_player: 'p1', p_choice: 2, p_at: '2026-10-25T09:07:00.000Z' } })
    expect(rpcs).toHaveLength(3)
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
