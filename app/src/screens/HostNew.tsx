import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ArenaDraft } from '../../shared/arenaDraft.js'
import { MAX_STATIONS } from '../../shared/ids.js'
import { DEFAULT_SETTINGS, type Arena, type LatLng, type PowerUpKind, type Settings } from '../../shared/types.js'
import { call } from '../game/api'
import { loadOrganiserSession } from '../game/organiserSession'
import PlaceMap from '../game/PlaceMap'
import SetupSteps from '../game/SetupSteps'
import Sticker from '../game/Sticker'
import type { StickerKind } from '../game/stickerArt'
import { ErrorText, Pills, Screen } from '../game/ui'
import { platformOf } from '../game/device'
import ArenaSetup, { type SavedArenaForEdit } from './ArenaSetup'
import { noticeParam } from '../game/cardNotice'

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

const CORE_STICKERS: PowerUpKind[] = ['shield', 'cloak', 'flare', 'focus']
// Both secret legendaries end Full's row; this row is organiser-only, so naming them here is fine.
const FULL_STICKERS: StickerKind[] = ['decoy', 'shield', 'cloak', 'toyol', 'grab', 'flare', 'focus', 'along', 'dato', 'bomoh']

const LENGTHS: { value: Settings['lengthMin']; text: string; sub: string }[] = [
  { value: 30, text: 'Quick', sub: '30 MIN' },
  { value: 45, text: 'Standard', sub: '45 MIN' },
  { value: 60, text: 'Long', sub: '60 MIN' },
]
const BANDS: { value: Settings['playersBand']; text: string }[] = [
  { value: 20, text: 'Up to 20' },
  { value: 30, text: '21–30' },
  { value: 40, text: '31–40' },
]

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

/** The setup's pill-shaped choice bar (a radio group). `on` is the picked option's fill. */
function Seg<T extends string | number>(props: {
  label: string
  value: T | null
  options: { value: T; text: string; sub?: string; disabled?: boolean }[]
  onChange: (v: T) => void
  on?: { background: string; color: string }
}) {
  const on = props.on ?? { background: 'var(--white)', color: 'var(--black)' }
  return (
    <div role="radiogroup" aria-label={props.label} style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 999, border: '1px solid #333' }}>
      {props.options.map((o) => {
        const picked = props.value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={picked}
            aria-label={`${props.label}: ${o.text}`}
            disabled={o.disabled}
            onClick={() => !picked && props.onChange(o.value)}
            style={{
              flex: 1,
              border: 0,
              borderRadius: 999,
              padding: '8px 4px',
              font: '700 13px var(--font)',
              cursor: o.disabled ? 'default' : 'pointer',
              opacity: o.disabled ? 0.35 : 1,
              background: picked ? on.background : 'transparent',
              color: picked ? on.color : 'var(--white)',
            }}
          >
            {o.text}
            {o.sub && <small style={{ display: 'block', font: '500 9px var(--mono)', letterSpacing: '0.06em', opacity: 0.6 }}>{o.sub}</small>}
          </button>
        )
      })}
    </div>
  )
}

const label = (text: string) => (
  <p className="eyebrow" style={{ marginBottom: -8 }}>
    {text}
  </p>
)

