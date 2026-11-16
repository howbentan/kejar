import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

const GLYPHS = '#%&*@!?<>/\\=+01ABCDEFGHJKLMNPQRSTUVWXYZ'
const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
const scramble = (text: string, settled: number) => [...text].map((c, i) => (c === ' ' || i < settled ? c : glyph())).join('')

/**
 * Text that decodes itself: scrambled glyphs settle into the words, left to right, over `duration` ms after `delay`.
 * With reduced motion the words show at once.
 */
export default function Decrypt({ text, delay = 0, duration = 900 }: { text: string; delay?: number; duration?: number }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(() => (reduce ? text : scramble(text, 0)))
  useEffect(() => {
    if (reduce) return setShown(text)
    const t0 = performance.now()
    const id = window.setInterval(() => {
      const p = Math.max(0, (performance.now() - t0 - delay) / duration)
      setShown(p >= 1 ? text : scramble(text, Math.floor(p * text.length)))
      if (p >= 1) window.clearInterval(id)
    }, 45)
    return () => window.clearInterval(id)
  }, [text, delay, duration, reduce])
  return (
    <>
      <span className="sr-only">{text}</span>
      <span className="decrypt" aria-hidden="true">{shown}</span>
    </>
  )
}
