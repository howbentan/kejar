import { useEffect } from 'react'

type Sentinel = { release: () => Promise<void> }

/**
 * Keeps the screen awake while `active` (the Screen Wake Lock API). The server only advances when an open phone
 * polls, so a chaser or marshal whose screen dims would stall the game. The browser drops the lock whenever the
 * page is hidden, so it is asked for again on coming back. Unsupported or refused: quietly does nothing.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return
    let cancelled = false
    let sentinel: Sentinel | null = null

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const s = (await navigator.wakeLock.request('screen')) as Sentinel
        if (cancelled) void s.release().catch(() => {})
        else sentinel = s
      } catch {
        // Denied, or the battery saver said no: nothing to do.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      const s = sentinel
      sentinel = null
      if (s) void s.release().catch(() => {})
    }
  }, [active])
}