/** One legendary card's setting: a coloured block with its title, an Off / On choice and a line on what it does. */
function Legendary(props: {
  tone: 'yellow' | 'purple'
  art: ReactNode
  title: ReactNode
  who: string
  seg: ReactNode
  say: string
}) {
  const yellow = props.tone === 'yellow'
  return (
    <div
      style={{
        borderRadius: 14,
        padding: '10px 11px 8px',
        border: `1.5px solid ${yellow ? 'var(--legendary-2)' : 'var(--bomoh-3)'}`,
        background: yellow ? 'rgba(255,214,10,.06)' : 'rgba(155,93,229,.09)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {props.art}
        <div>
          <b style={{ fontSize: 15 }}>{props.title}</b>
          <small style={{ display: 'block', font: '500 9px var(--mono)', letterSpacing: '0.12em', color: yellow ? 'var(--legendary-2)' : 'var(--bomoh-2)' }}>
            {props.who}
          </small>
        </div>
      </div>
      {props.seg}
      <p className="muted" style={{ fontSize: 12 }}>
        {props.say}
      </p>
    </div>
  )
}

export default function HostNew() {
  // All the wizard's state lives here, so going Back loses nothing.
  const [step, setStep] = useState<1 | 2 | 3>(1)
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
  const [showFields, setShowFields] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [peerName, setPeerName] = useState('')
  const [peerInviteUrl, setPeerInviteUrl] = useState('')
  const [peerBusy, setPeerBusy] = useState(false)
  // Set the moment Create game is pressed, so a quick double tap can't make two games.
  const creating = useRef(false)
  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))
  const organiser = loadOrganiserSession(localStorage)
  const organiserToken = organiser?.organiserToken
  const chosen = parks?.find((p) => p.id === chosenId) ?? null
  const parkName = chosen?.name ?? oneOff?.name ?? ''

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
    if (creating.current) return
    creating.current = true
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
      const { code, notice } = await call<{ code: string; notice?: string }>('create', {
        settings,
        organiserToken,
        ...(chosen ? { savedArenaId: chosen.id, overrides } : { draft: oneOff }),
      })
      const param = noticeParam(notice)
      window.location.assign(`/host/${code}?setup=crew${param ? `&notice=${param}` : ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
      creating.current = false
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

  const goTo = (s: 1 | 2 | 3) => {
    setError('')
    setStep(s)
  }
  const buttons = (primary: ReactNode, hasBack: boolean) => (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      {hasBack && (
        <button type="button" className="btn btn-ghost" style={{ flex: '0 0 34%' }} onClick={() => goTo((step - 1) as 1 | 2)}>
          Back
        </button>
      )}
      {primary}
    </div>
  )
  const nextButton = (disabled = false) => (
    <button type="button" className="btn" style={{ flex: 1 }} disabled={disabled} onClick={() => goTo((step + 1) as 2 | 3)}>
      Next
    </button>
  )
  const headingStyle = { fontSize: 32, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1.05 } as const
  const volt = (s: string) => (
    <>
      {s}
      <span style={{ color: 'var(--volt)' }}>?</span>
    </>
  )

  return (
    <Screen>
      <p className="eyebrow">{`NEW GAME · STEP ${step} OF 5`}</p>
      <SetupSteps step={step} />

      {step === 1 && (
        <>
          <h1 style={headingStyle}>{volt('Where are you')}</h1>

          {onLaptop && (
            <div className="card">
              <p style={{ fontWeight: 600 }}>Tip: create the game on your phone</p>
              <p className="muted" style={{ marginTop: 4 }}>
                Laptops guess their location from Wi-Fi, so the map may start in the wrong place. Phones use GPS.
              </p>
            </div>
          )}

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
                  <p style={{ fontWeight: 600 }}>{`${p.name} · ${stationCount(p.arena.stations?.length ?? 0)}`}</p>
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
                      { value: 'jail', text: 'Penjara' },
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
              <ErrorText>{error}</ErrorText>
              {buttons(nextButton(!chosen && !oneOff), false)}
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="muted"
              style={{ background: 'none', border: 0, font: 'inherit', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}
              aria-expanded={showInvite}
              onClick={() => setShowInvite(!showInvite)}
            >
              Invite another organiser
            </button>
            {showInvite && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'stretch' }}>
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
            )}
            <a className="muted" href="/host/kit" style={{ textDecoration: 'underline', fontSize: 12 }}>
              Your kit
            </a>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 style={headingStyle}>{volt('Which game')}</h1>
          <p className="muted" style={{ marginTop: -8 }}>
            {parkName}
          </p>
          <div role="radiogroup" aria-label="Game" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(
              [
                { value: 'core', title: 'Core', tag: 'BEST FOR FIRST-TIMERS', text: 'The chase, check-ins and Penjara, plus 4 simple power-ups. Learnable in 5 minutes.', stickers: CORE_STICKERS },
                { value: 'full', title: 'Full', tag: 'FOR REGULARS', text: 'Everything in Core, plus 4 more power-ups and two secret legendaries.', stickers: FULL_STICKERS },
              ] as const
            ).map((m) => {
              const picked = settings.mode === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  aria-label={`Game: ${m.title}`}
                  // The check-in switch is Full only (rules §3): back to Core turns it off.
                  onClick={() => set(m.value === 'core' ? { mode: 'core', chaserSnapshot: false } : { mode: 'full' })}
                  style={{
                    textAlign: 'left',
                    color: 'var(--white)',
                    font: 'inherit',
                    cursor: 'pointer',
                    borderRadius: 18,
                    padding: 12,
                    border: `1.5px solid ${picked ? 'var(--volt)' : '#333'}`,
                    background: picked ? 'rgba(198,255,61,.06)' : 'transparent',
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: 19, letterSpacing: '-0.03em' }}>{m.title}</b>
                    <span style={{ font: '500 9px var(--mono)', letterSpacing: '0.14em', color: 'var(--volt)' }}>{m.tag}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 13, opacity: 0.78, margin: '5px 0 7px', lineHeight: 1.35 }}>{m.text}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {m.stickers.map((k) => (
                      <Sticker key={k} kind={k} size={34} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
          <ErrorText>{error}</ErrorText>
          {buttons(nextButton(), true)}
        </>
      )}

      {step === 3 && (
        <>
          <h1 style={headingStyle}>{volt('How long')}</h1>
          <Seg<number>
            label="Length"
            value={LENGTHS.some((l) => l.value === settings.lengthMin) ? settings.lengthMin : null}
            options={LENGTHS}
            onChange={(v) => set({ lengthMin: v as Settings['lengthMin'] })}
          />
          <p className="muted" style={{ marginTop: -6 }}>
            {`Hide ${settings.hideMin} min · ping every ${settings.pingMin} min · Penjara view ${settings.spectatorDelayMin} min behind.`}{' '}
            <button
              type="button"
              className="muted"
              style={{ background: 'none', border: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
              aria-expanded={showFields}
              onClick={() => setShowFields(!showFields)}
            >
              Change
            </button>
          </p>
          {showFields && (
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
          )}

          {label('EXPECTED PLAYERS')}
          <Seg<number>
            label="Expected players"
            value={settings.playersBand}
            options={BANDS}
            onChange={(v) => set({ playersBand: v as Settings['playersBand'] })}
          />

          {settings.mode === 'full' ? (
            <>
              {label('LEGENDARY CARDS · SECRET FROM PLAYERS')}
              <Legendary
                tone="yellow"
                art={<Sticker kind="dato" size={40} />}
                title="Dato Seri"
                who="FOR DIKEJAR · YELLOW"
                seg={
                  <Seg<'off' | 'stash'>
                    label="Dato Seri"
                    value={settings.legendaries.dato}
                    options={[
                      { value: 'off', text: 'Off' },
                      { value: 'stash', text: 'On' },
                    ]}
                    onChange={(v) => set({ legendaries: { ...settings.legendaries, dato: v } })}
                    on={{ background: 'var(--legendary-2)', color: 'var(--legendary-ink)' }}
                  />
                }
                say="A hidden QR card. The runner who finds it can free themselves and 2 more from Penjara. You'll hide it during the walk."
              />
              <Legendary
                tone="purple"
                art={<Sticker kind="bomoh" size={40} />}
                title="Bomoh"
                who="FOR KEJAR · PURPLE"
                seg={
                  <Seg<'off' | 'stash'>
                    label="Bomoh"
                    value={settings.legendaries.bomoh}
                    options={[
                      { value: 'off', text: 'Off' },
                      { value: 'stash', text: 'On' },
                    ]}
                    onChange={(v) => set({ legendaries: { ...settings.legendaries, bomoh: v } })}
                    on={{ background: 'var(--bomoh-2)', color: 'var(--bomoh-ink)' }}
                  />
                }
                say="A hidden QR card. The chaser who finds it shows every runner to Kejar for 2 pings. You'll hide it during the walk."
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>Dikejar can see Kejar at check-in</span>
                <Pills<'off' | 'on'>
                  label="Dikejar can see Kejar at check-in"
                  value={settings.chaserSnapshot ? 'on' : 'off'}
                  options={[
                    { value: 'off', text: 'Off' },
                    { value: 'on', text: 'On' },
                  ]}
                  onChange={(v) => set({ chaserSnapshot: v === 'on' })}
                />
              </div>
            </>
          ) : (
            <p className="muted">No extra settings in Core.</p>
          )}

          <ErrorText>{error}</ErrorText>
          {buttons(
            <button type="button" className="btn" style={{ flex: 1 }} disabled={busy} onClick={create}>
              {busy ? 'Creating…' : 'Create game'}
            </button>,
            true,
          )}
        </>
      )}
    </Screen>
  )
}
