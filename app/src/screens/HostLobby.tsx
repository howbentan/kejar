import { useEffect, useState } from 'react'
import type { Role } from '../../shared/types.js'
import { call } from '../game/api'
import BeforeYouStart from '../game/BeforeYouStart'
import CrewStep from '../game/CrewStep'
import { AlertsOnPhone } from '../game/MarshalTools'
import PackList from '../game/PackList'
import SetupMap from '../game/SetupMap'
import { saveLastGame } from '../game/lastGame'
import { loadOrganiserSession } from '../game/organiserSession'
import { clockOf, nextOccurrence, startsLabel } from '../game/plannedStart'
import { qrDataUrl } from '../game/qr'
import { ErrorText, ModeBadge, Pills, Screen, tagText } from '../game/ui'
import { useGameState } from '../game/useGameState'
import { Busy, FullLoader } from '../game/Runner'
import { useLoaderGate } from '../game/useLoaderGate'
import CancelGame from '../game/CancelGame'
import Cancelled from './Cancelled'

type Side = Extract<Role, 'runner' | 'chaser'>

const SIDES: { value: Side; text: string }[] = [
  { value: 'runner', text: 'Dikejar' },
  { value: 'chaser', text: 'Kejar' },
]

export default function HostLobby({ code }: { code: string }) {
  const organiser = loadOrganiserSession(localStorage)
  const { view, error: loadError, refresh } = useGameState(code, { sendLocation: 'never' })
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Which button was tapped ('start', 'mode', 'invite', or `role:<player id>`), so only it shows the running j.
  const [busyOn, setBusyOn] = useState<string | null>(null)
  const [marshalInviteUrl, setMarshalInviteUrl] = useState('')
  const joinUrl = `${window.location.origin}/join/${code}`
  // The planned start's time field: shows the saved time, and only sends once the organiser leaves it (or presses
  // Enter), never on each keystroke, where a half-typed 07:30 reads as 07:03.
  const savedStart = view?.settings.startsAt ?? null
  const [startText, setStartText] = useState('')
  useEffect(() => {
    setStartText(savedStart ? clockOf(Date.parse(savedStart)) : '')
  }, [savedStart])

  useEffect(() => {
    void qrDataUrl(joinUrl).then(setQr, () => setQr(''))
  }, [joinUrl])

  // Remember this game for the home screen's reconnect button.
  useEffect(() => {
    if (loadOrganiserSession(localStorage)) saveLastGame(localStorage, code, 'organiser')
  }, [code])

  useEffect(() => {
    if (view && view.phase !== 'lobby') window.location.assign(`/g/${code}`)
  }, [view, code])

  function commitStart() {
    if (!startText || (savedStart && clockOf(Date.parse(savedStart)) === startText)) return
    void act('setStartTime', { startsAt: new Date(nextOccurrence(startText, Date.now())).toISOString() })
  }

  async function act(action: string, body: object, tapped: string | null = null) {
    setBusy(true)
    setBusyOn(tapped)
    setError('')
    try {
      await call(action, { code, organiserToken: organiser!.organiserToken, ...body })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setBusyOn(null)
    }
  }

  // Core and Full can change here, in the lobby, and never after the start.
  async function changeMode() {
    if (!view) return
    setBusy(true)
    setBusyOn('mode')
    setError('')
    try {
      await call('setMode', {
        code,
        organiserToken: organiser!.organiserToken,
        mode: view.settings.mode === 'full' ? 'core' : 'full',
      })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setBusyOn(null)
    }
  }

  async function inviteMarshal() {
    setBusy(true)
    setBusyOn('invite')
    setError('')
    try {
      const { inviteToken } = await call<{ inviteToken: string }>('createMarshalInvite', {
        code,
        organiserToken: organiser!.organiserToken,
      })
      setMarshalInviteUrl(`${window.location.origin}/m/${code}/${inviteToken}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setBusyOn(null)
    }
  }

  // Players are Dikejar or Kejar, picked here so kit goes on before the start; marshals come from invite links.
  const roster = view?.roster ?? []
  const players = roster.filter((p) => p.role !== 'marshal')
  const marshals = roster.filter((p) => p.role === 'marshal')
  const runners = players.filter((p) => p.role === 'runner').length
  const chasers = players.filter((p) => p.role === 'chaser').length
  const suggested = Math.max(1, Math.round(players.length / 4))
  const gate = useLoaderGate(!!view || !!loadError, !!loadError)

  if (!organiser) {
    return (
      <Screen eyebrow="kejar. · organise">
        <p className="muted">This phone didn&apos;t create game {code}, so it can&apos;t run it.</p>
      </Screen>
    )
  }

  // Nothing to show before the first view: the full-size loader, then its exit (a load error shows at once).
  if (gate.show) return <FullLoader caption={`SABAR KEJAP, OPENING ${code.toUpperCase()}`} {...gate.loader} />
  if (view?.cancelled) return <Cancelled code={code} organiser />

  // The new-game setup's steps 4 and 5 stand in for the lobby: no join QR yet.
  const setup = new URLSearchParams(window.location.search).get('setup')
  if (setup === 'crew' || setup === 'pack') {
    return (
      <Screen eyebrow={`kejar. · game ${code}`}>
        {!view ? (
          <ErrorText>{loadError}</ErrorText>
        ) : setup === 'crew' ? (
          <CrewStep code={code} view={view} organiserToken={organiser.organiserToken} />
        ) : (
          <PackList code={code} view={view} refresh={refresh} />
        )}
      </Screen>
    )
  }

  return (
    <Screen eyebrow={`kejar. · game ${code}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="mono" style={{ fontSize: 44, letterSpacing: '0.12em' }}>
          {code}
        </h1>
        {view && <ModeBadge mode={view.settings.mode} />}
        {view && (
          <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }} disabled={busy} aria-busy={busyOn === 'mode' || undefined} onClick={changeMode}>
            <Busy busy={busyOn === 'mode'} label={`Switching to ${view.settings.mode === 'full' ? 'Core' : 'Full'}`} colour="var(--volt)" height={16}>Change</Busy>
          </button>
        )}
      </div>
      {view && (
        <div className="planned-start">
          <label className="eyebrow" htmlFor="planned-start">
            planned start
          </label>
          <input
            id="planned-start"
            type="time"
            className="input"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            onBlur={commitStart}
            onKeyDown={(e) => e.key === 'Enter' && commitStart()}
          />
          {view.settings.startsAt && (
            <>
              <span className="muted">{startsLabel(Date.parse(view.settings.startsAt), Date.now())}</span>
              <button
                type="button"
                className="home-link"
                disabled={busy}
                onClick={() => {
                  setStartText('')
                  void act('setStartTime', { startsAt: null })
                }}
              >
                clear
              </button>
            </>
          )}
        </div>
      )}
      {view && <AlertsOnPhone code={code} view={view} refresh={refresh} />}
      {view && <BeforeYouStart code={code} view={view} refresh={refresh} />}
      {view && <SetupMap view={view} />}
      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {qr && <img src={qr} alt="Join QR code" width={120} height={120} style={{ borderRadius: 10 }} />}
        <div>
          <p style={{ fontWeight: 600 }}>Scan to join</p>
          <p className="muted" style={{ wordBreak: 'break-all' }}>
            {joinUrl}
          </p>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} disabled={busy} aria-busy={busyOn === 'invite' || undefined} onClick={inviteMarshal}>
          <Busy busy={busyOn === 'invite'} label="Inviting marshal" colour="var(--volt)">Invite a marshal</Busy>
        </button>
        {marshalInviteUrl && (
          <p className="muted" style={{ wordBreak: 'break-all' }}>
            {marshalInviteUrl}
          </p>
        )}
      </div>

      <p className="eyebrow">Players ({players.length})</p>
      {players.length > 0 && (
        <div>
          <p className="mono">{`${runners} Dikejar · ${chasers} Kejar · ${players.length - runners - chasers} to pick`}</p>
          <p className="muted">{`About 1 Kejar for every 4 players: ${suggested} for ${players.length} players.`}</p>
        </div>
      )}
      <table>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="mono">{p.role === 'runner' ? tagText(p.tag_id) : ''}</td>
              <td style={{ textAlign: 'right' }}>
                <Pills<Side>
                  label={p.name}
                  value={p.role === 'runner' || p.role === 'chaser' ? p.role : null}
                  disabled={busy}
                  busyValue={busyOn?.startsWith(`role:${p.id}:`) ? (busyOn.slice(`role:${p.id}:`.length) as Side) : null}
                  options={SIDES}
                  onChange={(role) => act('setRoles', { roles: { [p.id]: role } }, `role:${p.id}:${role}`)}
                />
              </td>
            </tr>
          ))}
          {marshals.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td />
              <td className="eyebrow" style={{ textAlign: 'right' }}>
                Marshal
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ErrorText>{error || loadError}</ErrorText>
      <button className="btn" disabled={busy} aria-busy={busyOn === 'start' || undefined} onClick={() => act('start', {}, 'start')}>
        <Busy busy={busyOn === 'start'} label="Starting game">Start game</Busy>
      </button>
      <CancelGame code={code} onCancelled={refresh} />
    </Screen>
  )
}
