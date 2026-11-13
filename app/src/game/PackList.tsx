import { useEffect, useRef, useState } from 'react'
import { LEGENDARY_KINDS } from '../../shared/legendaries.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import Marker from './Marker'
import { loadOrganiserSession } from './organiserSession'
import SetupSteps from './SetupSteps'
import { ErrorText } from './ui'
import { noticeLegendaries, REPRINT_LINE, waitingForCard, type Legendary } from './cardNotice'

type Item = NonNullable<View['kit']>['items'][number]

/** A secret card's line in its own colour (the organiser's list only ever has these). */
const TONE_COLOUR: Record<NonNullable<Item['tone']>, string> = {
  yellow: 'var(--legendary-2)',
  orange: 'var(--ring-2)',
  purple: 'var(--bomoh-2)',
  green: 'var(--hijau-2)',
}

function Row({ item, done, code, onTap }: { item: Item; done: boolean; code: string; onTap?: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const yellow = item.tone === 'yellow'
  const toneColour = item.tone ? TONE_COLOUR[item.tone] : null
  return (
    <div
      role="checkbox"
      aria-checked={done}
      tabIndex={0}
      data-done={done || undefined}
      onClick={onTap}
      onKeyDown={(e) => onTap && (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onTap())}
      style={{
        position: 'relative',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '8px 0',
        borderBottom: '1px solid #1d1d1d',
        fontSize: 12.5,
        cursor: onTap ? 'pointer' : 'default',
        textDecoration: done ? 'line-through' : undefined,
      }}
    >
      <div
        ref={box}
        style={{ width: 19, height: 19, borderRadius: 5, border: `1.5px solid ${done ? 'var(--volt)' : '#555'}`, flex: 'none', marginTop: 1 }}
      />
      <div style={{ opacity: done ? 0.5 : 1 }}>
        <span style={toneColour ? { color: toneColour, fontWeight: 700 } : undefined}>{item.label}</span>
        {item.note && (
          <small style={{ display: item.group === 'day' ? 'block' : 'inline', marginLeft: item.group === 'day' ? 0 : 4, opacity: 0.6, fontSize: 10.5 }}>
            {item.note}
          </small>
        )}
      </div>
      {item.id === 'walk' && (
        <a
          href={`/host/${code}/walk`}
          onClick={(e) => e.stopPropagation()}
          style={{ marginLeft: 'auto', fontFamily: 'var(--mono, monospace)', fontSize: 9, letterSpacing: '0.1em', border: '1px solid #444', borderRadius: 999, padding: '3px 7px', flex: 'none', color: 'inherit', textDecoration: 'none' }}
        >
          OPEN
        </a>
      )}
      {done && <Marker marks={[{ shape: 'tick', target: box }]} colour={yellow ? 'yellow' : 'lime'} />}
    </div>
  )
}

function Ready() {
  const text = useRef<HTMLSpanElement>(null)
  return (
    <div style={{ position: 'relative', textAlign: 'center', fontWeight: 800, fontSize: 21, letterSpacing: '-0.04em', margin: '12px 0 4px' }}>
      <span ref={text}>Ready for event day</span>
      <Marker marks={[{ shape: 'circle', target: text }]} />
    </div>
  )
}

/**
 * The organiser's packing list (setup step 5, and the lobby's "Before you start"). Tapping a line saves its tick.
 * `compact` leaves out the heading, progress bar, notice and lobby button, for use inside the lobby.
 */
export default function PackList({ code, view, refresh, compact = false }: { code: string; view: View; refresh: () => void; compact?: boolean }) {
  const [local, setLocal] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const items = view.kit?.items ?? []
  // A tap shows at once; the override goes once the refreshed view agrees, so later server changes (the walk's
  // own tick) show through.
  useEffect(() => {
    setLocal((l) => {
      const keep = Object.entries(l).filter(([id, on]) => items.find((i) => i.id === id)?.ticked !== on)
      return keep.length === Object.keys(l).length ? l : Object.fromEntries(keep)
    })
  }, [items])
  const doneOf = (i: Item) => local[i.id] ?? i.ticked
  const ready = items.length > 0 && items.every(doneOf)
  // Each legendary's notice stays while the game wants its card but has none yet, and goes once one is assigned
  // (ruling R9). A view without the cards (not the organiser's) falls back to the notice the create step passed on.
  const notices: Legendary[] = compact
    ? []
    : view.datoCard === undefined
      ? noticeLegendaries(window.location.search)
      : LEGENDARY_KINDS.filter((l) => waitingForCard(view, l))

  async function tap(item: Item) {
    // No organiser session on this phone: the rows are read-only.
    const organiser = loadOrganiserSession(localStorage)
    if (!organiser) return
    const on = !doneOf(item)
    setLocal((l) => ({ ...l, [item.id]: on }))
    setError('')
    try {
      await call('setKit', { code, organiserToken: organiser.organiserToken, tick: { id: item.id, on } })
      refresh()
    } catch (e) {
      setLocal((l) => {
        const { [item.id]: _undo, ...rest } = l
        return rest
      })
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const group = (g: Item['group'], title: string) => (
    <>
      <p className="eyebrow" style={{ marginTop: 10 }}>{title}</p>
      {items.filter((i) => i.group === g).map((i) => (
        <Row key={i.id} item={i} done={doneOf(i)} code={code} onTap={i.id === 'walk' || i.id === 'brief-players' ? undefined : () => void tap(i)} />
      ))}
    </>
  )

  return (
    <>
      {!compact && <SetupSteps step={5} />}
      {!compact && <h1>Pack.</h1>}
      {!compact && <p className="muted">From your printed kit. Nothing to print today.</p>}
      {notices.map((l) => (
        <p key={l} className="muted">
          {REPRINT_LINE[l]}{' '}
          <a href="/host/kit" style={{ textDecoration: 'underline' }}>
            Your kit
          </a>
        </p>
      ))}
      {group('pack', 'PACK')}
      {group('day', 'ON THE DAY')}
      {ready && <Ready />}
      <ErrorText>{error}</ErrorText>
      {!compact && (
        <button className="btn" style={{ marginTop: 14 }} onClick={() => window.location.assign(`/host/${code}`)}>
          Go to the lobby
        </button>
      )}
    </>
  )
}
