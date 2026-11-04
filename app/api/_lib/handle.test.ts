// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { T0 } from '../../shared/fixtures.js'
import { seeded } from '../../shared/testing.js'
import { handle } from './handle.js'
import { MemoryStore } from './store.js'

const makeDeps = (store = new MemoryStore(() => T0)) => ({
  ctx: { store, now: T0, rng: seeded(7), push: async () => {} },
  ip: null,
})

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
})
