import { describe, expect, it, vi } from 'vitest'
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
  it("the back kick and the shove split at the same point, so no caption letter is left behind", () => {
    const rect = (left: number, width: number) => () => ({ left, width, right: left + width, top: 0, bottom: 10, height: 10, x: left, y: 0, toJSON: () => ({}) })
    const stage = document.createElement('div')
    const logo = document.createElement('div')
    logo.className = 'hl-logo'
    logo.getBoundingClientRect = rect(0, 300)
    const j = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    j.setAttribute('class', 'hl-j')
    j.getBoundingClientRect = rect(100, 70) // middle 135, mouth 143.4
    const ch = document.createElement('span')
    ch.className = 'hl-ch'
    ch.getBoundingClientRect = rect(135, 10) // middle 140: past the j's middle, behind its mouth
    const animate = vi.fn()
    ch.animate = animate
    logo.append(j)
    stage.append(logo, ch)
    createExitFx(stage, 'bulldoze').strike('l', { x: 0, y: 0 })
    expect(animate).toHaveBeenCalled()
  })

  it('copes with a stage that has nothing in it yet', () => {
    const fx = createExitFx(document.createElement('div'), 'wipe')
    expect(() => {
      fx.frame(0)
      fx.strike('l', { x: 0, y: 0 })
    }).not.toThrow()
  })
})
