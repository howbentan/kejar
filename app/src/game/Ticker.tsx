import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import type { FeedItem } from '../../shared/views.js'

const keyOf = (f: FeedItem) => `${f.at}|${f.text}`
const time = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * The feed as one line in the dock (motion design §8.2): the newest item, what it means for your side,
 * and how many came in since you last looked. Tapping opens every line, stopping at the dock's top edge.
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
  const unseen = seenAt === -1 ? feed.length : seenAt
  const toggle = () => {
    setOpen(!open)
    if (newest) setSeenKey(keyOf(newest))
  }

  return (
    <div className="ticker-wrap">
      {open && (
        <m.div
          className="feed-sheet"
          role="dialog"
          aria-label="Feed"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="sos-grip" />
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
        </m.div>
      )}
      <button
        type="button"
        className={newest?.act ? 'ticker act' : 'ticker'}
        aria-label={newest ? `Feed: ${newest.text}${newest.means ? ` ${newest.means}` : ''}` : 'Feed'}
        aria-expanded={open}
        onClick={toggle}
      >
        {newest ? (
          <>
            {newest.label && <span className="ticker-label">{newest.label}</span>}
            <span className="ticker-text">
              {newest.text}
              {newest.means && <em>{` → ${newest.means}`}</em>}
            </span>
          </>
        ) : (
          <span className="ticker-text muted">Nothing yet</span>
        )}
        {unseen > 0 && <span className="ticker-count">{`+${unseen}`}</span>}
      </button>
    </div>
  )
}
