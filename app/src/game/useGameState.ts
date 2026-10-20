import { useCallback, useEffect, useRef, useState } from 'react'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { loadSession } from './session'

export type LocationMode = 'always' | 'when-open' | 'never'

const POLL_MS = 3_000
const ALWAYS_EVERY_MS = 5_000
const WHEN_OPEN_EVERY_MS = 15_000

/** Polls the game every 3 s while the page is visible and sends this phone's location per `sendLocation`. */
export function useGameState(code: string, opts: { sendLocation: LocationMode }) {
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastSent = useRef(0)
  const session = loadSession(localStorage, code)
  const auth = session.token ? { token: session.token } : { hostKey: session.hostKey }

  const refresh = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      setView(await call<View>('state', { code, ...auth }))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, auth.token, auth.hostKey])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    const onVisible = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  useEffect(() => {
    if (opts.sendLocation === 'never' || !session.token || !('geolocation' in navigator)) return
    const minGap = opts.sendLocation === 'always' ? ALWAYS_EVERY_MS : WHEN_OPEN_EVERY_MS
    const send = (p: GeolocationPosition) => {
      if (document.visibilityState !== 'visible' || Date.now() - lastSent.current < minGap) return
      lastSent.current = Date.now()
      void call('location', {
        code,
        token: session.token,
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy_m: p.coords.accuracy,
      }).catch(() => undefined)
    }
    const watch = navigator.geolocation.watchPosition(send, () => undefined, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
    })
    return () => navigator.geolocation.clearWatch(watch)
  }, [code, opts.sendLocation, session.token])

  return { view, error, refresh }
}
