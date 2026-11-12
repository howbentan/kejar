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

  it('freezes a chaser through freeze_chaser, stamped with the game clock', async () => {
    const rpcs: { fn: string; args: Record<string, unknown> }[] = []
    const db = { rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: true, error: null }) } as unknown as SupabaseClient
    const now = Date.parse('2026-10-25T09:07:00.000Z')
    expect(await new SupabaseStore(db, () => now).freezeChaser('c1', '2026-10-25T09:10:00.000Z')).toBe(true)
    expect(rpcs).toEqual([{ fn: 'freeze_chaser', args: { p_player: 'c1', p_until: '2026-10-25T09:10:00.000Z', p_at: '2026-10-25T09:07:00.000Z' } }])
  })

  it('applies a combo through apply_combo, returning the twin or null', async () => {
    const rpcs: { fn: string; args: Record<string, unknown> }[] = []
    const replies = [[{ id: 'u2', kind: 'decoy', twin_of: 'u1' }], []]
    const db = { rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: replies.shift(), error: null }) } as unknown as SupabaseClient
    const store = new SupabaseStore(db, () => Date.parse('2026-10-25T09:07:00.000Z'))
    expect(await store.applyCombo('p1', 'u1')).toMatchObject({ id: 'u2', twin_of: 'u1' })
    expect(await store.applyCombo('p1', 'u1')).toBeNull()
    expect(rpcs[0]).toEqual({ fn: 'apply_combo', args: { p_player: 'p1', p_powerup: 'u1', p_at: '2026-10-25T09:07:00.000Z' } })
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

  it('starts, joins and ends a rescue through start_rescue, join_rescue and end_rescue', async () => {
    const rpcs: { fn: string; args: Record<string, unknown> }[] = []
    const replies = [true, null, false]
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: replies.shift(), error: null }),
    } as unknown as SupabaseClient
    const store = new SupabaseStore(db, () => 0)
    expect(await store.startRescue('g1', 'p1', '2026-10-25T09:07:00.000Z')).toBe(true)
    await store.joinRescue('g1', 'p2')
    expect(await store.endRescue('g1', '2026-10-25T09:07:00.000Z')).toBe(false)
    expect(rpcs).toEqual([
      { fn: 'start_rescue', args: { p_game: 'g1', p_by: 'p1', p_at: '2026-10-25T09:07:00.000Z' } },
      { fn: 'join_rescue', args: { p_game: 'g1', p_player: 'p2' } },
      { fn: 'end_rescue', args: { p_game: 'g1', p_started: '2026-10-25T09:07:00.000Z' } },
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

  it('events() pages past the 1000-row cap, oldest first, so the newest events are never dropped', async () => {
    const all = Array.from({ length: 1003 }, (_, i) => ({ id: `e${i}`, game_id: 'g1', type: 'ping', at: `t${i}` }))
    const ranges: [number, number][] = []
    const orders: string[] = []
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: (col: string) => (orders.push(col), builder),
      range: (from: number, to: number) => {
        ranges.push([from, to])
        // The server hands back at most 1000 rows per request, whatever the range asks for.
        return Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + 1000)), error: null })
      },
    }
    const db = { from: () => builder } as unknown as SupabaseClient
    const events = await new SupabaseStore(db, () => 0).events('g1')
    expect(events.map((e) => e.id)).toEqual(all.map((e) => e.id))
    expect(ranges).toEqual([[0, 999], [1000, 1999]])
    expect(orders).toEqual(['at', 'id', 'at', 'id'])
  })

  it("playerPositions reads one player's fixes in a time window, oldest first", async () => {
    const calls: unknown[][] = []
    const rows = [{ lat: 3, lng: 101, accuracy_m: 8, at: 't1' }]
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lte']) builder[m] = (...args: unknown[]) => (calls.push([m, ...args]), builder)
    builder.order = (col: string) => (calls.push(['order', col]), Promise.resolve({ data: rows, error: null }))
    const db = { from: (table: string) => (calls.push(['from', table]), builder) } as unknown as SupabaseClient
    expect(await new SupabaseStore(db, () => 0).playerPositions('g1', 'p1', 'a', 'b')).toEqual(rows)
    expect(calls).toEqual([
      ['from', 'locations'],
      ['select', 'lat, lng, accuracy_m, at'],
      ['eq', 'game_id', 'g1'],
      ['eq', 'player_id', 'p1'],
      ['gte', 'at', 'a'],
      ['lte', 'at', 'b'],
      ['order', 'at'],
    ])
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

describe('SupabaseStore legendaries: Super Ring and Mak Kau Hijau', () => {
  const NOW = '2026-10-25T09:07:00.000Z'
  function rpcStore(replies: unknown[]) {
    const rpcs: { fn: string; args: Record<string, unknown> }[] = []
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: replies.shift(), error: null }),
    } as unknown as SupabaseClient
    return { rpcs, store: new SupabaseStore(db, () => Date.parse(NOW)) }
  }
  const arrest = {
    firedAt: NOW, route: 'catch' as const, by: 'c1', center: null, startedAt: null, ringId: 'u1', catchEventId: null,
  }

  it('claims a Super Ring through claim_ring, returning the card or null', async () => {
    const { rpcs, store } = rpcStore([[{ id: 'u1', kind: 'ring', player_id: 'p1' }], []])
    expect(await store.claimRing('g1', 'p1')).toMatchObject({ id: 'u1', kind: 'ring' })
    expect(await store.claimRing('g1', 'p2')).toBeNull()
    expect(rpcs[0]).toEqual({ fn: 'claim_ring', args: { p_game: 'g1', p_player: 'p1', p_at: NOW } })
  })

  it('claims Mak Kau Hijau through claim_hijau with the window, true only for the winner', async () => {
    const { rpcs, store } = rpcStore([true, false])
    const run = { startsAt: '2026-10-25T09:07:10.000Z', deadline: '2026-10-25T09:07:55.000Z' }
    expect(await store.claimHijau('g1', 'p1', run)).toBe(true)
    expect(await store.claimHijau('g1', 'p2', run)).toBe(false)
    expect(rpcs[0]).toEqual({
      fn: 'claim_hijau',
      args: { p_game: 'g1', p_player: 'p1', p_at: NOW, p_starts: run.startsAt, p_deadline: run.deadline },
    })
  })

  it('sets the push once through claim_hijau_push, and taps through tap_hijau', async () => {
    const { rpcs, store } = rpcStore([true, false, true, false])
    expect(await store.claimHijauPush('g1', NOW, ['r1', 'r2'])).toBe(true)
    expect(await store.claimHijauPush('g1', NOW, [])).toBe(false)
    expect(await store.tapHijau('g1', 'c1', NOW)).toBe(true)
    expect(await store.tapHijau('g1', 'c1', NOW)).toBe(false)
    expect(rpcs[0]).toEqual({ fn: 'claim_hijau_push', args: { p_game: 'g1', p_at: NOW, p_targets: ['r1', 'r2'] } })
    expect(rpcs[2]).toEqual({ fn: 'tap_hijau', args: { p_game: 'g1', p_player: 'c1', p_at: NOW } })
  })

  it('settles through claim_hijau_settle, returning the run or null', async () => {
    const run = { claimedBy: 'p1', claimedAt: NOW, startsAt: NOW, deadline: NOW, sentAt: NOW, settledAt: NOW, tapped: ['c1'] }
    const { rpcs, store } = rpcStore([run, null])
    expect(await store.claimHijauSettle('g1', NOW)).toEqual(run)
    expect(await store.claimHijauSettle('g1', NOW)).toBeNull()
    expect(rpcs[0]).toEqual({ fn: 'claim_hijau_settle', args: { p_game: 'g1', p_at: NOW } })
  })

  it('starts, updates and ends an arrest through the arrest functions', async () => {
    const { rpcs, store } = rpcStore([true, false, null, true, false, true])
    expect(await store.startArrest('p1', arrest)).toBe(true)
    expect(await store.startArrest('p1', arrest)).toBe(false)
    await store.updateArrest('p1', { startedAt: NOW })
    expect(await store.endArrest('p1', NOW)).toBe(true)
    expect(await store.endArrest('p1', NOW)).toBe(false)
    expect(await store.endArrest('p1', NOW, { waiting: true })).toBe(true)
    expect(rpcs[0]).toEqual({ fn: 'start_arrest', args: { p_player: 'p1', p_arrest: arrest } })
    expect(rpcs[2]).toEqual({ fn: 'update_arrest', args: { p_player: 'p1', p_patch: { startedAt: NOW } } })
    expect(rpcs[3]).toEqual({ fn: 'end_arrest', args: { p_player: 'p1', p_fired_at: NOW, p_waiting: false } })
    expect(rpcs[5]).toEqual({ fn: 'end_arrest', args: { p_player: 'p1', p_fired_at: NOW, p_waiting: true } })
  })

  it('reads a player arrest back with the player columns', async () => {
    let columns = ''
    const db = {
      from: () => ({ select: (c: string) => ((columns = c), { eq: () => ({ is: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }),
    } as unknown as SupabaseClient
    await new SupabaseStore(db, () => 0).players('g1')
    expect(columns.split(', ')).toContain('arrest')
  })
})
