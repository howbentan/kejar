/**
 * How a full-screen loader ends (loader exits design, 2026-11-16): the j clears the logo's letters and the caption
 * before the screen shows. One of three, picked at random:
 * - `wipe`: it sprints off the right edge; what's ahead goes in a sharp line behind its mouth, what's behind chases it.
 * - `bulldoze`: a back kick sends what's behind it off the left edge, then it shoves what's ahead off the right.
 * - `kungfu`: it kicks the left side off the left edge, the right side off the right edge, then flies off in a side kick.
 * The kick timelines here are pure data; `createExitFx` does the per-frame work on the letters.
 */
export type Exit = 'wipe' | 'bulldoze' | 'kungfu'

const EXITS: Exit[] = ['wipe', 'bulldoze', 'kungfu']

export function pickExit(rand: () => number = Math.random): Exit {
  return EXITS[Math.min(EXITS.length - 1, Math.floor(rand() * EXITS.length))]
}

/** Where each logo letter's middle sits across the logo's frame (k, e, a, r). */
export const LETTER_MID = [0.12, 0.3, 0.68, 0.88]

/** One moment of a kick: leg angles and tilt in degrees, lift in the j's drawing units, x in screen pixels. */
export interface KickFrame {
  t: number
  legL: number
  legR: number
  lift: number
  tilt: number
  x: number
  sy: number
}
export type KickPlan = { frames: KickFrame[]; hits: { t: number; side: 'l' | 'r' }[] }

/** Stands for "past the right edge" in a timeline: `kickFrame` swaps in the real distance. */
const OFF = 9999
const f = (t: number, legL: number, legR: number, lift: number, tilt: number, x: number, sy: number): KickFrame => ({ t, legL, legR, lift, tilt, x, sy })

/** Stance, kick left, stance, kick right, crouch, then a flying side kick: leaning back, front leg out, back leg tucked. */
export const KICK_FULL: KickPlan = {
  frames: [
    f(0, 0, 0, 0, 0, 0, 1),
    f(150, -15, 15, 12, 0, 0, 0.9),
    f(200, 20, 20, 0, 6, 0, 1),
    f(250, 78, 15, -10, 14, 0, 1),
    f(400, 78, 15, -10, 14, 0, 1),
    f(470, -15, 15, 12, 0, 0, 0.92),
    f(520, -15, -20, 0, -6, 0, 1),
    f(570, -15, -88, -10, -14, 0, 1),
    f(720, -15, -88, -10, -14, 0, 1),
    f(800, -30, -50, 22, -6, 0, 0.86),
    f(900, -60, -30, -120, -30, 30, 1),
    f(1250, -60, -30, -150, -32, OFF, 1),
  ],
  hits: [
    { t: 250, side: 'l' },
    { t: 570, side: 'r' },
  ],
}

/** A quick donkey kick backwards before a run; ends standing where it began. */
export const KICK_BACK: KickPlan = {
  frames: [f(0, 0, 0, 0, 0, 0, 1), f(90, -10, 10, 8, 0, 0, 0.92), f(150, 70, 10, -5, 22, 0, 1), f(300, 70, 10, -5, 22, 0, 1), f(380, 0, 0, 0, 6, 0, 1)],
  hits: [{ t: 150, side: 'l' }],
}

/** Where the kicking foot lands at full stretch, in the j's 326 x 519 drawing. */
export const FOOT = { l: { x: 3, y: 242 }, r: { x: 339, y: 218 } } as const

export const kickLength = (plan: KickPlan) => plan.frames[plan.frames.length - 1].t

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)

/** The j at `t` ms into a kick. Strikes snap in and settle; the flight off the edge speeds up. */
export function kickFrame(plan: KickPlan, t: number, off: number): KickFrame {
  const real = (k: KickFrame) => (k.x === OFF ? { ...k, x: off } : k)
  const last = plan.frames[plan.frames.length - 1]
  if (t >= last.t) return real(last)
  if (t <= 0) return real(plan.frames[0])
  const i = plan.frames.findIndex((k) => k.t > t)
  const a = real(plan.frames[i - 1])
  const b = real(plan.frames[i])
  const raw = (t - a.t) / (b.t - a.t)
  const e = b.x > a.x + 50 ? raw * raw : easeOut(raw)
  const mix = (p: Exclude<keyof KickFrame, 't'>) => a[p] + (b[p] - a[p]) * e
  return { t, legL: mix('legL'), legR: mix('legR'), lift: mix('lift'), tilt: mix('tilt'), x: mix('x'), sy: mix('sy') }
}

