// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { T0 } from '../../shared/fixtures.js'
import { seeded } from '../../shared/testing.js'
import { ActionError } from './actions.js'
import { handle } from './handle.js'
import { hashToken } from './secrets.js'
import { MemoryStore } from './store.js'

const makeDeps = (store = new MemoryStore(() => T0)) => ({
  ctx: { store, now: T0, rng: seeded(7), push: async () => {} },
  ip: null,
})

async function lobby(store: MemoryStore) {
  const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(T0).toISOString() })
  await store.createOrganiser({
    organisation_id: org.id,
    name: 'Owner',
    created_at: new Date(T0).toISOString(),
    session_token_hash: hashToken('org-tok'),
    session_created_at: new Date(T0).toISOString(),
  })
  const created = await handle(
    { action: 'create', arenaId: 'around-me', center: { lat: 3, lng: 101 }, settings: {}, organiserToken: 'org-tok' },
    { ...makeDeps(store), ip: '0.0.0.0' },
  )
  const { code } = created.json as { code: string }
  const joined = await handle({ action: 'join', code, name: 'Ben', accepted: true }, { ...makeDeps(store), ip: '0.0.0.0' })
  return { code, token: (joined.json as { token: string }).token }
}

afterEach(() => vi.restoreAllMocks())

describe('handle', () => {
  it('answers 400 Bad request for a body that is not JSON', async () => {
    expect(await handle('{nope', makeDeps())).toEqual({ status: 400, json: { error: 'Bad request' } })
  })

  it.each([null, [], 7, '"text"'])('answers 400 Bad request for a body that is not an object: %j', async (raw) => {
    expect(await handle(raw, makeDeps())).toEqual({ status: 400, json: { error: 'Bad request' } })
  })

  it('answers 400 Unknown action for a missing or unknown action', async () => {
    expect(await handle({}, makeDeps())).toEqual({ status: 400, json: { error: 'Unknown action' } })
    expect(await handle({ action: 'nope' }, makeDeps())).toEqual({ status: 400, json: { error: 'Unknown action' } })
    expect(await handle({ action: 'toString' }, makeDeps())).toEqual({ status: 400, json: { error: 'Unknown action' } })
  })

  it('passes an ActionError through with its status and message', async () => {
    expect(await handle({ action: 'state', code: 'ZZZZZZ' }, makeDeps())).toEqual({
      status: 404,
      json: { error: 'Game not found' },
    })
  })

  it('hides an unexpected error behind a generic 500 and logs it', async () => {
    const boom = new Error('duplicate key value violates unique constraint "x"')
    const store = new MemoryStore(() => T0)
    vi.spyOn(store, 'gameByCode').mockRejectedValue(boom)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await handle({ action: 'state', code: 'ABCDEF' }, makeDeps(store))).toEqual({
      status: 500,
      json: { error: 'Something went wrong — try again' },
    })
    expect(spy).toHaveBeenCalledWith('[api/game]', 'state', boom)
  })

  it('answers Unknown action when there is no body at all', async () => {
    expect(await handle(undefined, makeDeps())).toEqual({ status: 400, json: { error: 'Unknown action' } })
  })

  it('passes a 5xx ActionError through with its message', async () => {
    const store = new MemoryStore(() => T0)
    vi.spyOn(store, 'gameByCode').mockRejectedValue(new ActionError(503, 'Maps are down'))
    expect(await handle({ action: 'state', code: 'ABCDEF' }, makeDeps(store))).toEqual({
      status: 503,
      json: { error: 'Maps are down' },
    })
  })

  describe('request limits', () => {
    it('lets a phone poll normally all minute', async () => {
      const store = new MemoryStore(() => T0)
      const { code, token } = await lobby(store)
      const deps = makeDeps(store)
      for (let i = 0; i < 20; i++) {
        expect((await handle({ action: 'state', code, token }, deps)).status).not.toBe(429)
      }
      for (let i = 0; i < 12; i++) {
        expect((await handle({ action: 'location', code, token }, deps)).status).not.toBe(429)
      }
    })

    it('answers 429 past the limit', async () => {
      const store = new MemoryStore(() => T0)
      const { code, token } = await lobby(store)
      const deps = makeDeps(store)
      for (let i = 0; i < 120; i++) {
        expect((await handle({ action: 'state', code, token }, deps)).status).not.toBe(429)
      }
      expect(await handle({ action: 'state', code, token }, deps)).toEqual({
        status: 429,
        json: { error: 'Too many requests — wait a moment and try again' },
      })
    })

    it('lets a group join from one IP', async () => {
      const store = new MemoryStore(() => T0)
      const deps = { ...makeDeps(store), ip: '5.6.7.8' }
      const org = await store.createOrganisation({ name: 'kejar.', created_at: new Date(T0).toISOString() })
      await store.createOrganiser({
        organisation_id: org.id,
        name: 'Owner',
        created_at: new Date(T0).toISOString(),
        session_token_hash: hashToken('org-tok'),
        session_created_at: new Date(T0).toISOString(),
      })
      const created = await handle(
        { action: 'create', arenaId: 'around-me', center: { lat: 3, lng: 101 }, settings: {}, organiserToken: 'org-tok' },
        makeDeps(store),
      )
      expect(created.status).toBe(200)
      const { code } = created.json as { code: string }
      for (let i = 0; i < 30; i++) {
        const r = await handle({ action: 'join', code, name: `P${i}`, accepted: true }, deps)
        expect(r.status).toBe(200)
      }
    })

    it('lets a group of 60 join from one IP in a minute', async () => {
      const store = new MemoryStore(() => T0)
      const { code } = await lobby(store)
      const deps = { ...makeDeps(store), ip: '5.6.7.9' }
      for (let i = 0; i < 60; i++) {
        const r = await handle({ action: 'join', code, name: `P${i}`, accepted: true }, deps)
        expect(r.status).toBe(200)
      }
      // Joins have their own bucket, so the IP's other tokenless requests aren't used up.
      expect((await handle({ action: 'state', code }, deps)).status).not.toBe(429)
    })

    it('keeps other tokenless requests at 60 a minute per IP', async () => {
      const store = new MemoryStore(() => T0)
      const { code } = await lobby(store)
      const deps = { ...makeDeps(store), ip: '5.6.7.10' }
      const spy = vi.spyOn(store, 'hitRateLimit')
      await handle({ action: 'state', code }, deps)
      expect(spy).toHaveBeenCalledWith('ip:5.6.7.10', 60_000, 60)
    })

    it('runs the action when the limiter itself fails', async () => {
      const store = new MemoryStore(() => T0)
      vi.spyOn(store, 'hitRateLimit').mockRejectedValue(new Error('db down'))
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(await handle({ action: 'state', code: 'ZZZZZZ' }, makeDeps(store))).toEqual({
        status: 404,
        json: { error: 'Game not found' },
      })
      expect(spy).toHaveBeenCalled()
    })

    it('counts a join with a forged token against the IP', async () => {
      const store = new MemoryStore(() => T0)
      const { code } = await lobby(store)
      const deps = { ...makeDeps(store), ip: '9.9.9.9' }
      let last: { status: number } = { status: 0 }
      for (let i = 0; i < 201; i++) {
        last = await handle({ action: 'join', code, name: 'x', accepted: true, token: `forged-${i}` }, deps)
        if (i < 200) expect(last.status).not.toBe(429)
      }
      expect(last.status).toBe(429)
    })

    it('answers 429 instead of 404 after 30 wrong guesses a minute', async () => {
      const deps = { ...makeDeps(), ip: '8.8.8.8' }
      for (let i = 0; i < 30; i++) {
        expect((await handle({ action: 'state', code: 'ZZZZZZ' }, deps)).status).toBe(404)
      }
      expect(await handle({ action: 'state', code: 'ZZZZZZ' }, deps)).toEqual({
        status: 429,
        json: { error: 'Too many requests — wait a moment and try again' },
      })
    })

    it('still answers the original 404 when the failed-guess check fails', async () => {
      const store = new MemoryStore(() => T0)
      const real = store.hitRateLimit.bind(store)
      vi.spyOn(store, 'hitRateLimit').mockImplementation(async (k, w, l) => {
        if (k.startsWith('fail:')) throw new Error('db down')
        return real(k, w, l)
      })
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(await handle({ action: 'state', code: 'ZZZZZZ' }, makeDeps(store))).toEqual({
        status: 404,
        json: { error: 'Game not found' },
      })
      expect(spy).toHaveBeenCalled()
    })
  })
})
