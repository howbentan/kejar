/**
 * The Penjara reel's sounds. The black slot plays the owner's clip; the rest are small Web Audio blips made on the
 * spot. Everything does nothing when muted. The mute switch is saved in localStorage for this viewer only.
 */
const MUTE_KEY = 'kejar.muted'
export const BLACK_SLOT_SRC = '/sounds/black-slot.mp3'

/** Used only when storage is blocked, so the switch still works for this visit. */
let memoryMuted = false

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return memoryMuted
  }
}

export function setMuted(muted: boolean): void {
  memoryMuted = muted
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1')
    else localStorage.removeItem(MUTE_KEY)
  } catch {
    // Private window or blocked storage: not remembered, but memoryMuted holds for this visit.
  }
}

let audioCtx: AudioContext | null = null
function ac(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audioCtx ||= new Ctor()
    return audioCtx
  } catch {
    return null
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, when = 0): void {
  try {
    const a = ac()
    if (!a) return
    const o = a.createOscillator()
    const g = a.createGain()
    const t = a.currentTime + when
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(a.destination)
    o.start(t)
    o.stop(t + dur + 0.02)
  } catch {
    // No audio on this device: the reel is just as playable without it.
  }
}

/** The owner's clip, for a black slot. */
export function playBlackSlot(): void {
  if (isMuted()) return
  try {
    void new Audio(BLACK_SLOT_SRC).play()?.catch(() => {})
  } catch {
    // Autoplay blocked or no audio: nothing to do.
  }
}

/** A short fanfare for the free slot (in place of a vine boom until its licence is checked). */
export function playFree(): void {
  if (isMuted()) return
  ;[523, 659, 784, 1047].forEach((f, k) => tone(f, k === 3 ? 0.4 : 0.14, 'triangle', 0.12, 0.12 + k * 0.11))
}

/** One click as a card passes the marker. */
export function playTick(): void {
  if (isMuted()) return
  tone(1400, 0.03, 'square', 0.05)
}

/** The lever's pull and the reel's clunk as it stops. */
export function playClunk(): void {
  if (isMuted()) return
  tone(110, 0.18, 'square', 0.12)
  tone(70, 0.25, 'sine', 0.15, 0.02)
}

/* ---- The Penjara key (hold-to-rescue). Same Web Audio helpers as the reel, so no files to load. ---- */

let noiseBuf: AudioBuffer | null = null

/** A burst of filtered noise: the scrape and snap of metal parts. */
function grit(a: AudioContext, centre: number, q: number, dur: number, vol: number, when = 0): void {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const src = a.createBufferSource()
  const f = a.createBiquadFilter()
  const g = a.createGain()
  const t = a.currentTime + when
  src.buffer = noiseBuf
  f.type = 'bandpass'
  f.frequency.setValueAtTime(centre, t)
  f.Q.setValueAtTime(q, t)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(a.destination)
  src.start(t)
  src.stop(t + dur + 0.02)
}

/** A tone that can glide to another pitch and ramps in softly, for the key's ting and knock. */
function ting(a: AudioContext, freq: number, dur: number, type: OscillatorType, vol: number, when = 0, glideTo?: number): void {
  const o = a.createOscillator()
  const g = a.createGain()
  const t = a.currentTime + when
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.03)
}

/** Runs a sound only when unmuted and audio exists; a device without audio just stays quiet. */
function keySound(play: (a: AudioContext) => void): void {
  if (isMuted()) return
  try {
    const a = ac()
    if (!a) return
    if (a.state === 'suspended') void a.resume()
    play(a)
  } catch {
    // No audio on this device: the rescue works the same without it.
  }
}

/**
 * One click of the key (notch 1 to 3): a short metal snap, a bright tumbler ping and a small knock in the lock body.
 * Each click sits a little higher than the last, so the third one sounds closer to opening.
 */
export function playKeyClick(notch: 1 | 2 | 3): void {
  if (isMuted()) return
  keySound((a) => {
    const lift = 1 + (notch - 1) * 0.09
    grit(a, 3800 * lift, 6, 0.018, 0.5)
    ting(a, 2350 * lift, 0.07, 'triangle', 0.09, 0.004)
    ting(a, 3120 * lift, 0.05, 'triangle', 0.05, 0.006)
    ting(a, 190, 0.04, 'sine', 0.22, 0.002)
  })
  navigator.vibrate?.(28)
}

/** The fourth click opens it: a double clack, a heavy chunk as the bolt slides, the shackle's spring ting, the gate's creak. */
export function playKeyUnlock(): void {
  if (isMuted()) return
  keySound((a) => {
    grit(a, 4200, 6, 0.016, 0.55)
    ting(a, 2600, 0.05, 'triangle', 0.08, 0.004)
    grit(a, 3300, 5, 0.02, 0.6, 0.075)
    ting(a, 95, 0.22, 'square', 0.07, 0.08)
    ting(a, 62, 0.3, 'sine', 0.3, 0.085)
    ting(a, 880, 0.42, 'sine', 0.1, 0.16, 1480)
    ting(a, 1760, 0.3, 'sine', 0.04, 0.17, 2600)
    // The gate swinging: a low sawtooth creak through a narrow band.
    const o = a.createOscillator()
    const f = a.createBiquadFilter()
    const g = a.createGain()
    const t = a.currentTime + 0.32
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(150, t)
    o.frequency.linearRampToValueAtTime(105, t + 0.55)
    f.type = 'bandpass'
    f.frequency.setValueAtTime(900, t)
    f.Q.setValueAtTime(8, t)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.08)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    o.connect(f).connect(g).connect(a.destination)
    o.start(t)
    o.stop(t + 0.65)
  })
  navigator.vibrate?.([40, 50, 120])
}

/** Letting go: the key settling back a hair, a soft dull tick. */
export function playKeyLetGo(): void {
  keySound((a) => {
    grit(a, 1400, 3, 0.03, 0.25)
    ting(a, 420, 0.06, 'sine', 0.06)
  })
}

/** The reset: the key spinning back through its clicks, falling in pitch. */
export function playRescueReset(): void {
  keySound((a) => {
    ;[0, 0.07, 0.13, 0.18].forEach((w, i) => {
      grit(a, 3000 - i * 450, 6, 0.016, 0.35, w)
      ting(a, 1900 - i * 260, 0.04, 'triangle', 0.05, w + 0.003)
    })
    ting(a, 140, 0.12, 'sine', 0.12, 0.2)
  })
}
