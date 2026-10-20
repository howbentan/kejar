import { useCallback, useState } from 'react'
import { ARENAS } from '../../shared/arenas.js'
import { DEFAULT_SETTINGS, type LatLng, type Settings } from '../../shared/types.js'
import AreaPicker from '../game/AreaPicker'
import { call } from '../game/api'
import { saveSession } from '../game/session'
import { ErrorText, Pills, Screen } from '../game/ui'
import { platformOf } from '../spike/device'

const SIZES = ['150', '200', '300'] as const

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
  const [arenaId, setArenaId] = useState<string>('around-me')
  const [center, setCenter] = useState<LatLng | null>(null)
  const [size, setSize] = useState<(typeof SIZES)[number]>('200')
  const onPick = useCallback((c: LatLng) => setCenter(c), [])
  // Laptops guess their location from Wi-Fi; phones have GPS.
  const onLaptop = platformOf(navigator.userAgent) === 'other'
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))

  async function create() {
    setBusy(true)
    setError('')
    try {
      const picked = arenaId === 'around-me'
      if (picked && !center) throw new Error('Move the map to choose your play area first.')
      const { code, hostKey } = await call<{ code: string; hostKey: string }>('create', {
        arenaId,
        settings,
        ...(picked ? { center, radiusM: Number(size) } : {}),
      })
      saveSession(localStorage, code, { hostKey })
      window.location.assign(`/host/${code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
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

      <p className="eyebrow">Play area</p>
      <Pills<string>
        label="Play area"
        value={arenaId}
        options={[
          { value: 'around-me', text: 'Pick on map' },
          ...Object.values(ARENAS).map((a) => ({ value: a.id, text: a.name })),
        ]}
        onChange={setArenaId}
      />
      {arenaId === 'around-me' && (
        <>
          <AreaPicker radiusM={Number(size)} onChange={onPick} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Play area size</span>
            <Pills<(typeof SIZES)[number]>
              label="Play area size"
              value={size}
              options={SIZES.map((s) => ({ value: s, text: `${s} m` }))}
              onChange={setSize}
            />
          </div>
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
