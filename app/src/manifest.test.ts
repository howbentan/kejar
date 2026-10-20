import { describe, expect, it } from 'vitest'
import raw from '../public/manifest.webmanifest?raw'

describe('web app manifest', () => {
  it('opens the game home screen from the home-screen icon', () => {
    expect(JSON.parse(raw).start_url).toBe('/')
  })
})
