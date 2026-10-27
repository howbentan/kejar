import { useEffect, useState } from 'react'
import type { Role } from '../../shared/types.js'
import { call } from '../game/api'
import { AlertsOnPhone } from '../game/MarshalTools'
import SetupMap from '../game/SetupMap'
import { loadOrganiserSession } from '../game/organiserSession'
import { qrDataUrl } from '../game/qr'
import { ErrorText, Pills, Screen, tagText } from '../game/ui'
import { useGameState } from '../game/useGameState'

export default function HostLobby({ code }: { code: string }) {
  const organiser = loadOrganiserSession(localStorage)
  const { view, error: loadError, refresh } = useGameState(code, { sendLocation: 'never' })
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [marshalInviteUrl, setMarshalInviteUrl] = useState('')
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

  if (!organiser) {
    return (
      <Screen eyebrow="kejar. · organise">
        <p className="muted">This phone didn&apos;t create game {code}, so it can&apos;t run it.</p>
      </Screen>
    )
  }

  return (
    <Screen eyebrow={`kejar. · game ${code}`}>
      <h1 className="mono" style={{ fontSize: 44, letterSpacing: '0.12em' }}>
        {code}
      </h1>
      {view && <AlertsOnPhone code={code} view={view} refresh={refresh} />}
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
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={inviteMarshal}>
          Invite a marshal
        </button>
        {marshalInviteUrl && (
          <p className="muted" style={{ wordBreak: 'break-all' }}>
            {marshalInviteUrl}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="eyebrow">Players ({view?.roster.length ?? 0})</p>
        <button className="btn btn-ghost" style={{ padding: '8px 14px' }} disabled={busy} onClick={() => act('setRoles', { shuffle: true })}>
          Shuffle roles
        </button>
      </div>
      <table>
        <tbody>
          {view?.roster.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="mono">{p.role === 'runner' ? tagText(p.tag_id) : ''}</td>
              <td style={{ textAlign: 'right' }}>
                <Pills<Role>
                  label={p.name}
                  value={p.role === 'marshal' ? 'marshal' : null}
                  disabled={busy}
                  options={[{ value: 'marshal', text: 'Marshal' }]}
                  onChange={(role) => act('setRoles', { roles: { [p.id]: role } })}
                />
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
