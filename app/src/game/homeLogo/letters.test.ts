import { afterEach, describe, expect, it, vi } from 'vitest'
import { letterSrc, lettersReady } from './letters'

afterEach(() => vi.useRealTimers())

describe('letters', () => {
  it('names each letter image', () => {
    expect(letterSrc('k')).toBe('/home/letter-k.png')
  })

  it('never waits longer than the cap, even if the images never load', async () => {
    vi.useFakeTimers()
    let done = false
    void lettersReady(1200).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(1199)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(done).toBe(true)
  })
})
