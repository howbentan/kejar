import { useState } from 'react'
import { LEGENDARY_KINDS } from '../../shared/legendaries.js'
import { DEFAULT_SETTINGS } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { cardIn, REPRINT_LINE, stashIn, type Legendary } from './cardNotice'
import { currentCoords } from './here'
import GameMap, { type SecretTone } from './Map'
import { printCardUrl } from './printLinks'
import { ErrorText } from './ui'

/** Who is dropping: the organiser's token, or a marshal's player token. */
export type SetupCredentials = { organiserToken: string } | { token: string }

/**
 * How each legendary's hidden card is shown in Organiser tools: by colour only, never by name, since the lobby is the
 * screen players look at (the reprint line is the one exception, as before). Dato Seri's keeps its plain ★ wording.
 */
const LOOK: Record<Legendary, { eyebrow: string; card: string; tone: SecretTone; colour?: string; button: string; drop: string }> = {
  dato: { eyebrow: '★ Hidden card', card: '★ card', tone: 'yellow', button: 'btn-legendary', drop: 'dropDatoSeri' },
  ring: { eyebrow: '★ Orange card', card: 'orange card', tone: 'orange', colour: 'var(--ring-2)', button: 'btn-ring', drop: 'dropRing' },
  bomoh: { eyebrow: '★ Purple card', card: 'purple card', tone: 'purple', colour: 'var(--bomoh-2)', button: 'btn-bomoh', drop: 'dropBomoh' },
  hijau: { eyebrow: '★ Green card', card: 'green card', tone: 'green', colour: 'var(--hijau-2)', button: 'btn-hijau', drop: 'dropHijau' },
}

/**
 * Dato Seri's hidden stash, for the organiser only in a Full lobby (jail design §4b): print the yellow card assigned
 * to this game (ruling R15), hide it, stand by it and save the spot. Dropping again before the start moves it. The lobby
 * is the screen organisers show to players, so it stays behind a closed, neutrally worded toggle: nothing says a
 * hidden card exists, names it or shows the pin until it's opened (rules doc §9b). No marker scribble here (marshal screen).
 */
export function HiddenCard({
  view,
  code,
  credentials,
  refresh,
  legendary = 'dato',
  onHide,
  inTools = false,
}: {
  view: View
  code: string
  credentials: SetupCredentials
  refresh: () => void
  legendary?: Legendary
  /** Inside `OrganiserTools`: the card is shown open, with a Hide button only when this is given. */
  onHide?: () => void
  /** Set by `OrganiserTools`, which owns the one toggle. */
  inTools?: boolean
}) {
  const [ownOpen, setOpen] = useState(false)
  const open = inTools || ownOpen
  const hide = inTools ? onHide : () => setOpen(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // The stash is only in the organiser's own view (undefined for players and marshals), so nobody else sees this.
  const look = LOOK[legendary]
  const stash = stashIn(view, legendary)
  const card = cardIn(view, legendary)
  if (!showsHiddenCard(view, legendary)) return null
  async function drop() {
    setBusy(true)
    setError('')
    try {
      const here = await currentCoords()
      if (typeof here.lat !== 'number' || typeof here.lng !== 'number') return setError('Turn on location, then stand by the card and try again')
      await call(look.drop, { code, ...credentials, ...here })
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
        <p className="eyebrow settle-eyebrow" style={look.colour ? { color: look.colour } : undefined}>
          {look.eyebrow}
        </p>
        {hide && (
          <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={hide}>
            Hide
          </button>
        )}
      </div>
      <p className="muted">
        {stash
          ? `The ${look.card} is hidden at the ${look.tone} pin. Players only see a ? zone round it. Drop again to move it.`
          : `Print the ${look.card}, hide it somewhere in the play area, stand next to it, then drop it here. Players only see a ? zone round it.`}
      </p>
      {/* Wanted, but no card was free yet (ruling R9): the full wording stays behind this organiser-only toggle. */}
      {card === null && view.settings.legendaries?.[legendary] === 'stash' && <p className="muted">{REPRINT_LINE[legendary]}</p>}
      {card && (
        // The code goes after #, so it never reaches the server or its logs. Only this game's card claims.
        <a className="muted" href={printCardUrl(legendary, card.code)} target="_blank" rel="noopener noreferrer">
          {`Print the ${look.card}`}
        </a>
      )}
      <GameMap arena={view.arena} dots={[]} height={200} stash={stash ? { lat: stash.lat, lng: stash.lng } : null} stashTone={look.tone} />
      <button type="button" className={`btn ${look.button}`} style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={drop}>
        {`Drop the ${look.card} here`}
      </button>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

/**
 * Whether a legendary's hidden card belongs in this view: the organiser's own, in a Full lobby, with it the one the
 * app picked for its side. A stash is null (not undefined) in the organiser's view whenever it's off, so the setting
 * decides; an organiser view with no legendaries at all reads the defaults (Dato Seri on).
 */
function showsHiddenCard(view: View, legendary: Legendary): boolean {
  if (view.settings.mode !== 'full' || view.phase !== 'lobby' || stashIn(view, legendary) === undefined) return false
  return ({ ...DEFAULT_SETTINGS.legendaries, ...view.settings.legendaries })[legendary] === 'stash'
}

/**
 * The lobby's one closed "Organiser tools" toggle, holding every hidden card this game has (M11). It is the same
 * single button whether one legendary is on or both, so the open screen's button count gives nothing away.
 */
export function OrganiserTools(props: { view: View; code: string; credentials: SetupCredentials; refresh: () => void }) {
  const [open, setOpen] = useState(false)
  const shown = LEGENDARY_KINDS.filter((l) => showsHiddenCard(props.view, l))
  if (shown.length === 0) return null
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
        Organiser tools
      </button>
    )
  }
  return (
    <>
      {shown.map((l, i) => (
        <HiddenCard key={l} {...props} legendary={l} inTools onHide={i === 0 ? () => setOpen(false) : undefined} />
      ))}
    </>
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
