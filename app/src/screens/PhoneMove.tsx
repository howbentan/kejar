import { useEffect, useRef, useState } from 'react'
import { call } from '../game/api'
import { loadSession, saveSession } from '../game/session'
import { ErrorText, Screen } from '../game/ui'
import { FullLoader } from '../game/Runner'

/** A one-time link from a marshal: moves this player onto this phone. The old phone stops working. */
export default function PhoneMove({ code, token }: { code: string; token: string }) {
  const [error, setError] = useState('')
  // A phone that is already in this game (maybe as someone else) asks before its session is replaced.
  const [asking, setAsking] = useState(() => !!loadSession(localStorage, code).token)
  // A link works once, so a double run of the effect must not redeem it twice.
  const started = useRef(false)

  useEffect(() => {
    if (asking || started.current) return
    started.current = true
    call<{ token: string; playerId: string }>('redeemPhoneMove', { code, inviteToken: token }).then(
      ({ token: playerToken }) => {
        saveSession(localStorage, code, { token: playerToken })
        window.location.assign(`/g/${code}`)
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [asking, code, token])

  if (asking) {
    return (
      <Screen eyebrow={`kejar. · new phone ${code}`}>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>New phone</h1>
        <p>This phone is already in this game. Switch it to the moved player?</p>
        <button type="button" className="btn" onClick={() => setAsking(false)}>
          Switch
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.location.assign(`/g/${code}`)}>
          Keep this one
        </button>
      </Screen>
    )
  }

  // While moving, the full-size loader; an error shows as before.
  if (!error) return <FullLoader caption="PINDAH RUMAH, MOVING YOU OVER" />

  return (
    <Screen eyebrow={`kejar. · new phone ${code}`}>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>Could not move you</h1>
      <ErrorText>{error}</ErrorText>
    </Screen>
  )
}
