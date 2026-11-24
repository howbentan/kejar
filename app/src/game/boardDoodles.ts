import type maplibregl from 'maplibre-gl'

/**
 * The Game board's hand-drawn map images (design 2026-11-24 §1, §5), drawn once on a canvas with a seeded wobble so
 * they look the same every time: hatching for outside the arena, a chalky edge, the Penjara and start stamps, and the
 * flood's wave texture (four frames, cycled to make the water move).
 */
const PR = 2

function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

type Ctx = CanvasRenderingContext2D
function draw(w: number, h: number, paint: (c: Ctx, rnd: () => number) => void, seed = 7): ImageData | null {
  if (typeof document === 'undefined') return null
  const el = document.createElement('canvas')
  el.width = w * PR
  el.height = h * PR
  const c = el.getContext('2d')
  if (!c) return null
  c.scale(PR, PR)
  c.lineCap = 'round'
  c.lineJoin = 'round'
  paint(c, seeded(seed))
  return c.getImageData(0, 0, el.width, el.height)
}

function wobble(c: Ctx, pts: [number, number][], rnd: () => number, amt = 0.8) {
  const j = () => (rnd() - 0.5) * amt
  c.beginPath()
  pts.forEach(([x, y], i) => (i ? c.lineTo(x + j(), y + j()) : c.moveTo(x + j(), y + j())))
  c.stroke()
}
function line(c: Ctx, rnd: () => number, x1: number, y1: number, x2: number, y2: number, amt = 0.8) {
  const pts: [number, number][] = []
  for (let t = 0; t <= 1.0001; t += 0.25) pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
  wobble(c, pts, rnd, amt)
}

const ink = (a: number) => `rgba(245,245,243,${a})`

/** Image ids the board layers use. */
export const BOARD_IMAGES = ['board-hatch', 'board-chalk', 'stamp-penjara', 'stamp-start', 'waves-0', 'waves-1', 'waves-2', 'waves-3'] as const
export const WAVE_FRAMES = 4

export function addBoardDoodles(m: maplibregl.Map) {
  const add = (id: string, img: ImageData | null) => {
    if (img && !m.hasImage(id)) m.addImage(id, img, { pixelRatio: PR })
  }
  add(
    'board-hatch',
    draw(24, 24, (c, rnd) => {
      c.strokeStyle = ink(0.5)
      c.lineWidth = 0.9
      for (let k = -24; k <= 24; k += 8) line(c, rnd, k, 24, k + 24, 0, 0.9)
    }),
  )
  add(
    'board-chalk',
    draw(32, 8, (c, rnd) => {
      for (let i = 0; i < 70; i++) {
        c.fillStyle = ink(0.35 + rnd() * 0.55)
        c.fillRect(rnd() * 32, 2 + rnd() * 4, 1 + rnd() * 2.5, 0.8 + rnd())
      }
    }),
  )
  const stamp = (id: string, word: string, w: number) =>
    add(
      id,
      draw(w, 34, (c, rnd) => {
        c.strokeStyle = ink(0.9)
        c.lineWidth = 2
        wobble(c, [[3, 3], [w - 3, 3], [w - 3, 31], [3, 31], [3, 3]], rnd, 1.2)
        c.lineWidth = 0.8
        wobble(c, [[6, 6], [w - 6, 6], [w - 6, 28], [6, 28], [6, 6]], rnd, 0.8)
        c.fillStyle = ink(0.92)
        c.font = '20px "Kejar Hand", sans-serif'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText(word, w / 2, 18)
        // Worn ink: knock out specks.
        c.globalCompositeOperation = 'destination-out'
        for (let i = 0; i < 60; i++) c.fillRect(rnd() * w, rnd() * 34, 1 + rnd() * 2, 1 + rnd())
        c.globalCompositeOperation = 'source-over'
      }),
    )
  stamp('stamp-penjara', 'penjara', 96)
  stamp('stamp-start', 'start', 76)
  // Water: deep blue with light wave strokes, each frame shifted a little so cycling them makes the water move.
  for (let f = 0; f < WAVE_FRAMES; f++)
    add(
      `waves-${f}`,
      draw(48, 32, (c, rnd) => {
        c.fillStyle = 'rgba(29, 92, 201, 0.62)'
        c.fillRect(0, 0, 48, 32)
        c.strokeStyle = 'rgba(160, 205, 255, 0.42)'
        c.lineWidth = 1.1
        const dx = (f * 48) / WAVE_FRAMES
        const wave = (x: number, y: number) => {
          for (const ox of [-48, 0, 48]) {
            const X = ((x + dx) % 48) + ox
            wobble(c, [[X, y], [X + 3, y - 2.4], [X + 6, y], [X + 9, y - 2.4], [X + 12, y]], rnd, 0.25)
          }
        }
        wave(4, 9)
        wave(28, 24)
      }, 11),
    )
}
