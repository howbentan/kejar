import * as m from 'motion/react-m'
import { useEffect } from 'react'
import Stamp from './Stamp'

export const FLASH_MS = 450
export const CATCH_MOMENT_MS = 2_200

/**
 * The chaser's catch (motion design §4): a lime flash, the `dikejar!` stamp, a short shake, then
 * `#07 Aina → Penjara`, with a buzz. A tap ends it early.
 */
export default function CatchMoment({ label, onDone }: { label: string; onDone: () => void }) {
  useEffect(() => {
    navigator.vibrate?.(200)
    const t = window.setTimeout(onDone, CATCH_MOMENT_MS)
    return () => window.clearTimeout(t)
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
      <Stamp text="dikejar!" />
      {label && (
        <m.p className="moment-line" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.3 }}>
          {`${label} → Penjara`}
        </m.p>
      )}
    </m.div>
  )
}
