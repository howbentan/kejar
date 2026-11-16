import { useCallback, useEffect, useState } from 'react'
import { pickExit, type Exit } from './homeLogo/exits'

/** How long a loader must have been up before its exit plays; quicker loads just show the screen. */
const EXIT_AFTER_MS = 400

/**
 * Holds a screen back while its full loader plays its exit (loader exits design, 2026-11-16). `ready` is "the data is
 * here"; `instant` shows the screen at once (an error). Use it with the other hooks, then
 * `if (gate.show) return <FullLoader caption="…" {...gate.loader} />`.
 * A screen that is ready from the start never shows the loader; one that loses its data shows it again.
 */
export function useLoaderGate(ready: boolean, instant = false): { show: boolean; loader: { leaving: boolean; exit: Exit; onLeft: () => void } } {
  const [long, setLong] = useState(false)
  const [exit, setExit] = useState<Exit>('wipe')
  const [leaving, setLeaving] = useState(false)
  // Decided while rendering (not in an effect), so the screen never flashes up for a frame before the exit.
  const [wasReady, setWasReady] = useState(ready)
  if (ready !== wasReady) {
    setWasReady(ready)
    setLeaving(ready && long && !instant)
    if (!ready) setLong(false)
  }
  useEffect(() => {
    if (ready) return
    const t = window.setTimeout(() => {
      setExit(pickExit())
      setLong(true)
    }, EXIT_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [ready])
  const onLeft = useCallback(() => setLeaving(false), [])
  return { show: !ready || leaving, loader: { leaving, exit, onLeft } }
}
