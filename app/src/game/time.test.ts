import { describe, expect, it } from 'vitest'
import { clockOffset } from './time'

describe('clockOffset', () => {
  it('adds half the round trip to the server time', () => {
    // Server said 10.000 s; request left at 1.000 s and came back at 1.400 s (local clocks).
    expect(clockOffset([{ serverNow: 10_000, sentAt: 1_000, receivedAt: 1_400 }])).toBe(8_800)
  })

  it('trusts the fastest response, since slow ones carry the most error', () => {
    const offset = clockOffset([
      { serverNow: 10_000, sentAt: 1_000, receivedAt: 4_000 }, // 3 s round trip (cold start)
      { serverNow: 13_100, sentAt: 4_000, receivedAt: 4_200 }, // 0.2 s round trip
    ])
    expect(offset).toBe(13_100 + 100 - 4_200)
  })

  it('is zero before any response', () => {
    expect(clockOffset([])).toBe(0)
  })
})
