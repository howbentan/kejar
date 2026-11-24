import { readFileSync } from 'node:fs'
import { LIVE_MAP_FILE } from './game/mapTiles'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The site's Content Security Policy (app/vercel.json). Each directive below is something the app really loads; this
 * test keeps them from being dropped by accident and keeps the policy strict where it should be.
 */
function policy(): Map<string, string[]> {
  const config = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  const all = config.headers.find((h) => h.source === '/(.*)')!.headers
  const csp = all.find((h) => h.key === 'Content-Security-Policy')!.value
  return new Map(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/)
        return [name, values] as [string, string[]]
      }),
  )
}

describe('Content Security Policy', () => {
  const p = policy()

  it('only runs the site’s own scripts: no inline scripts, no eval', () => {
    expect(p.get('script-src')).toEqual(["'self'"])
    expect(p.get('default-src')).toEqual(["'self'"])
    expect(p.get('object-src')).toEqual(["'none'"])
    expect(p.get('base-uri')).toEqual(["'self'"])
  })

  it('still refuses to be framed', () => {
    expect(p.get('frame-ancestors')).toEqual(["'none'"])
  })

  it('allows the map: our own file, OpenFreeMap tiles and fonts, and its blob workers and images', () => {
    expect(p.get('connect-src')).toContain('https://tiles.openfreemap.org')
    expect(p.get('connect-src')).toContain(new URL(LIVE_MAP_FILE).origin)
    expect(p.get('worker-src')).toEqual(expect.arrayContaining(["'self'", 'blob:']))
    expect(p.get('child-src')).toContain('blob:')
    expect(p.get('img-src')).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']))
  })

  it('serves every font from the app itself: no Google Fonts', () => {
    expect(p.get('font-src')).toEqual(["'self'"])
    expect(p.get('style-src')).not.toContain('https://fonts.googleapis.com')
  })
})
