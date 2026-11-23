import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAP_ICONS } from './Map'

// The logo's j is cut at 47 px wide (odd), so the even-width guard covers the drawn art, not the j cut-outs.
const J_CUTS = /^j-/

describe('map icons', () => {
  it('has a file for every map icon', () => {
    expect(MAP_ICONS.length).toBeGreaterThanOrEqual(16)
    for (const name of MAP_ICONS) {
      const file = join(process.cwd(), 'public', 'map', `${name}.png`)
      expect(existsSync(file), name).toBe(true)
      const png = readFileSync(file)
      expect(png.subarray(1, 4).toString(), name).toBe('PNG')
      if (!J_CUTS.test(name)) expect(png.readUInt32BE(16) % 2, `${name} width is even (2x art)`).toBe(0)
      expect(png.readUInt32BE(20), `${name} height`).toBeGreaterThan(0)
    }
  })
})
