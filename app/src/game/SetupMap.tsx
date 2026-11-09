import { useState } from 'react'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { currentCoords } from './here'
import GameMap from './Map'
import { ErrorText } from './ui'

/** Who is dropping: the organiser's token, or a marshal's player token. */
export type SetupCredentials = { organiserToken: string } | { token: string }

/**
 * Dato Seri's hidden stash, for the organiser only in a Full lobby (jail design §4b): print the yellow card assigned
 * to this game (ruling R15), hide it, stand by it and save the spot. Dropping again before the start moves it. The lobby
 * is the screen organisers show to players, so it stays behind a closed, neutrally worded toggle: nothing says a
 * hidden card exists, names it or shows the pin until it's opened (rules doc §9b). No marker scribble here (marshal screen).
 */
export function HiddenCard({ view, code, credentials, refresh }: { view: View; code: string; credentials: SetupCredentials; refresh: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // datoStash is only in the organiser's own view (undefined for players and marshals), so nobody else sees this.
  if (view.settings.mode !== 'full' || view.phase !== 'lobby' || view.datoStash === undefined) return null
  const stash = view.datoStash
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
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        Organiser tools
      </button>
    )
  }
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="eyebrow settle-eyebrow">★ Hidden card</p>
        <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
      <p className="muted">
        {stash
          ? 'The ★ card is hidden at the yellow pin. Players only see a ? zone round it. Drop again to move it.'
          : 'Print the ★ card, hide it somewhere in the play area, stand next to it, then drop it here. Players only see a ? zone round it.'}
      </p>
      {view.datoCard && (
        // The code goes after #, so it never reaches the server or its logs. Only this game's card claims.
        <a className="muted" href={`/print/card#${encodeURIComponent(view.datoCard.code)}`} target="_blank" rel="noopener noreferrer">
          Print the ★ card
        </a>
      )}
      <GameMap arena={view.arena} dots={[]} height={200} stash={stash ? { lat: stash.lat, lng: stash.lng } : null} />
      <button type="button" className="btn btn-legendary" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={drop}>
        Drop the ★ card here
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

/** Before the game: where marshals put each station's QR card, the jail and the start (Plan 4b §5.6). */
export default function SetupMap({ view }: { view: View }) {
  const stations = view.stations ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="eyebrow">Setup: where things go</p>
      <GameMap arena={view.arena} dots={[]} stations={stations} height={260} />
      <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
        {stations.map((s) => (
          <li key={s.n}>{`Station ${s.n}`}</li>
        ))}
        <li>Penjara</li>
        <li>Start</li>
      </ul>
    </div>
  )
}
