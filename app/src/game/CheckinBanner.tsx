import * as m from 'motion/react-m'
import { useEffect, type ReactNode } from 'react'
import type { Checkin } from '../../shared/views.js'
import { clock } from './time'

/**
 * The runner's check-in banner, dropped over the top of the map (motion design §7, check-in states).
 * `early` stays a chip in the status row, unless the check-in push is what opened the page.
 */
export default function CheckinBanner({ checkin, now, openedByPush }: { checkin: Checkin | null; now: number; openedByPush: boolean }) {
  const state = checkin?.state ?? null
  useEffect(() => {
    if (state === 'in') navigator.vibrate?.(80)
  }, [state])

  if (!checkin) return null
  const toReveal = clock(Math.max(0, checkin.revealAt - now))
  switch (checkin.state) {
    case 'in':
      return (
        <Banner tone="ok" mark="✓" title="Checked in" sub={`Kejar see you in ${toReveal}`}>
          <p className="banner-foot">You can pocket your phone now.</p>
        </Banner>
      )
    case 'open':
      return <Banner tone="ok" mark="!" title="Check in now" sub={`Kejar see you in ${toReveal}`} />
    case 'early':
      if (!openedByPush) return null
      return (
        <Banner
          tone="wait"
          mark="…"
          title={`Check-in opens in ${clock(Math.max(0, checkin.alertAt - now))}`}
          sub="Keep Kejar open and it checks you in by itself"
        />
      )
    case 'missed':
      return (
        <Banner tone="miss" mark="!" title="Missed this check-in" sub='Kejar saw your last spot, marked "missed"'>
          <div className="banner-strikes">
            <span>MISSED IN A ROW</span>
            <i className="on" />
            <i />
          </div>
          <p className="banner-foot">Miss the next one too and you're sent to Penjara.</p>
        </Banner>
      )
  }
}

function Banner(props: { tone: 'ok' | 'wait' | 'miss'; mark: string; title: string; sub: string; children?: ReactNode }) {
  return (
    <m.div
      className={`checkin-banner ${props.tone}`}
      role="status"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
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
    </m.div>
  )
}
