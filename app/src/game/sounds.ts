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
