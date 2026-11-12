/**
 * Where the home logo and its j sit. The logo is 190px wide at a 290px-wide stage and scales with the stage, so
 * home, the opening and the loading screen all put it at exactly the same spot. The j's box inside the 900 x 543
 * logo frame is 190,12 to 516,531.
 */
export const LOGO = {
  STAGE: 290,
  WIDTH: 190,
  FRAME: { w: 900, h: 543 },
  J_BOX: { x0: 190, y0: 12, x1: 516, y1: 531 },
} as const

export interface Geometry {
  scale: number
  logo: { x: number; y: number; w: number; h: number }
  jw: number
  jh: number
  /** The j's top-left when it is in its gap. */
  home: { x: number; y: number }
  stage: { w: number; h: number }
}

export function geometry(stageW: number, stageH: number, logoTop: number): Geometry {
  const scale = stageW / LOGO.STAGE
  const w = LOGO.WIDTH * scale
  const k = w / LOGO.FRAME.w
  const x = (stageW - w) / 2
  const { x0, y0, x1, y1 } = LOGO.J_BOX
  return {
    scale,
    logo: { x, y: logoTop, w, h: LOGO.FRAME.h * k },
    jw: (x1 - x0) * k,
    jh: (y1 - y0) * k,
    home: { x: x + x0 * k, y: logoTop + y0 * k },
    stage: { w: stageW, h: stageH },
  }
}

/** The logo centred both ways in a stage `stageW` by `stageH`. */
export function stageGeometry(stageW: number, stageH: number): Geometry {
  const logoH = LOGO.WIDTH * (stageW / LOGO.STAGE) * (LOGO.FRAME.h / LOGO.FRAME.w)
  return geometry(stageW, stageH, (stageH - logoH) / 2)
}
