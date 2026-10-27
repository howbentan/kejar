import { useMemo, useState } from 'react'
import { arenaFromDraft, KL_FALLBACK, type ArenaDraft } from '../../shared/arenaDraft.js'
import { MAX_STATIONS } from '../../shared/ids.js'
import { buildPlayArea } from '../../shared/playArea.js'
import type { LatLng } from '../../shared/types.js'
import type { ParkHit } from '../../api/_lib/osm.js'
import { call } from '../game/api'
import { loadOrganiserSession } from '../game/organiserSession'
import PlaceMap, { type PlaceMode } from '../game/PlaceMap'
import { ErrorText, Pills } from '../game/ui'

const SIZES = ['150', '200', '300', '500'] as const
type Size = (typeof SIZES)[number]
const NO_LAKE_CHECK = "Couldn't check for lakes. Look at the map before saving."
const LARGEST_ONLY = 'Only the largest part of the park is used'

export interface SavedArenaForEdit {
  id: string
  draft: ArenaDraft
}

const average = (pts: LatLng[]) => ({
  lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
  lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
})

/** Set up a play area: find a park (or a circle around me), trim it, place things, then save or use once. */
export default function ArenaSetup({
  onDone,
  initial,
}: {
  onDone: (r: { arenaId?: string; draft: ArenaDraft }) => void
  initial?: SavedArenaForEdit
}) {
  const organiserToken = loadOrganiserSession(localStorage)?.organiserToken
  const d0 = initial?.draft
  const [source, setSource] = useState<ArenaDraft['source']>(d0?.source ?? 'osm')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ParkHit[] | null>(null)
  const [park, setPark] = useState<{ osmRef: string | null; outline: LatLng[]; pieces: number } | null>(
    d0?.outline ? { osmRef: d0.osmRef, outline: d0.outline, pieces: 1 } : null,
  )
  const [features, setFeatures] = useState({ water: d0?.water ?? [], toilets: d0?.toilets ?? [], waterChecked: d0?.waterChecked ?? true })
  const [usePart, setUsePart] = useState(!!(d0?.circle && d0.source === 'osm'))
  const [size, setSize] = useState<Size>(
    (SIZES as readonly string[]).includes(String(d0?.circle?.radiusM)) ? (String(d0!.circle!.radiusM) as Size) : '200',
  )
  const [centre, setCentre] = useState<LatLng | null>(d0?.circle?.center ?? null)
  const [mode, setMode] = useState<PlaceMode>('stations')
  const [jail, setJail] = useState<LatLng | null>(d0?.jail ?? null)
  const [start, setStart] = useState<LatLng | null>(d0?.start ?? null)
  const [stations, setStations] = useState<LatLng[]>(d0?.stations ?? [])
  const [name, setName] = useState(d0?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const circleOn = source === 'circle' || usePart
  const draft: ArenaDraft = {
    name: name.trim(),
    source,
    osmRef: source === 'osm' ? (park?.osmRef ?? null) : null,
    outline: source === 'osm' ? (park?.outline ?? null) : null,
    circle: circleOn && centre ? { center: centre, radiusM: Number(size) } : null,
    water: source === 'osm' ? features.water : [],
    toilets: source === 'osm' ? features.toilets : [],
    waterChecked: source === 'osm' ? features.waterChecked : true,
    jail,
    start,
    stations,
  }

  // Live preview: the play area and the first thing wrong with the draft (name aside).
  const preview = useMemo(() => {
    const ready = source === 'osm' ? !!park : !!centre
    if (!ready) return null
    try {
      const area = buildPlayArea({ outline: draft.outline, water: draft.water, circle: draft.circle })
      let problem = ''
      try {
        arenaFromDraft({ ...draft, name: draft.name || 'Park' }, 'preview')
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e)
      }
      return { area, problem }
    } catch (e) {
      return { area: null, problem: e instanceof Error ? e.message : String(e) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(draft)])

  async function search() {
    setError('')
    setBusy(true)
    try {
      const r = await call<{ results: ParkHit[] }>('searchParks', { organiserToken, query: query.trim() })
      setResults(r.results)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function pick(hit: ParkHit) {
    setError('')
    setBusy(true)
    setPark({ osmRef: hit.osmRef, outline: hit.outline, pieces: hit.pieces })
    setResults(null)
    setJail(null)
    setStart(null)
    setStations([])
    setCentre(null)
    setUsePart(false)
    if (!name) setName(hit.name)
    try {
      setFeatures(await call('parkFeatures', { organiserToken, outline: hit.outline }))
    } catch {
      setFeatures({ water: [], toilets: [], waterChecked: false })
    } finally {
      setBusy(false)
    }
  }

  function chooseSource(s: ArenaDraft['source']) {
    setSource(s)
    setMode('stations')
    if (s === 'circle' && !centre) {
      setCentre(KL_FALLBACK)
      navigator.geolocation?.getCurrentPosition(
        (p) => setCentre({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => undefined,
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      )
    }
  }

  function toggleUsePart(on: boolean) {
    setUsePart(on)
    if (on && !centre && park) setCentre(average(park.outline))
    if (on) setMode('circle')
  }

  function tap(p: LatLng) {
    if (mode === 'circle') setCentre(p)
    else if (mode === 'jail') setJail(p)
    else if (mode === 'start') setStart(p)
    else if (stations.length < MAX_STATIONS) setStations([...stations, p])
  }

  async function save() {
    setError('')
    setBusy(true)
    try {
      const r = await call<{ arenaId: string }>('saveArena', {
        organiserToken,
        ...(initial ? { arenaId: initial.id } : {}),
        draft,
      })
      onDone({ arenaId: r.arenaId, draft })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const placeOptions = [
    ...(circleOn ? [{ value: 'circle' as const, text: 'Circle' }] : []),
    { value: 'stations' as const, text: 'Stations' },
    { value: 'jail' as const, text: 'Jail' },
    { value: 'start' as const, text: 'Start' },
  ]
  const showMap = source === 'circle' ? !!centre : !!park

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!initial && (
        <Pills<ArenaDraft['source']>
          label="Play area"
          value={source}
          options={[
            { value: 'osm', text: 'Find a park' },
            { value: 'circle', text: 'Circle around me' },
          ]}
          onChange={chooseSource}
        />
      )}

      {source === 'osm' && !initial && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="eyebrow" htmlFor="park-query">
            Park name
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="park-query"
              className="input"
              value={query}
              maxLength={80}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && query.trim().length >= 3 && void search()}
            />
            <button type="button" className="btn" disabled={busy || query.trim().length < 3} onClick={() => void search()}>
              Search
            </button>
          </div>
          {results && results.length === 0 && <p className="muted">No parks found. Try another name, or use a circle around you.</p>}
          {results?.map((h) => (
            <button key={h.osmRef} type="button" className="btn btn-ghost" onClick={() => void pick(h)}>
              {`${h.name} · ${h.areaHa.toFixed(1)} ha`}
            </button>
          ))}
        </div>
      )}

      {showMap && (
        <>
          {source === 'osm' && !features.waterChecked && <p role="status">{NO_LAKE_CHECK}</p>}
          {((park?.pieces ?? 1) > 1 || (preview?.area?.pieces ?? 1) > 1) && <p role="status">{LARGEST_ONLY}</p>}
          {source === 'osm' && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={usePart} onChange={(e) => toggleUsePart(e.target.checked)} />
              Use part of the park
            </label>
          )}
          {circleOn && (
            <Pills<Size> label="Circle size" value={size} options={SIZES.map((s) => ({ value: s, text: `${s} m` }))} onChange={setSize} />
          )}
          <Pills<PlaceMode> label="Place" value={mode} options={placeOptions} onChange={setMode} />
          <PlaceMap
            boundary={preview?.area?.boundary ?? null}
            holes={preview?.area?.holes ?? []}
            outline={draft.outline}
            circle={draft.circle}
            mode={mode}
            stations={stations}
            jail={jail}
            start={start}
            toilets={draft.toilets}
            onTap={tap}
            onStationRemove={(k) => setStations(stations.filter((_, i) => i !== k))}
          />
          <p className="muted" style={{ fontSize: 12 }}>
            {mode === 'circle' ? 'Tap where the circle should be centred.' : 'Tap to place · tap a station to remove it.'}
          </p>
          {preview?.area && (
            <p className="muted">
              Play area <span className="mono">{`${preview.area.areaHa.toFixed(1)} ha`}</span>
              {` · ${stations.length} station${stations.length === 1 ? '' : 's'}`}
            </p>
          )}
          {preview?.problem && <p role="alert">{preview.problem}</p>}

          <label className="eyebrow" htmlFor="park-name">
            Name this park
          </label>
          <input id="park-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" disabled={busy || !!preview?.problem || !name.trim()} onClick={() => void save()}>
              Save park
            </button>
            {source === 'circle' && !initial && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || !!preview?.problem}
                onClick={() => onDone({ draft: { ...draft, name: draft.name || 'Around the organiser' } })}
              >
                Use once
              </button>
            )}
          </div>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
