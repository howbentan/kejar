import { describe, expect, it, vi } from 'vitest'
import { checkOwnTiles, isOwnTilesError, mapTiles, styleFor } from './mapTiles'
import { kejarMapStyle } from './mapStyle'

const reply = (ok: boolean, body: string) => vi.fn(async () => ({ ok, text: async () => body }) as Response)

describe('map tiles', () => {
  it("uses OpenFreeMap when our file isn't set", async () => {
    expect(mapTiles()).toBe('openfreemap')
    expect(styleFor('openfreemap')).toBe(kejarMapStyle)
    expect(await checkOwnTiles('')).toBe('openfreemap')
  })

  it('keeps our file when its first bytes are a PMTiles header', async () => {
    const f = reply(true, 'PMTiles')
    expect(await checkOwnTiles('https://maps.example/a.pmtiles', f)).toBe('own')
    expect(f).toHaveBeenCalledWith('https://maps.example/a.pmtiles', expect.objectContaining({ headers: { Range: 'bytes=0-6' } }))
  })

  it("falls back to OpenFreeMap when our file is missing, wrong or unreachable", async () => {
    expect(await checkOwnTiles('https://maps.example/a.pmtiles', reply(false, ''))).toBe('openfreemap')
    expect(await checkOwnTiles('https://maps.example/a.pmtiles', reply(true, '<html>'))).toBe('openfreemap')
    const down = vi.fn(async () => {
      throw new TypeError('offline')
    })
    expect(await checkOwnTiles('https://maps.example/a.pmtiles', down)).toBe('openfreemap')
    expect(mapTiles()).toBe('openfreemap')
  })

  it("only counts errors from our file's source as our file failing", () => {
    expect(isOwnTilesError('own', { sourceId: 'omt' })).toBe(true)
    expect(isOwnTilesError('own', { sourceId: 'arena' })).toBe(false)
    expect(isOwnTilesError('openfreemap', { sourceId: 'omt' })).toBe(false)
  })
})
