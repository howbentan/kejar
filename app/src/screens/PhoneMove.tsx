import { useEffect, useRef, useState } from 'react'
import { call } from '../game/api'
import { saveSession } from '../game/session'
import { ErrorText, Screen } from '../game/ui'

/** A one-time link from a marshal: moves this player onto this phone. The old phone stops working. */
export default function PhoneMove({ code, token }: { code: string; token: string }) {
  const [error, setError] = useState('')
  // A link works once, so a double run of the effect must not redeem it twice.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    call<{ token: string; playerId: string }>('redeemPhoneMove', { code, inviteToken: token }).then(
      ({ token: playerToken }) => {
        saveSession(localStorage, code, { token: playerToken })
        window.location.assign(`/g/${code}`)
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [code, token])

  return (
    <Screen eyebrow={`kejar. · new phone ${code}`}>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>{error ? 'Could not move you' : 'Moving you to this phone'}</h1>
      {error ? <ErrorText>{error}</ErrorText> : <p className="muted">One moment.</p>}
    </Screen>
  )
}
