import { describe, expect, it } from 'vitest'
import { createExitFx, KICK_BACK, KICK_FULL, kickFrame, kickLength, pickExit } from './exits'

describe('pickExit', () => {
  it('splits into thirds: wipe, bulldoze, kung fu', () => {
    expect(pickExit(() => 0)).toBe('wipe')
    expect(pickExit(() => 0.5)).toBe('bulldoze')
    expect(pickExit(() => 0.99)).toBe('kungfu')
  })
})

describe('kick timelines', () => {
  it('kung fu starts in the logo pose, kicks left at 250 ms and right at 570 ms, and ends off the right edge', () => {
    expect(kickFrame(KICK_FULL, 0, 400)).toEqual(KICK_FULL.frames[0])
    expect(kickFrame(KICK_FULL, 250, 400).legL).toBe(78)
    expect(kickFrame(KICK_FULL, 99999, 400).x).toBe(400)
    expect(kickLength(KICK_FULL)).toBe(1250)
    expect(KICK_FULL.hits).toEqual([
      { t: 250, side: 'l' },
      { t: 570, side: 'r' },
    ])
  })

  it('the back kick hits at 150 ms and ends standing where it started, ready to run', () => {
    expect(kickLength(KICK_BACK)).toBe(380)
    expect(KICK_BACK.hits).toEqual([{ t: 150, side: 'l' }])
    expect(kickFrame(KICK_BACK, 380, 0).x).toBe(0)
  })
})

describe('createExitFx', () => {
  it('copes with a stage that has nothing in it yet', () => {
    const fx = createExitFx(document.createElement('div'), 'wipe')
    expect(() => {
      fx.frame(0)
      fx.strike('l', { x: 0, y: 0 })
    }).not.toThrow()
  })
})
