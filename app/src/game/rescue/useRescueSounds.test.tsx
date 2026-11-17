import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RescueLockMode } from './RescueLock'

const sounds = vi.hoisted(() => ({
  playKeyClick: vi.fn(),
  playKeyUnlock: vi.fn(),
  playKeyLetGo: vi.fn(),
  playRescueReset: vi.fn(),
}))
vi.mock('../sounds', () => sounds)
import { useRescueSounds } from './useRescueSounds'

beforeEach(() => Object.values(sounds).forEach((f) => f.mockReset()))

const hook = (heldMs: number, mode: RescueLockMode, on = true) =>
  renderHook((p: { heldMs: number; mode: RescueLockMode; on: boolean }) => useRescueSounds(p.heldMs, p.mode, p.on), { initialProps: { heldMs, mode, on } })

describe('useRescueSounds', () => {
  it('plays nothing for where the key already is when it mounts (a reload mid-rescue)', () => {
    hook(12_000, 'holding')
    Object.values(sounds).forEach((f) => expect(f).not.toHaveBeenCalled())
  })

  it('clicks once as each of notches 1 to 3 is reached, rising', () => {
    const h = hook(0, 'holding')
    h.rerender({ heldMs: 4_900, mode: 'holding', on: true })
    expect(sounds.playKeyClick).not.toHaveBeenCalled()
    h.rerender({ heldMs: 5_000, mode: 'holding', on: true })
    h.rerender({ heldMs: 5_400, mode: 'holding', on: true })
    h.rerender({ heldMs: 10_100, mode: 'holding', on: true })
    h.rerender({ heldMs: 15_000, mode: 'holding', on: true })
    expect(sounds.playKeyClick.mock.calls).toEqual([[1], [2], [3]])
  })

  it('never clicks the same notch twice when the count steps back a little and comes again', () => {
    const h = hook(4_000, 'holding')
    h.rerender({ heldMs: 5_200, mode: 'holding', on: true })
    h.rerender({ heldMs: 4_800, mode: 'paused', on: true })
    h.rerender({ heldMs: 5_300, mode: 'holding', on: true })
    expect(sounds.playKeyClick).toHaveBeenCalledTimes(1)
  })

  it('the fourth notch is no click: the unlock plays when it opens', () => {
    const h = hook(19_000, 'holding')
    h.rerender({ heldMs: 20_000, mode: 'holding', on: true })
    expect(sounds.playKeyClick).not.toHaveBeenCalled()
    h.rerender({ heldMs: 20_000, mode: 'open', on: true })
    h.rerender({ heldMs: 20_000, mode: 'open', on: true })
    expect(sounds.playKeyUnlock).toHaveBeenCalledTimes(1)
  })

  it('a soft tick on let-go and the spin-back on reset', () => {
    const h = hook(8_000, 'holding')
    h.rerender({ heldMs: 8_000, mode: 'paused', on: true })
    expect(sounds.playKeyLetGo).toHaveBeenCalledTimes(1)
    h.rerender({ heldMs: 0, mode: 'idle', on: true })
    expect(sounds.playRescueReset).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when off (anyone but the rescuer)', () => {
    const h = hook(0, 'holding', false)
    h.rerender({ heldMs: 6_000, mode: 'holding', on: false })
    h.rerender({ heldMs: 6_000, mode: 'paused', on: false })
    h.rerender({ heldMs: 20_000, mode: 'open', on: false })
    Object.values(sounds).forEach((f) => expect(f).not.toHaveBeenCalled())
  })
})
