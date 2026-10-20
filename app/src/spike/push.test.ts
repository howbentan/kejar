import { describe, expect, it } from 'vitest'
import { pushSupport, urlBase64ToUint8Array } from './push'

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'

describe('pushSupport', () => {
  it('asks iPhone users to add to home screen when not installed', () => {
    expect(pushSupport({ ua: IOS, standalone: false, hasPushManager: false, permission: 'default' })).toBe('needs-install')
  })
  it('is ok for an installed iPhone with push', () => {
    expect(pushSupport({ ua: IOS, standalone: true, hasPushManager: true, permission: 'default' })).toBe('ok')
  })
  it('reports denied permission before anything else', () => {
    expect(pushSupport({ ua: ANDROID, standalone: false, hasPushManager: true, permission: 'denied' })).toBe('denied')
  })
  it('is unsupported without a PushManager outside iOS', () => {
    expect(pushSupport({ ua: ANDROID, standalone: false, hasPushManager: false, permission: 'default' })).toBe('unsupported')
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes url-safe base64 into bytes', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3])
  })
  it('handles url-safe characters and missing padding', () => {
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })
})
