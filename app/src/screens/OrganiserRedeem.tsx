import { useState } from 'react'
import { call } from '../game/api'
import { saveOrganiserSession } from '../game/organiserSession'
import { ErrorText, Screen } from '../game/ui'

export default function OrganiserRedeem({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function redeem() {
    setBusy(true)
    setError('')
    try {
      const { organiserToken, name } = await call<{ organiserToken: string; name: string }>('redeemOrganiserInvite', {
        inviteToken: token,
      })
      saveOrganiserSession(localStorage, { organiserToken, name })
      window.location.assign('/host/new')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Screen eyebrow="kejar. · organiser">
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>Sign in as organiser</h1>
      <p className="muted">This link signs this phone in to create and manage games. It only works once.</p>
      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={busy} onClick={redeem}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </Screen>
  )
}
