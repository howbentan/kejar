import { beforeEach, describe, expect, it } from 'vitest'
import { MOMENT_WINDOW_MS, shouldPlay } from './moments'

const AT = '2026-11-01T09:00:00.000Z'
const T = Date.parse(AT)

beforeEach(() => sessionStorage.clear())

describe('shouldPlay', () => {
  it('plays a fresh moment once', () => {
    expect(shouldPlay('caught', AT, T + 5_000, sessionStorage)).toBe(true)
    expect(shouldPlay('caught', AT, T + 6_000, sessionStorage)).toBe(false)
  })
  it("doesn't play an old one", () => {
    expect(shouldPlay('caught', AT, T + MOMENT_WINDOW_MS + 5_000, sessionStorage)).toBe(false)
  })
  it('plays again for a new catch', () => {
    shouldPlay('caught', AT, T + 1_000, sessionStorage)
    const later = '2026-11-01T09:20:00.000Z'
    expect(shouldPlay('caught', later, Date.parse(later) + 1_000, sessionStorage)).toBe(true)
  })
  it('nothing to play without a time', () => {
    expect(shouldPlay('caught', null, T, sessionStorage)).toBe(false)
  })
})
