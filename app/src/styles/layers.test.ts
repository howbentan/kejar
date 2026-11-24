import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const zOf = (selector: string) => {
  const m = css.match(new RegExp(`(^|\\n)${selector.replace('.', '\\.')} \\{[^}]*z-index: (\\d+)`))
  if (!m) throw new Error(`no z-index for ${selector}`)
  return Number(m[2])
}

describe('screen layers (tokens.css)', () => {
  it('keeps the SOS button above the pause screen, so SOS works while paused', () => {
    expect(zOf('.sos-icon')).toBeGreaterThan(zOf('.paused-over'))
  })
})
