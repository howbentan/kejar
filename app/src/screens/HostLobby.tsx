import { useEffect, useState } from 'react'
import type { Role } from '../../shared/types.js'
import { call } from '../game/api'
import BeforeYouStart from '../game/BeforeYouStart'
import CrewStep from '../game/CrewStep'
import { AlertsOnPhone } from '../game/MarshalTools'
import PackList from '../game/PackList'
import SetupMap, { HiddenCard } from '../game/SetupMap'
import { loadOrganiserSession } from '../game/organiserSession'
import { qrDataUrl } from '../game/qr'
import { ErrorText, ModeBadge, Pills, Screen, tagText } from '../game/ui'
import { useGameState } from '../game/useGameState'

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
  const [marshalInviteUrl, setMarshalInviteUrl] = useState('')
  const [notice, setNotice] = useState('')
  const joinUrl = `${window.location.origin}/join/${code}`

  useEffect(() => {
    void qrDataUrl(joinUrl).then(setQr, () => setQr(''))
  }, [joinUrl])

  useEffect(() => {
    if (view && view.phase !== 'lobby') window.location.assign(`/g/${code}`)
  }, [view, code])

  async function act(action: string, body: object) {
    setBusy(true)
    setError('')
    try {
      await call(action, { code, organiserToken: organiser!.organiserToken, ...body })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Core and Full can change here, in the lobby, and never after the start.
  async function changeMode() {
    if (!view) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await call<{ notice?: string }>('setMode', {
        code,
        organiserToken: organiser!.organiserToken,
        mode: view.settings.mode === 'full' ? 'core' : 'full',
      })
      if (res?.notice) setNotice(res.notice)
      else if (view.settings.mode === 'full' && view.datoStash) setNotice('Dato Seri is off for this game. Pick up the yellow card.')
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function inviteMarshal() {
    setBusy(true)
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
    }
  }

  // Players are Dikejar or Kejar, picked here so kit goes on before the start; marshals come from invite links.
  const roster = view?.roster ?? []
  const players = roster.filter((p) => p.role !== 'marshal')
  const marshals = roster.filter((p) => p.role === 'marshal')
  const runners = players.filter((p) => p.role === 'runner').length
  const chasers = players.filter((p) => p.role === 'chaser').length
  const suggested = Math.max(1, Math.round(players.length / 4))

  if (!organiser) {
    return (
      <Screen eyebrow="kejar. · organise">
        <p className="muted">This phone didn&apos;t create game {code}, so it can&apos;t run it.</p>
      </Screen>
    )
  }

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
          <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }} disabled={busy} onClick={changeMode}>
            Change
          </button>
        )}
      </div>
      {notice && <p className="muted">{notice}</p>}
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
      {/* Below the join card, closed by default: players look at this screen to scan the join code. */}
      {view && <HiddenCard view={view} code={code} credentials={{ organiserToken: organiser.organiserToken }} refresh={refresh} />}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={inviteMarshal}>
          Invite a marshal
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
                  options={SIDES}
                  onChange={(role) => act('setRoles', { roles: { [p.id]: role } })}
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
      <button className="btn" disabled={busy} onClick={() => act('start', {})}>
        Start game
      </button>
    </Screen>
  )
}
