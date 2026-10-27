import { useState } from 'react'
import { call } from '../game/api'
import { saveSession } from '../game/session'
import { ErrorText, Screen } from '../game/ui'

export default function MarshalRedeem({ code, token }: { code: string; token: string }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function redeem() {
    setBusy(true)
    setError('')
    try {
      const { token: playerToken } = await call<{ token: string }>('redeemMarshalInvite', {
        code,
        inviteToken: token,
        name: name.trim(),
      })
      saveSession(localStorage, code, { token: playerToken })
      window.location.assign(`/g/${code}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Screen eyebrow={`kejar. · marshal ${code}`}>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>You&apos;re marshal for this game</h1>
      <label className="eyebrow" htmlFor="name">
        Your name
      </label>
      <input id="name" className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={!name.trim() || busy} onClick={redeem}>
        {busy ? 'Joining…' : 'Join as marshal'}
      </button>
    </Screen>
  )
}
