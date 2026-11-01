import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import { Shockwave, Sparkles, type Spot } from './Celebrate'
import Marker from './Marker'
import Stamp from './Stamp'

export const FLASH_MS = 450
export const CATCH_MOMENT_MS = 2_200
/** The stamp has slammed down by now: the marker measures it and draws round it. */
export const STAMP_LAND_MS = 400

/** Sparkles round the `dikejar!` stamp (about 230×80), popping out as it lands. */
const SPOTS: Spot[] = [
  { x: -30, y: -22, kind: 'star', size: 22 },
  { x: 222, y: -30, kind: 'star', white: true, size: 18 },
  { x: 246, y: 40, kind: 'dot', size: 8 },
  { x: -40, y: 58, kind: 'dot', white: true, size: 7 },
  { x: 100, y: -44, kind: 'dot', size: 6 },
  { x: 236, y: 88, kind: 'star', size: 16 },
  { x: -18, y: 96, kind: 'star', white: true, size: 14 },
]

/**
 * The chaser's catch (motion design §4): a lime flash, the `dikejar!` stamp slamming down with a shockwave and
 * sparkles, a burst of marker rays and stars round it, a short shake, then `#07 Aina → Penjara`, with a big buzz.
 * A tap ends it early.
 */
export default function CatchMoment({ label, onDone }: { label: string; onDone: () => void }) {
  const stamp = useRef<HTMLDivElement>(null)
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    navigator.vibrate?.([80, 40, 220])
    const land = window.setTimeout(() => setLanded(true), STAMP_LAND_MS)
    const t = window.setTimeout(onDone, CATCH_MOMENT_MS)
    return () => (window.clearTimeout(land), window.clearTimeout(t))
    // Once per catch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <m.div
      className="moment"
      role="status"
      onClick={onDone}
      initial={{ x: 0 }}
      animate={{ x: [0, -6, 6, -4, 4, 0] }}
      transition={{ duration: 0.35, delay: 0.3 }}
    >
      <m.div className="moment-flash" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: FLASH_MS / 1000 }} />
      <div ref={stamp} className="catch-stamp">
        <Stamp text="dikejar!" />
        <Shockwave delayMs={STAMP_LAND_MS - 100} radius={16} />
        <Sparkles spots={SPOTS} delayMs={STAMP_LAND_MS - 50} />
      </div>
      {label && (
        <m.p className="moment-line" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.3 }}>
          {`${label} → Penjara`}
        </m.p>
      )}
      {landed && (
        <Marker
          marks={[
            { shape: 'burst', target: stamp },
            { shape: 'stars', target: stamp },
          ]}
        />
      )}
    </m.div>
  )
}
