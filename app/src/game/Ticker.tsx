import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import type { FeedItem } from '../../shared/views.js'

const keyOf = (f: FeedItem) => `${f.at}|${f.text}`
const time = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * The feed as a bell at the top right, where people look for notifications (owner's call; it replaced the ticker
 * bar in the dock). The badge counts lines that came in since you last opened it; a line that needs you makes the
 * bell glow and buzzes once. Tapping drops every line down from the top, with what each means for your side.
 */
export default function Ticker({ feed }: { feed: FeedItem[] }) {
  const [open, setOpen] = useState(false)
  const [seenKey, setSeenKey] = useState(() => (feed[0] ? keyOf(feed[0]) : null))
  // Lines already on screen when the page opened don't buzz; anything that needs you later buzzes once.
  const buzzed = useRef(new Set(feed.map(keyOf)))
  const newest = feed[0]

  useEffect(() => {
    for (const f of feed) {
      const k = keyOf(f)
      if (buzzed.current.has(k)) continue
      buzzed.current.add(k)
      if (f.act) navigator.vibrate?.(60)
    }
  }, [feed])

  // The feed is newest first, so everything above the last line you saw is new (all of it, if that line has scrolled off).
  const seenAt = feed.findIndex((f) => keyOf(f) === seenKey)
  // While the sheet is open, whatever arrives counts as seen (closing it marks the newest line).
  const unseen = open ? 0 : seenAt === -1 ? feed.length : seenAt
  const toggle = () => {
    setOpen(!open)
    if (newest) setSeenKey(keyOf(newest))
  }
  const loud = !!newest?.act && unseen > 0

  return (
    <>
      <button
        type="button"
        className={loud ? 'notif-bell act' : 'notif-bell'}
        aria-label={newest ? `Feed: ${newest.text}${newest.means ? ` ${newest.means}` : ''}` : 'Feed'}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 10a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 15 6 10" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unseen > 0 && <b className="notif-count">{unseen > 9 ? '9+' : unseen}</b>}
      </button>
      {open && (
        <>
          <div className="notif-shade" onClick={toggle} />
          <m.div
            className="feed-sheet"
            role="dialog"
            aria-label="Feed"
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          >
            {feed.length === 0 ? (
              <p className="muted">Nothing yet</p>
            ) : (
              <ol className="feed-list">
                {feed.map((f) => (
                  <li key={keyOf(f)} className={f.act ? 'act' : ''}>
                    <span className="feed-time">{time(f.at)}</span>
                    <div>
                      <p>{f.text}</p>
                      {f.means && <p className="feed-means">{f.means}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </m.div>
        </>
      )}
    </>
  )
}
