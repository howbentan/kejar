import { useEffect, useRef, useState } from 'react'

/** Server time, estimated locally and ticking every second (phone clocks can be off). */
export function useServerNow(serverNow: number): number {
  const base = useRef({ server: serverNow, local: Date.now() })
  if (base.current.server !== serverNow) base.current = { server: serverNow, local: Date.now() }
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])
  return base.current.server + (Date.now() - base.current.local)
}

/** m:ss, rounding up so a countdown never shows 0:00 early. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
