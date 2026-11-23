import { useEffect, useState } from 'react'
import { call } from '../game/api'
import { loadName, saveName } from '../game/nameMemory'
import { loadSession, saveSession } from '../game/session'
import { loadOrganiserSession } from '../game/organiserSession'
import { ErrorText, Screen } from '../game/ui'
import { Busy } from '../game/Runner'

export default function MarshalRedeem({ code, token }: { code: string; token: string }) {
  const [name, setName] = useState(() => loadName(localStorage))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // One phone, one place in a game: a phone that already joined this game (as a player or marshal) can't take the
  // marshal link too, or its two roles would fight over one session.
  const [joined, setJoined] = useState(() => !!loadSession(localStorage, code).token)
  // The organiser's own phone counts as joined: it already runs the game.
  useEffect(() => {
    const organiser = loadOrganiserSession(localStorage)
    if (joined || !organiser) return
    call('state', { code, organiserToken: organiser.organiserToken }).then(
      () => setJoined(true),
      () => undefined,
    )
  }, [code, joined])

  async function redeem() {
    setBusy(true)
    setError('')
    try {
      const { token: playerToken } = await call<{ token: string }>('redeemMarshalInvite', {
        code,
        inviteToken: token,
        name: name.trim(),
        token: loadSession(localStorage, code).token,
      })
      saveSession(localStorage, code, { token: playerToken })
      saveName(localStorage, name)
      window.location.assign(`/g/${code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Screen eyebrow={`kejar. · marshal ${code}`}>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>You&apos;re marshal for this game</h1>
      {joined ? (
        <>
          <p className="muted">{`This phone has already joined game ${code}. Open the marshal link on another phone, so each phone has one role.`}</p>
          <a className="btn" href={`/g/${code}`}>
            Back to the game
          </a>
        </>
      ) : (
        <>
      <label className="eyebrow" htmlFor="name">
        Your name
      </label>
      <input id="name" className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={!name.trim() || busy} aria-busy={busy || undefined} onClick={redeem}>
        <Busy busy={busy} label="Joining as marshal">Join as marshal</Busy>
      </button>
        </>
      )}
    </Screen>
  )
}
