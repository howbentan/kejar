import { useEffect, useState, type CSSProperties } from 'react'
import { call } from '../game/api'
import { loadOrganiserSession } from '../game/organiserSession'
import { type Slip, unusedCounts } from '../game/slips'
import { ErrorText, Screen } from '../game/ui'
import { FullLoader } from '../game/Runner'
import { useLoaderGate } from '../game/useLoaderGate'

const openSheet = () => window.open('/print/tags', '_blank')
const openSlips = () => window.open('/print/slips', '_blank')
/** At this many unused slips or fewer on a side, the organiser is nudged to print more. */
const LOW_SLIPS = 2

const pill: CSSProperties = {
  marginLeft: 'auto',
  flex: 'none',
  font: '500 11px var(--mono)',
  letterSpacing: '0.1em',
  border: '1px solid var(--hair)',
  borderRadius: 999,
  padding: '6px 12px',
  minHeight: 40,
  background: 'transparent',
  color: 'var(--white)',
  cursor: 'pointer',
}
const rowStyle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--hair)' }

/** Print once: the kit that never changes between games, and the Tupperware slips each game uses up. */
export default function YourKit() {
  const organiser = loadOrganiserSession(localStorage)
  const organiserToken = organiser?.organiserToken
  const [slips, setSlips] = useState<Slip[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setSlips(await call<Slip[]>('listSlips', { organiserToken }))
  }

  useEffect(() => {
    if (organiserToken) load().catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organiserToken])
  const gate = useLoaderGate(slips !== null || !!error, !!error)

  if (!organiser) {
    return (
      <Screen eyebrow="kejar. · your kit">
        <p className="muted">You need an invite link from another organiser to see your kit on this phone.</p>
      </Screen>
    )
  }

  // Nothing to show until the slips arrive: the full-size loader, then its exit (a load error shows at once).
  if (gate.show) return <FullLoader caption="TUNGGU JAP, PACKING YOUR KIT" {...gate.loader} />

  async function makeSheet() {
    setBusy(true)
    setError('')
    try {
      await call('makeSlipSheet', { organiserToken })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const counts = unusedCounts(slips ?? [])
  const low = slips !== null && (counts.dikejar <= LOW_SLIPS || counts.kejar <= LOW_SLIPS)

  return (
    <Screen eyebrow="ORGANISER · YOUR KIT">
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.04em' }}>Print once.</h1>
      <p className="muted">Laminate it and reuse it every game.</p>

      <p className="eyebrow">EVERY GAME</p>
      <div>
        {['Armbands #01–#40', 'Station cards 1–8', 'Penjara card'].map((label) => (
          <div key={label} data-testid="kit-row" style={{ ...rowStyle, alignItems: 'center' }}>
            <div style={{ fontSize: 15 }}>{label}</div>
            <button type="button" style={pill} onClick={openSheet}>
              PRINT
            </button>
          </div>
        ))}
      </div>

      <p className="eyebrow">TUPPERWARE SLIPS</p>
      <ErrorText>{error}</ErrorText>
      {slips && (
        <div style={{ ...rowStyle, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <b>{`Dikejar: ${counts.dikejar} unused · Kejar: ${counts.kejar} unused`}</b>
            {low && (
              <small style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>Print a new slip sheet</small>
            )}
          </div>
          <button type="button" style={pill} onClick={openSlips}>
            Print slips
          </button>
          <button type="button" style={{ ...pill, marginLeft: 0 }} disabled={busy} onClick={() => void makeSheet()}>
            Make a new sheet
          </button>
        </div>
      )}
      <a className="muted" href="/host/new" style={{ textDecoration: 'underline' }}>
        Back to new game
      </a>
    </Screen>
  )
}
