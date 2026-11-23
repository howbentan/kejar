import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'public', 'fonts', 'Kejar Hand Regular')

describe('map label glyphs', () => {
  it('ships every glyph range for Kejar Hand Regular', () => {
    const missing: string[] = []
    for (let start = 0; start < 65536; start += 256) {
      const file = `${start}-${start + 255}.pbf`
      if (!existsSync(join(dir, file))) missing.push(file)
    }
    expect(missing).toEqual([])
  })

  it('names the font stack inside the files', () => {
    const file = join(dir, '0-255.pbf')
    expect(statSync(file).size).toBeGreaterThan(20000)
    expect(readFileSync(file).includes(Buffer.from('Kejar Hand Regular'))).toBe(true)
  })
})
