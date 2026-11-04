import { describe, expect, it } from 'vitest'
import { platformOf } from './device'

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'

describe('platformOf', () => {
  it('detects iOS, Android and other', () => {
    expect(platformOf(IOS)).toBe('ios')
    expect(platformOf(ANDROID)).toBe('android')
    expect(platformOf('curl/8')).toBe('other')
  })
})
