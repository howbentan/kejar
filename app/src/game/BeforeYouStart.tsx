import { useEffect, useRef, useState } from 'react'
import { SECRET_PLACE_IDS } from '../../shared/kit.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import Marker from './Marker'
import { loadOrganiserSession } from './organiserSession'
import PackList from './PackList'
import { ErrorText } from './ui'

function Check({ label, note, done, onTap }: { label: string; note: string; done: boolean; onTap?: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  return (
    <div
      role="checkbox"
      aria-checked={done}
      tabIndex={0}
      data-done={done || undefined}
      onClick={onTap}
      onKeyDown={(e) => onTap && (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), onTap())}
      style={{ position: 'relative', display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #1d1d1d', fontSize: 12.5, cursor: onTap ? 'pointer' : 'default' }}
    >
      <div ref={box} style={{ width: 19, height: 19, borderRadius: 5, border: `1.5px solid ${done ? 'var(--volt)' : '#555'}`, flex: 'none', marginTop: 1 }} />
      <div>
        <span>{label}</span>
        <small style={{ display: 'block', opacity: 0.6, fontSize: 10.5 }}>{note}</small>
      </div>
      {done && <Marker marks={[{ shape: 'tick', target: box }]} colour="lime" />}
    </div>
  )
}

/** "A, B and C". */
const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? ''))

/**
 * The lobby's four checks. They warn and never block Start: nothing here is wired to the Start button.
 * Brief the players is the only manual one (saved as kit tick `brief-players`).
 */
export default function BeforeYouStart({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const [briefed, setBriefed] = useState<boolean | null>(null)
  const [showKit, setShowKit] = useState(false)
  const [error, setError] = useState('')

  const marshals = view.roster.filter((p) => p.role === 'marshal')
  // The secret card's own spot is the organiser's alone, so it isn't part of "kit placed".
  const shared = (view.kit?.places ?? []).filter((p) => !SECRET_PLACE_IDS.includes(p.id))
  const placed = shared.filter((p) => view.kit?.placed[p.id] === true).length
  const kitDone = shared.length > 0 && placed === shared.length
  const helpers = ['you', ...marshals.map((m) => m.name)]

  const without = [...(view.me.push ? [] : ['You']), ...marshals.filter((m) => !m.pushOn).map((m) => m.name)]
  const sosDone = without.length === 0
  const sosNote = sosDone
    ? 'Everyone has them on'
    : `${list(without)} ${without.length > 1 || without[0] === 'You' ? 'haven\'t' : 'hasn\'t'} turned them on`

  const brief = view.kit?.items.find((i) => i.id === 'brief-players')
  const briefDone = briefed ?? brief?.ticked ?? false
  // Once the refreshed view agrees with a tap, the saved value takes over again.
  useEffect(() => {
    if (briefed !== null && brief?.ticked === briefed) setBriefed(null)
  }, [briefed, brief?.ticked])

  async function tapBrief() {
    const organiser = loadOrganiserSession(localStorage)
    if (!organiser) return
    const on = !briefDone
    setBriefed(on)
    setError('')
    try {
      await call('setKit', { code, organiserToken: organiser.organiserToken, tick: { id: 'brief-players', on } })
      refresh()
    } catch (e) {
      setBriefed(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <p className="eyebrow">BEFORE YOU START</p>
      <Check
        label="Kit placed"
        done={kitDone}
        note={kitDone ? `${placed} of ${shared.length} by ${list(helpers)}` : `${placed} of ${shared.length} placed`}
      />
      <Check
        label="Helper joined"
        done={marshals.length > 0}
        note={marshals.length > 0 ? `${list(marshals.map((m) => m.name))} · Penjara` : 'Invite a marshal below'}
      />
      <Check label="SOS alerts on" done={sosDone} note={sosNote} />
      <Check label="Brief the players" done={briefDone} note="Tap when you've told them the rules" onTap={() => void tapBrief()} />
      <ErrorText>{error}</ErrorText>
      <p className="muted" style={{ marginTop: 8 }}>Unticked items warn you, but never block Start.</p>
      <p style={{ fontSize: 12, marginTop: 4 }}>
        <button type="button" onClick={() => setShowKit((s) => !s)} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>
          Kit list
        </button>
        {' · '}
        <a href={`/host/${code}/walk`} style={{ color: 'inherit', textDecoration: 'underline' }}>
          Walk the park
        </a>
      </p>
      {showKit && <PackList code={code} view={view} refresh={refresh} compact />}
    </div>
  )
}
