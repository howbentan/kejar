import { useCallback, useEffect, useRef, useState } from 'react'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { credentials } from './auth'
import { loadSession } from './session'
import { clockOffset, type ClockSample } from './time'

export type LocationMode = 'always' | 'when-open' | 'never'

const POLL_MS = 3_000
const ALWAYS_EVERY_MS = 5_000
const WHEN_OPEN_EVERY_MS = 15_000
/** A check-in only re-sends the last fix if it is at most this old; otherwise the phone asks for a fresh one. */
export const CHECKIN_RESEND_MAX_AGE_MS = 20_000

/** Polls the game every 3 s while the page is visible and sends this phone's location per `sendLocation`. */
export function useGameState(
  code: string,
  opts: { sendLocation: LocationMode | ((view: View | null) => LocationMode) },
) {
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  // True while the phone refuses or fails to give a position: with auto-jail, that means missed check-ins.
  const [locationOff, setLocationOff] = useState(false)
  const lastSent = useRef(0)
  // The latest fix, and the check-in window it was last re-sent for (one send per window, even if the phone is still).
  const lastFix = useRef<GeolocationPosition | null>(null)
  const sentForAlert = useRef<number | null>(null)
  const fetchingFresh = useRef(false)
  const modeRef = useRef<LocationMode>('never')
  const samples = useRef<ClockSample[]>([])
  const session = loadSession(localStorage, code)
  const auth = credentials(code)

  const refresh = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      const sentAt = Date.now()
      const v = await call<View>('state', { code, ...auth })
      const receivedAt = Date.now()
      samples.current = [...samples.current, { serverNow: v.now, sentAt, receivedAt }].slice(-10)
      // Re-express "now" on this phone's clock, corrected for network delay, so every device's timers agree.
      setView({ ...v, now: receivedAt + clockOffset(samples.current) })
      setError(null)
      // A still phone may give no new fix inside the 45 s window, so send a position once per window:
      // the last fix if it is fresh, otherwise a new one from the phone.
      const fix = lastFix.current
      const alertAt = v.nextAlertAt
      if (modeRef.current !== 'never' && session.token && alertAt != null && v.now >= alertAt && sentForAlert.current !== alertAt) {
        const token = session.token
        const sendFix = (p: GeolocationPosition) => {
          sentForAlert.current = alertAt
          lastSent.current = Date.now()
          void call('location', { code, token, lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy }).catch(
            () => undefined,
          )
        }
        if (fix && Date.now() - fix.timestamp <= CHECKIN_RESEND_MAX_AGE_MS) {
          sendFix(fix)
        } else if (!fetchingFresh.current && 'geolocation' in navigator) {
          fetchingFresh.current = true
          navigator.geolocation.getCurrentPosition(
            (p) => {
              fetchingFresh.current = false
              lastFix.current = p
              if (sentForAlert.current !== alertAt) sendFix(p)
            },
            () => {
              fetchingFresh.current = false
            },
            { maximumAge: 0, enableHighAccuracy: true, timeout: 15_000 },
          )
        }
      }
    } catch (e) {
      // Limited for a moment: say nothing and let the next poll try again.
      if ((e as { status?: number }).status === 429) return
      setError(e instanceof Error ? e.message : String(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, auth.token, auth.organiserToken])

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

  const mode = typeof opts.sendLocation === 'function' ? opts.sendLocation(view) : opts.sendLocation
  modeRef.current = mode

  useEffect(() => {
    if (mode === 'never' || !session.token || !('geolocation' in navigator)) return
    const minGap = mode === 'always' ? ALWAYS_EVERY_MS : WHEN_OPEN_EVERY_MS
    const send = (p: GeolocationPosition) => {
      setLocationOff(false)
      lastFix.current = p
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
    const watch = navigator.geolocation.watchPosition(send, () => setLocationOff(true), {
      enableHighAccuracy: true,
      maximumAge: 5_000,
    })
    return () => navigator.geolocation.clearWatch(watch)
  }, [code, mode, session.token])

  return { view, error, refresh, locationOff }
}
