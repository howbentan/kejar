import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playKeyClick, playKeyLetGo, playKeyUnlock, playRescueReset, setMuted } from './sounds'

const made = { oscillators: 0 }

/** A stand-in AudioContext that only counts oscillators; every node chains like the real ones. */
function node(extra: object = {}) {
  const n: Record<string, unknown> = {
    connect: (to: unknown) => to,
    start: () => {},
    stop: () => {},
    frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
    gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    Q: { setValueAtTime: () => {} },
    ...extra,
  }
  return n
}
class FakeAudioContext {
  currentTime = 0
  sampleRate = 8000
  destination = {}
  state = 'running'
  resume() {}
  createOscillator() {
    made.oscillators++
    return node()
  }
  createGain() {
    return node()
  }
  createBiquadFilter() {
    return node()
  }
  createBufferSource() {
    return node()
  }
  createBuffer(_c: number, len: number) {
    return { getChannelData: () => new Float32Array(len) }
  }
}

let vibrate: ReturnType<typeof vi.fn>
beforeEach(() => {
  made.oscillators = 0
  vibrate = vi.fn()
  vi.stubGlobal('AudioContext', FakeAudioContext)
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
  setMuted(false)
})
afterEach(() => {
  setMuted(false)
  vi.unstubAllGlobals()
})

describe('key sounds', () => {
  it('muted: no oscillator and no buzz, for all four', () => {
    setMuted(true)
    playKeyClick(2)
    playKeyUnlock()
    playKeyLetGo()
    playRescueReset()
    expect(made.oscillators).toBe(0)
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('unmuted: a click makes sound and buzzes 28 ms', () => {
    playKeyClick(1)
    expect(made.oscillators).toBeGreaterThan(0)
    expect(vibrate).toHaveBeenCalledWith(28)
  })

  it('the unlock buzzes the long pattern', () => {
    playKeyUnlock()
    expect(vibrate).toHaveBeenCalledWith([40, 50, 120])
  })

  it('let go and reset make sound without a buzz', () => {
    playKeyLetGo()
    playRescueReset()
    expect(made.oscillators).toBeGreaterThan(0)
    expect(vibrate).not.toHaveBeenCalled()
  })
})
