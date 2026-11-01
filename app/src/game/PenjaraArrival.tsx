import * as m from 'motion/react-m'
import { useEffect, type ReactNode } from 'react'
import Bars from './Bars'

/** The bars and the plate stay this long, then fade into the Penjara screen (motion design §5). */
export const ARRIVAL_MS = 1_500

/** Sent to Penjara: the bars drop and the plate lands at the same moment, with a shake. */
export default function PenjaraArrival({ plate, onDone }: { plate: ReactNode; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, ARRIVAL_MS)
    return () => window.clearTimeout(t)
    // Once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <m.div className="moment" role="status" initial={{ x: 0 }} animate={{ x: [0, -6, 6, -4, 4, 0] }} transition={{ duration: 0.35, delay: 0.25 }}>
      <Bars />
      {plate}
    </m.div>
  )
}
