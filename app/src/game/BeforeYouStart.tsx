import { useRef, useState } from 'react'
import { SECRET_PLACE_IDS } from '../../shared/kit.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import HowToPlay from './HowToPlay'
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
 * Brief the players is a button: it opens how to play on every phone (`startBriefing`, which sets `briefed_at`, the
 * source of the kit item `brief-players` being done) and then shows who is ready.
 */
export default function BeforeYouStart({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const [showKit, setShowKit] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<'runner' | 'chaser' | null>(null)

  const marshals = view.roster.filter((p) => p.role === 'marshal')
  // The secret card's own spot is the organiser's alone, so it isn't part of "kit placed".
  const shared = (view.kit?.places ?? []).filter((p) => !SECRET_PLACE_IDS.includes(p.id))
  const placed = shared.filter((p) => view.kit?.placed[p.id] === true).length
  const kitDone = shared.length > 0 && placed === shared.length

  const without = [...(view.me.push ? [] : ['You']), ...marshals.filter((m) => !m.pushOn).map((m) => m.name)]
  const sosDone = without.length === 0
  const sosNote = sosDone
    ? 'Everyone has them on'
    : `${list(without)} ${without.length > 1 || without[0] === 'You' ? 'haven\'t' : 'hasn\'t'} turned them on`

  const briefing = view.briefing && 'started' in view.briefing ? view.briefing : null
  const briefDone = briefing?.started ?? false

  async function tapBrief() {
    const organiser = loadOrganiserSession(localStorage)
    if (!organiser) return
    setError('')
    try {
      await call('startBriefing', { code, organiserToken: organiser.organiserToken })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <p className="eyebrow">BEFORE YOU START</p>
      <Check
        label="Kit placed"
        done={kitDone}
        note={`${placed} of ${shared.length} placed`}
      />
      <Check
        label="Helper joined"
        done={marshals.length > 0}
        note={marshals.length > 0 ? `${list(marshals.map((m) => m.name))} · Penjara` : 'Invite a marshal below'}
      />
      <Check label="SOS alerts on" done={sosDone} note={sosNote} />
      {briefDone ? (
        <>
          <Check label="Brief the players" done note={`${briefing!.ready} of ${briefing!.total} ready`} />
          <p className="muted" style={{ fontSize: 10.5, margin: '4px 0 0 29px' }}>
            {view.roster
              .filter((p) => briefing!.status[p.id])
              .map((p) => `${p.name} ${briefing!.status[p.id]}`)
              .join(' · ')}
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void tapBrief()}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #1d1d1d', fontSize: 12.5 }}
        >
          <span style={{ width: 19, height: 19, borderRadius: 5, border: '1.5px solid #555', flex: 'none', marginTop: 1 }} />
          <span>
            <span>Brief the players</span>
            <small style={{ display: 'block', opacity: 0.6, fontSize: 10.5 }}>Opens how to play on every phone</small>
          </span>
        </button>
      )}
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
      <p style={{ fontSize: 12, marginTop: 4 }}>
        Preview:{' '}
        <button type="button" onClick={() => setPreview('runner')} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>
          Dikejar
        </button>
        {' · '}
        <button type="button" onClick={() => setPreview('chaser')} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>
          Kejar
        </button>
      </p>
      {preview && <HowToPlay side={preview} mode={view.settings.mode} snapshot={view.settings.chaserSnapshot === true} onClose={() => setPreview(null)} />}
      {showKit && <PackList code={code} view={view} refresh={refresh} compact />}
    </div>
  )
}
