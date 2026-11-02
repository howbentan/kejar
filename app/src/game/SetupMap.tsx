import { useState } from 'react'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { currentCoords } from './here'
import GameMap from './Map'
import { ErrorText } from './ui'

/** Who is dropping: the organiser's token, or a marshal's player token. */
export type SetupCredentials = { organiserToken: string } | { token: string }

/**
 * Dato Seri's hidden stash, for the organiser and marshals in a Full lobby (jail design §4b): stand by the hidden
 * ★ card and save the spot. Dropping again before the start moves it. No marker scribble here (marshal screen).
 */
function DatoDrop({ code, credentials, refresh, dropped }: { code: string; credentials: SetupCredentials; refresh: () => void; dropped: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function drop() {
    setBusy(true)
    setError('')
    try {
      const here = await currentCoords()
      if (typeof here.lat !== 'number' || typeof here.lng !== 'number') return setError('Turn on location, then stand by the card and try again')
      await call('dropDatoSeri', { code, ...credentials, ...here })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="eyebrow settle-eyebrow">★ Dato Seri</p>
      <p className="muted">
        {dropped
          ? 'Dato Seri is hidden at the yellow pin. Players only see a ? zone round it. Drop again to move it.'
          : 'Hide the ★ card somewhere in the play area, stand next to it, then drop it here. Players only see a ? zone round it.'}
      </p>
      <button type="button" className="btn btn-legendary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={drop}>
        Drop Dato Seri here
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

/** Before the game: where marshals put each station's QR card, the jail and the start (Plan 4b §5.6). */
export default function SetupMap({
  view,
  code,
  credentials,
  refresh,
}: {
  view: View
  /** With these, the organiser or a marshal can drop Dato Seri's stash in a Full lobby. */
  code?: string
  credentials?: SetupCredentials | null
  refresh?: () => void
}) {
  const stations = view.stations ?? []
  // datoStash is only in the organiser's and marshals' views (undefined for players).
  const stash = view.datoStash ?? null
  const canDrop = view.settings.mode === 'full' && view.phase === 'lobby' && view.datoStash !== undefined && !!code && !!credentials
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="eyebrow">Setup: where things go</p>
      <GameMap arena={view.arena} dots={[]} stations={stations} height={260} stash={stash ? { lat: stash.lat, lng: stash.lng } : null} />
      <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
        {stations.map((s) => (
          <li key={s.n}>{`Station ${s.n}`}</li>
        ))}
        <li>Penjara</li>
        <li>Start</li>
        {stash && <li>Dato Seri (yellow pin)</li>}
      </ul>
      {canDrop && <DatoDrop code={code!} credentials={credentials!} refresh={refresh ?? (() => {})} dropped={!!stash} />}
    </div>
  )
}
