import { describe, expect, it } from 'vitest'
import { geometry, stageGeometry } from './geometry'

describe('geometry', () => {
  it('centres a 190px logo on a 290px stage and maps the j box', () => {
    const g = geometry(290, 430, 150)
    expect(g.scale).toBe(1)
    expect(g.logo).toEqual({ x: 50, y: 150, w: 190, h: 190 * (543 / 900) })
    expect(g.home.x).toBeCloseTo(50 + 190 * (190 / 900))
    expect(g.home.y).toBeCloseTo(150 + 12 * (190 / 900))
    expect(g.jw).toBeCloseTo((516 - 190) * (190 / 900))
    expect(g.jh).toBeCloseTo((531 - 12) * (190 / 900))
  })

  it('stageGeometry centres the logo vertically in the play area', () => {
    const logoH = 190 * (543 / 900)
    expect(stageGeometry(290, 430)).toEqual(geometry(290, 430, (430 - logoH) / 2))
  })

  it('scales with stage width', () => {
    const big = geometry(580, 860, 300)
    expect(big.scale).toBe(2)
    expect(big.jw).toBeCloseTo(geometry(290, 430, 150).jw * 2)
  })
})