export interface ExitFx {
  /** Once per animation frame while the j runs (wipe and bulldoze): clear, shove or chase the letters. */
  frame(now: number): void
  /** A kick lands: every letter on that side of the j flies off that edge, nearest first, with a flash and a jolt. */
  strike(side: 'l' | 'r', foot: { x: number; y: number }): void
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** The effects on one loader's letters. `stage` is the logo's `.hl` root; it holds `.hl-ltr`, `.hl-j` and `.hl-ch`. */
export function createExitFx(stage: HTMLElement, exit: Exit): ExitFx {
  let start: number | null = null
  const rest = new Map<HTMLElement, DOMRect>()
  const tilt = new Map<HTMLElement, number>()
  let behind: HTMLElement[] = []
  // Chase: how far the j had gone at each moment, so each letter behind follows the same path a beat later. Once
  // the j is off the stage it stops moving, so the chasers carry on at its last speed.
  const trail: [number, number][] = []
  let lastReal = 0
  let lastT = 0
  let vel = 0

  const parts = () => ({
    logo: stage.querySelector<HTMLElement>('.hl-logo'),
    j: stage.querySelector<SVGElement>('.hl-j'),
    letters: [...stage.querySelectorAll<HTMLElement>('.hl-ltr')],
    chars: [...stage.querySelectorAll<HTMLElement>('.hl-ch')],
  })
  const restOf = (el: HTMLElement) => rest.get(el) ?? el.getBoundingClientRect()

  function frame(now: number) {
    const { logo, j, letters, chars } = parts()
    if (!logo || !j) return
    const jr = j.getBoundingClientRect()
    const lr = logo.getBoundingClientRect()
    const mouth = jr.left + jr.width * 0.62
    if (start === null) {
      start = mouth
      chars.forEach((el) => rest.set(el, el.getBoundingClientRect()))
      ;[...letters, ...chars].forEach((el) => tilt.set(el, rand(-18, 18)))
      const s = start
      behind = [
        ...letters.slice(0, 2).map((el, i): [HTMLElement, number] => [el, lr.left + lr.width * LETTER_MID[i]]),
        ...chars.map((el): [HTMLElement, number] => [el, restOf(el).left + restOf(el).width / 2]),
      ]
        .filter(([, mid]) => mid <= s)
        .sort((a, b) => b[1] - a[1])
        .map(([el]) => el)
    }
    const s = start
    // Ahead of the j: the a and the r, and every caption letter past where it set off.
    letters.forEach((el, i) => {
      if (i < 2) return
      if (exit === 'wipe') {
        const p = Math.max(0, Math.min(100, ((mouth - lr.left) / lr.width) * 100))
        el.style.clipPath = `inset(0 0 0 ${p}%)`
      } else if (exit === 'bulldoze') {
        const left = lr.left + lr.width * (LETTER_MID[i] - 0.08)
        if (mouth > left) el.style.transform = `translateX(${mouth - left}px) rotate(${tilt.get(el) ?? 0}deg)`
      }
    })
    chars.forEach((el) => {
      const r = restOf(el)
      const mid = r.left + r.width / 2
      if (mid <= s) return
      if (exit === 'wipe' && mouth > mid) el.style.visibility = 'hidden'
      if (exit === 'bulldoze' && mouth > r.left) el.style.transform = `translateX(${mouth - r.left}px) rotate(${tilt.get(el) ?? 0}deg)`
    })
    if (exit === 'wipe') {
      const real = mouth - s
      let d = real
      if (real > lastReal + 0.01) {
        vel = (real - lastReal) / Math.max(1, now - lastT)
        lastReal = real
        lastT = now
      } else if (real > 50) d = lastReal + vel * (now - lastT)
      else lastT = now
      trail.push([now, d])
      const distAt = (t: number) => {
        for (let i = trail.length - 1; i >= 0; i--) if (trail[i][0] <= t) return trail[i][1]
        return 0
      }
      behind.forEach((el, i) => {
        const at = distAt(now - 70 - i * 28)
        const hop = at > 0 ? -Math.abs(Math.sin(now / 70 + i)) * 6 : 0
        el.style.transform = `translate(${at}px, ${hop}px)`
      })
    }
  }

  function strike(side: 'l' | 'r', foot: { x: number; y: number }) {
    const { logo, j, letters, chars } = parts()
    const dir = side === 'l' ? -1 : 1
    if (logo && j) {
      const lr = logo.getBoundingClientRect()
      const jr = j.getBoundingClientRect()
      const jx = jr.left + jr.width / 2
      const all: [HTMLElement, number][] = [
        ...letters.map((el, i): [HTMLElement, number] => [el, lr.left + lr.width * LETTER_MID[i]]),
        ...chars.map((el): [HTMLElement, number] => [el, restOf(el).left + restOf(el).width / 2]),
      ]
      const reach = 300
      all
        .filter(([, mid]) => (side === 'l' ? mid < jx : mid > jx))
        .forEach(([el, mid]) => {
          if (typeof el.animate !== 'function') return
          const gap = Math.abs(mid - jx)
          const kx = dir * (reach + gap * 0.6 + Math.random() * reach * 0.3)
          const ky = -(reach * 0.15 + Math.random() * reach * 0.35)
          const spin = dir * (180 + Math.random() * 360)
          el.animate(
            [
              { transform: 'none', opacity: 1 },
              { transform: `translate(${kx}px, ${ky}px) rotate(${spin}deg)`, opacity: 0 },
            ],
            { duration: 620, delay: gap * 0.35, easing: 'cubic-bezier(.12,.75,.3,1)', fill: 'forwards' },
          )
        })
    }
    // The flash where the foot connects, and a jolt of the logo and caption (inside the stage, which clips, so the
    // page itself never moves or grows a scrollbar).
    const sr = stage.getBoundingClientRect()
    const burst = document.createElement('span')
    burst.className = 'kf-burst'
    burst.style.left = `${foot.x - sr.left}px`
    burst.style.top = `${foot.y - sr.top}px`
    stage.appendChild(burst)
    window.setTimeout(() => burst.remove(), 450)
    stage.querySelectorAll<HTMLElement>('.hl-logo, .hl-caption').forEach((el) => {
      if (typeof el.animate !== 'function') return
      el.animate(
        [{ translate: '0 0' }, { translate: `${dir * 5}px 0` }, { translate: `${-dir * 3}px 0` }, { translate: '0 0' }],
        { duration: 140, easing: 'linear' },
      )
    })
  }

  return { frame, strike }
}
