import { afterEach, describe, expect, it, vi } from 'vitest'
import { lastCoords, rememberCoords } from './here'

describe('lastCoords', () => {
  afterEach(() => vi.useRealTimers())
  it('hands a rescue beat a known fix only while it is at most 3 s old', () => {
    vi.useFakeTimers({ now: 1_000_000 })
    rememberCoords({ lat: 3, lng: 101, accuracy_m: 5 })
    vi.setSystemTime(1_003_000)
    expect(lastCoords()).toEqual({ lat: 3, lng: 101, accuracy_m: 5 })
    vi.setSystemTime(1_003_001)
    expect(lastCoords()).toBeNull()
  })
})
