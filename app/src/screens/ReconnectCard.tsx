import { useEffect, useRef, useState } from 'react'
import type { View } from '../../shared/views.js'
import { ApiError, call } from '../game/api'
import { credentials } from '../game/auth'
import { statusFrom, statusLine, type HomeStatus } from '../game/homeStatus'

const REFRESH_MS = 30_000

/**
 * Home's reconnect button, as a card that says what you're going back to (home upgrades design). It shows at once
 * with the code, then fills in the park and where the game is at from one `state` request. While a planned start is
 * coming it refreshes every 30 s (paused while the tab is hidden), so the card flips when the game starts.
 */
export default function ReconnectCard({ href, code, onStatus }: { href: string; code: string; onStatus?: (s: HomeStatus | null) => void }) {
  const [status, setStatus] = useState<HomeStatus | null>(null)
  const [gone, setGone] = useState(false)
  const report = useRef(onStatus)
  report.current = onStatus

  useEffect(() => {
    let alive = true
    let timer = 0
    let latest: HomeStatus | null = null
    const watching = () => latest !== null && latest.phase === 'lobby' && latest.startsAt !== null
    const fetchOnce = async () => {
      try {
        const view = await call<View>('state', { code, ...credentials(code) })
        if (!alive) return
        latest = statusFrom(code, view, Date.now())
        setStatus(latest)
        report.current?.(latest)
      } catch (e) {
        if (!alive) return
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
          latest = null
          setGone(true)
          report.current?.(null)
        }
        // Anything else: keep the plain card and try again on the next refresh.
      }
      schedule()
    }
    const schedule = () => {
      window.clearTimeout(timer)
      if (alive && watching()) timer = window.setTimeout(() => (document.visibilityState === 'visible' ? void fetchOnce() : schedule()), REFRESH_MS)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && watching()) void fetchOnce()
    }
    void fetchOnce()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [code])

  if (gone) return null
  const line = status ? statusLine(status, Date.now()) : null
  return (
    <a className="btn btn-paper rc" href={href}>
      <span className="rc-title">
        {line?.title ?? 'reconnect'} <span aria-hidden="true">→</span>
      </span>
      <span className="rc-detail">
        {line ? (
          <>
            {line.live && <i className="rc-live" aria-hidden="true" />}
            {line.detail}
          </>
        ) : (
          code.toUpperCase()
        )}
      </span>
    </a>
  )
}
