import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import type { PowerUpKind } from '../../shared/types.js'
import { INFO } from './powerInfo'
import Sticker from './Sticker'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Mak Kau Hijau's card face words: the chasers' legendary that works on claim. */
const HIJAU_INFO = { name: 'Mak Kau Hijau', effect: 'Dikejar must tap green in 45 s' }

/**
 * The iridescent foil of Dato Seri's card (motion design §8.9): the highlight slides with the phone's tilt.
 * No permission prompt: iOS only sends orientation after a user-gesture grant, so there it quietly stays a slowly
 * drifting gradient. Reduced motion: still.
 */
export function Foil() {
  const el = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) return
    let frame = 0
    let next: { x: string; y: string } | null = null
    const flush = () => {
      frame = 0
      if (!next) return
      el.current?.style.setProperty('--foil-x', next.x)
      el.current?.style.setProperty('--foil-y', next.y)
      next = null
    }
    // Orientation events can arrive faster than frames: keep the latest and write once per frame.
    const tilt = (e: Event) => {
      const { gamma, beta } = e as DeviceOrientationEvent
      if (typeof gamma !== 'number' || typeof beta !== 'number') return
      next = { x: `${Math.round(50 + (clamp(gamma, -45, 45) / 45) * 50)}%`, y: `${Math.round(50 + (clamp(beta - 45, -45, 45) / 45) * 50)}%` }
      if (!frame) frame = requestAnimationFrame(flush)
    }
    window.addEventListener('deviceorientation', tilt)
    return () => {
      window.removeEventListener('deviceorientation', tilt)
      cancelAnimationFrame(frame)
    }
  }, [reduce])
  return <span ref={el} className="pc-foil" data-testid="foil" data-still={reduce ? 'true' : 'false'} aria-hidden="true" />
}

/**
 * A deck card, 96×150 (motion design §7). Face up: the same lime-framed layout for every power-up, no rarity
 * colours. Face down: the ornate brand back, identical for every card, so it gives nothing away.
 * The legendaries get the legendary face (jail design §4a): gradient, foil, glow. Dato Seri in yellow, Super Ring in
 * cheese orange and Mak Kau Hijau in deep green (Plan E2). Mak Kau Hijau never sits in a hand, so INFO doesn't name it.
 * `big` (150×234) is the revealed card in the lucky dip: laid out bigger, never scaled, so the marker finds its edges.
 */
export default function PowerCard({ kind, faceDown = false, wiggle = false, big = false }: { kind?: PowerUpKind | 'hijau'; faceDown?: boolean; wiggle?: boolean; big?: boolean }) {
  if (faceDown || !kind) {
    return (
      <div className="power-card back" aria-label="Face-down card" role="img">
        <span className="pc-corner tl" />
        <span className="pc-corner tr" />
        <span className="pc-corner bl" />
        <span className="pc-corner br" />
        <span className="pc-seal">kejar.</span>
      </div>
    )
  }
  const legendary = kind === 'dato' || kind === 'ring' || kind === 'hijau'
  const info = kind === 'hijau' ? HIJAU_INFO : INFO[kind]
  const tone = kind === 'ring' || kind === 'hijau' ? ` ${kind}` : ''
  return (
    <div className={`power-card front${big ? ' big' : ''}${legendary ? ' legendary' : ''}${tone}`}>
      {legendary && <Foil />}
      <span className="pc-eyebrow">{legendary ? '★ LEGENDARY · ONE PER GAME' : 'POWER-UP'}</span>
      <span className="pc-art">
        <Sticker kind={kind} size={big ? 104 : 64} tilt={-4} wiggle={wiggle} />
      </span>
      <b className="pc-name">{info.name}</b>
      <span className="pc-effect">{info.effect}</span>
    </div>
  )
}
