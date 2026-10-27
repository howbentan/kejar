import { useEffect, useState } from 'react'
import type { ArenaDraft } from '../../shared/arenaDraft.js'
import { MAX_STATIONS } from '../../shared/ids.js'
import { DEFAULT_SETTINGS, type Arena, type LatLng, type Settings } from '../../shared/types.js'
import { call } from '../game/api'
import { loadOrganiserSession } from '../game/organiserSession'
import PlaceMap from '../game/PlaceMap'
import { ErrorText, Pills, Screen } from '../game/ui'
import { platformOf } from '../spike/device'
import ArenaSetup, { type SavedArenaForEdit } from './ArenaSetup'

/** A saved park as listArenas returns it. */
interface SavedPark {
  id: string
  name: string
  areaHa: number
  waterChecked: boolean
  arena: Arena
  draft: ArenaDraft
  problems: string[]
}

const stationCount = (n: number) => `${n} station${n === 1 ? '' : 's'}`
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function NumberField(props: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span>{props.label}</span>
      <input
        className="input mono"
        style={{ width: 90 }}
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function HostNew() {
  const [parks, setParks] = useState<SavedPark[] | null>(null)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [oneOff, setOneOff] = useState<ArenaDraft | null>(null)
  const [setup, setSetup] = useState<'new' | SavedArenaForEdit | null>(null)
  const [deleting, setDeleting] = useState<SavedPark | null>(null)
  // This game's own spots, starting from the saved park's; never written back to it.
  const [mode, setMode] = useState<'stations' | 'jail' | 'start'>('stations')
  const [jail, setJail] = useState<LatLng | null>(null)
  const [start, setStart] = useState<LatLng | null>(null)
  const [stations, setStations] = useState<LatLng[]>([])
  // Laptops guess their location from Wi-Fi; phones have GPS.
  const onLaptop = platformOf(navigator.userAgent) === 'other'
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [peerName, setPeerName] = useState('')
  const [peerInviteUrl, setPeerInviteUrl] = useState('')
  const [peerBusy, setPeerBusy] = useState(false)
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))
  const organiser = loadOrganiserSession(localStorage)
  const organiserToken = organiser?.organiserToken
  const chosen = parks?.find((p) => p.id === chosenId) ?? null

  async function loadParks(): Promise<SavedPark[]> {
    const { arenas } = await call<{ arenas: SavedPark[] }>('listArenas', { organiserToken })
    setParks(arenas)
    return arenas
  }

  useEffect(() => {
    if (organiserToken) loadParks().catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organiserToken])

  function choose(p: SavedPark) {
    setChosenId(p.id)
    setOneOff(null)
    setJail(p.arena.jail)
    setStart(p.arena.start)
    setStations(p.arena.stations ?? [])
    setMode('stations')
  }

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const retry = (p: SavedPark) =>
    act(async () => {
      await call('recheckWater', { organiserToken, arenaId: p.id })
      await loadParks()
    })

  const remove = (p: SavedPark) =>
    act(async () => {
      setDeleting(null)
      await call('deleteArena', { organiserToken, arenaId: p.id })
      if (chosenId === p.id) setChosenId(null)
      await loadParks()
    })

  async function setupDone(r: { arenaId?: string; draft: ArenaDraft }) {
    setSetup(null)
    if (!r.arenaId) {
      setOneOff(r.draft)
      setChosenId(null)
      return
    }
    await act(async () => {
      const fresh = await loadParks()
      const saved = fresh.find((p) => p.id === r.arenaId)
      if (saved) choose(saved)
    })
  }

  function tap(p: LatLng) {
    if (mode === 'jail') setJail(p)
    else if (mode === 'start') setStart(p)
    else if (stations.length < MAX_STATIONS) setStations([...stations, p])
  }

  async function create() {
    setBusy(true)
    setError('')
    try {
      if (!chosen && !oneOff) throw new Error('Pick a park or set up a new play area first.')
      // Only what was moved for this game; the server fills in the rest from the saved park.
      const overrides: Record<string, unknown> = {}
      if (chosen) {
        if (!same(jail, chosen.arena.jail)) overrides.jail = jail
        if (!same(start, chosen.arena.start)) overrides.start = start
        if (!same(stations, chosen.arena.stations ?? [])) overrides.stations = stations
      }
      const { code } = await call<{ code: string }>('create', {
        settings,
        organiserToken,
        ...(chosen ? { savedArenaId: chosen.id, overrides } : { draft: oneOff }),
      })
      window.location.assign(`/host/${code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  async function invitePeer() {
    setPeerBusy(true)
    setError('')
    try {
      const { inviteToken } = await call<{ inviteToken: string }>('createOrganiserInvite', {
        organiserToken: organiser!.organiserToken,
        name: peerName.trim(),
      })
      setPeerInviteUrl(`${window.location.origin}/organiser/${inviteToken}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPeerBusy(false)
    }
  }

  if (!organiser) {
    return (
      <Screen eyebrow="kejar. · organise">
        <p className="muted">
          You need an invite link from another organiser to create games on this phone.
        </p>
      </Screen>
    )
  }

  return (
    <Screen eyebrow="kejar. · organise">
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.04em' }}>New game</h1>

      {onLaptop && (
        <div className="card">
          <p style={{ fontWeight: 600 }}>Tip: create the game on your phone</p>
          <p className="muted" style={{ marginTop: 4 }}>
            Laptops guess their location from Wi-Fi, so the map may start in the wrong place. Phones use GPS.
          </p>
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontWeight: 600 }}>Invite another organiser</p>
        <label className="eyebrow" htmlFor="peerName">
          New organiser&apos;s name
        </label>
        <input id="peerName" className="input" maxLength={40} value={peerName} onChange={(e) => setPeerName(e.target.value)} />
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} disabled={!peerName.trim() || peerBusy} onClick={invitePeer}>
          Send invite
        </button>
        {peerInviteUrl && (
          <p className="muted" style={{ wordBreak: 'break-all' }}>
            {peerInviteUrl}
          </p>
        )}
      </div>

      <p className="eyebrow">Play area</p>
      {setup ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ArenaSetup initial={setup === 'new' ? undefined : setup} onDone={(r) => void setupDone(r)} />
          <button type="button" className="btn btn-ghost" onClick={() => setSetup(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          {parks?.length === 0 && <p className="muted">No saved parks yet.</p>}
          {parks?.map((p) => (
            <div key={p.id} className={p.id === chosenId ? 'card park park-on' : 'card park'}>
              <p style={{ fontWeight: 600 }}>{`${p.name} · ${p.areaHa.toFixed(1)} ha · ${stationCount(p.arena.stations?.length ?? 0)}`}</p>
              {!p.waterChecked && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="muted">Lakes not checked</span>
                  <button type="button" className="pill" disabled={busy} onClick={() => void retry(p)}>
                    Retry
                  </button>
                </div>
              )}
              {p.problems.map((problem) => (
                <p key={problem} role="alert">
                  {problem}
                </p>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className={p.id === chosenId ? 'pill pill-on' : 'pill'} aria-label={`Use ${p.name}`} onClick={() => choose(p)}>
                  {p.id === chosenId ? 'Chosen' : 'Use'}
                </button>
                <button type="button" className="pill" aria-label={`Edit ${p.name}`} onClick={() => setSetup({ id: p.id, draft: p.draft })}>
                  Edit
                </button>
                <button type="button" className="pill" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          {deleting && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontWeight: 700 }}>{`Delete ${deleting.name}? Games already made keep their map.`}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" disabled={busy} onClick={() => void remove(deleting)}>
                  Yes, delete
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setSetup('new')}>
            New play area
          </button>
          {oneOff && <p className="muted">{`This game only: ${oneOff.name}`}</p>}
          {chosen && (
            <>
              {!chosen.waterChecked && <p role="status">Lakes weren&apos;t checked for this park. Look at the map before playing.</p>}
              <p className="muted">Move things for this game only (the saved park stays as it is):</p>
              <Pills<'stations' | 'jail' | 'start'>
                label="Place"
                value={mode}
                options={[
                  { value: 'stations', text: 'Stations' },
                  { value: 'jail', text: 'Jail' },
                  { value: 'start', text: 'Start' },
                ]}
                onChange={setMode}
              />
              <PlaceMap
                boundary={chosen.arena.boundary}
                holes={chosen.arena.holes ?? []}
                outline={null}
                circle={null}
                mode={mode}
                stations={stations}
                jail={jail}
                start={start}
                toilets={chosen.arena.toilets ?? []}
                onTap={tap}
                onStationRemove={(k) => setStations(stations.filter((_, i) => i !== k))}
              />
              <p className="muted">{`Stations: ${stations.length}`}</p>
            </>
          )}
        </>
      )}

      <p className="eyebrow">Settings</p>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <NumberField label="Game length (min)" value={settings.lengthMin} min={15} max={90} onChange={(n) => set({ lengthMin: n })} />
        <NumberField label="Hide time (min)" value={settings.hideMin} min={1} max={15} onChange={(n) => set({ hideMin: n })} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Ping every</span>
          <Pills<'2' | '3' | '5'>
            label="Ping every"
            value={String(settings.pingMin) as '2' | '3' | '5'}
            options={[
              { value: '2', text: '2 min' },
              { value: '3', text: '3 min' },
              { value: '5', text: '5 min' },
            ]}
            onChange={(v) => set({ pingMin: Number(v) as Settings['pingMin'] })}
          />
        </div>
        <NumberField
          label="Spectator delay (min)"
          value={settings.spectatorDelayMin}
          min={0}
          max={5}
          onChange={(n) => set({ spectatorDelayMin: n })}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Check-ins</span>
          <Pills<Settings['checkinMode']>
            label="Check-ins"
            value={settings.checkinMode}
            options={[
              { value: 'push', text: 'Push alerts' },
              { value: 'schedule', text: 'Fixed schedule' },
            ]}
            onChange={(v) => set({ checkinMode: v })}
          />
        </div>
      </div>

      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={busy} onClick={create}>
        {busy ? 'Creating…' : 'Create game'}
      </button>
      <a className="muted" href="/print/tags">
        Print runner tags and the jail code →
      </a>
    </Screen>
  )
}
