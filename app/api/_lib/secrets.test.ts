// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cryptoRng } from './secrets.js'

describe('cryptoRng', () => {
  it('gives values in [0, 1) that are not all equal', () => {
    const draws = Array.from({ length: 1000 }, () => cryptoRng())
    expect(draws.every((n) => n >= 0 && n < 1)).toBe(true)
    expect(new Set(draws).size).toBeGreaterThan(1)
  })
})
