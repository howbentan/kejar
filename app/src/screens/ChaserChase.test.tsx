import { describe, expect, it, vi } from 'vitest'

vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
import { catchMessage } from './ChaserChase'

describe('catchMessage', () => {
  it('asks the chaser to turn on location when they have no fix', () => {
    expect(catchMessage('KEJAR:TAG:07', { ok: false, reason: 'no-location' })).toBe('Turn on location to catch')
  })
  it('names the tag on success', () => {
    expect(catchMessage('KEJAR:TAG:07', { ok: true, flagged: false, runnerId: 'r1' })).toBe('Caught #07 ✓')
  })
})

describe('shielded catch', () => {
  it('explains a shielded catch', () => {
    expect(catchMessage('KEJAR:TAG:07', { ok: false, reason: 'shielded' })).toBe(
      'Shielded! Hand the tag back — they get a 10 s head start',
    )
  })
})
