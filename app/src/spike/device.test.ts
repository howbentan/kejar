import { describe, expect, it } from 'vitest'
import { getDeviceId, platformOf } from './device'

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'

function memoryStorage(): Storage {
  const s = new Map<string, string>()
  return { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => { s.set(k, v) } } as Storage
}

describe('platformOf', () => {
  it('detects iOS, Android and other', () => {
    expect(platformOf(IOS)).toBe('ios')
    expect(platformOf(ANDROID)).toBe('android')
    expect(platformOf('curl/8')).toBe('other')
  })
})

describe('getDeviceId', () => {
  it('returns the same uuid across calls on one device', () => {
    const storage = memoryStorage()
    const id = getDeviceId(storage)
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(getDeviceId(storage)).toBe(id)
  })
  it('gives different devices different ids', () => {
    expect(getDeviceId(memoryStorage())).not.toBe(getDeviceId(memoryStorage()))
  })
})
