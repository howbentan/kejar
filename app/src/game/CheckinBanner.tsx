import * as m from 'motion/react-m'
import { type ReactNode, useEffect, useState } from 'react'
import type { Checkin } from '../../shared/views.js'
import { clock } from './time'
import ComicPanel from './ComicPanel'
import { StrikesIcon } from './panelIcons'

/** How long Checked in stays before it fades. */
export const CHECKED_IN_SHOW_MS = 5_000

/**
 * The runner's check-in banner, dropped over the top of the map (motion design §7, check-in states).
 * `early` stays a chip in the status row, unless the check-in push is what opened the page.
 */
export default function CheckinBanner({ checkin, now, openedByPush }: { checkin: Checkin | null; now: number; openedByPush: boolean }) {
  const state = checkin?.state ?? null
  useEffect(() => {
    if (state === 'in') navigator.vibrate?.(80)
  }, [state])
  // A tap hides it until the next check-in (or the next state of this one); Checked in fades by itself after 5 s.
  const key = checkin ? `${checkin.state}:${checkin.revealAt}` : ''
  const [hidden, setHidden] = useState('')
  useEffect(() => {
    if (state !== 'in') return
    const t = window.setTimeout(() => setHidden(key), CHECKED_IN_SHOW_MS)
    return () => window.clearTimeout(t)
  }, [state, key])
  const hide = () => setHidden(key)

  if (!checkin || hidden === key) return null
  const toReveal = clock(Math.max(0, checkin.revealAt - now))
  switch (checkin.state) {
    case 'in':
      return (
        <Banner tone="ok" mark="✓" title="Checked in" sub={`Kejar see you in ${toReveal}`} tick onHide={hide}>
          <p className="banner-foot">You can pocket your phone now.</p>
        </Banner>
      )
    case 'open':
      return <Banner tone="ok" mark="!" title="Check in now" sub={`Kejar see you in ${toReveal}`} onHide={hide} />
    case 'early':
      if (!openedByPush) return null
      return (
        <Banner
          tone="wait"
          mark="…"
          title={`Check-in opens in ${clock(Math.max(0, checkin.alertAt - now))}`}
          sub="Keep Kejar open and it checks you in by itself"
          onHide={hide}
        />
      )
    case 'missed':
      // A comic panel (design 2026-11-24 §3): one strike of two; the next miss sends them to Penjara. Tap to hide.
      return (
        <ComicPanel
          colour="#E5484D"
          ink="#0A0A0B"
          caption="missed 1 of 2"
          icon={<StrikesIcon />}
          title="Missed this check-in"
          line="Miss the next one too and you're sent to Penjara."
          label="Missed this check-in. Tap to hide."
          onClick={hide}
        />
      )
  }
}

function Banner(props: { tone: 'ok' | 'wait'; mark: string; title: string; sub: string; tick?: boolean; children?: ReactNode; onHide: () => void }) {
  return (
    <m.div
      className={`checkin-banner ${props.tone}`}
      role="status"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      onClick={props.onHide}
    >
      <div className="banner-row">
        <span className="banner-mark" aria-hidden="true">
          {props.mark}
        </span>
        <div>
          <b>{props.title}</b>
          <span>{props.sub}</span>
        </div>
      </div>
      {props.children}
      {/* Checked in: a fat doodled tick on the banner's right side, inked on with a hand-drawn shadow line. */}
      {props.tick && (
        <svg className="doodle-tick" viewBox="0 0 80 64" aria-hidden="true">
          <path className="dt-shadow" d="M10 36 Q19 44 27 54 Q41 26 70 9" />
          <path className="dt-ink" d="M8 32 Q17 41 25 50 Q39 22 68 6" />
          <path className="dt-dash" d="M58 50 l9 -2 M62 58 l7 -1" />
        </svg>
      )}
    </m.div>
  )
}
