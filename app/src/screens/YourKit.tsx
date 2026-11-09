import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { call } from '../game/api'
import { loadOrganiserSession } from '../game/organiserSession'
import { ErrorText, Screen } from '../game/ui'

type Legendary = 'dato' | 'bomoh'
interface KitCard {
  legendary: Legendary
  letter: string
  state: 'ready' | 'retired' | 'printing'
  foundAt: string | null
  inGame: boolean
}
interface CardId {
  organiserToken: string | undefined
  legendary: Legendary
  letter: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayMonth = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
const cardName = (c: KitCard) => `${c.legendary === 'dato' ? 'Yellow' : 'Purple'} ${c.letter}`
const keyOf = (c: KitCard) => `${c.legendary}${c.letter}`
const openSheet = () => window.open('/print/tags', '_blank')

const pill: CSSProperties = {
  marginLeft: 'auto',
  flex: 'none',
  font: '500 11px var(--mono)',
  letterSpacing: '0.1em',
  border: '1px solid var(--hair)',
  borderRadius: 999,
  padding: '6px 10px',
  background: 'transparent',
  color: 'var(--white)',
  cursor: 'pointer',
}
const rowStyle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--hair)' }
const linkBtn: CSSProperties = { background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }

/** Print once: the kit that never changes between games, and the organiser's secret card sets. */
export default function YourKit() {
  const organiser = loadOrganiserSession(localStorage)
  const organiserToken = organiser?.organiserToken
  const [cards, setCards] = useState<KitCard[] | null>(null)
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  async function load() {
    setCards(await call<KitCard[]>('listSecretCards', { organiserToken }))
  }

  useEffect(() => {
    if (organiserToken) load().catch((e) => setError(e instanceof Error ? e.message : String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organiserToken])

  if (!organiser) {
    return (
      <Screen eyebrow="kejar. · your kit">
        <p className="muted">You need an invite link from another organiser to see your kit on this phone.</p>
      </Screen>
    )
  }

  async function act(c: KitCard, fn: (id: CardId) => Promise<void>) {
    const k = keyOf(c)
    setBusy(k)
    setErrors((e) => ({ ...e, [k]: '' }))
    try {
      await fn({ organiserToken, legendary: c.legendary, letter: c.letter })
      await load()
    } catch (e) {
      setErrors((x) => ({ ...x, [k]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy('')
    }
  }

  const printCard = async (id: CardId) => {
    const { code } = await call<{ code: string }>('secretCardCode', id)
    window.open(`/print/card#${encodeURIComponent(code)}`, '_blank')
  }

  return (
    <Screen eyebrow="ORGANISER · YOUR KIT">
      <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.04em' }}>Print once.</h1>
      <p className="muted">Laminate it and reuse it every game.</p>

      <p className="eyebrow">EVERY GAME</p>
      <div>
        {['Armbands #01–#40', 'Station cards 1–8', 'Penjara card'].map((label) => (
          <div key={label} data-testid="kit-row" style={rowStyle}>
            <div style={{ fontSize: 15 }}>{label}</div>
            <button type="button" style={pill} onClick={openSheet}>
              PRINT
            </button>
          </div>
        ))}
      </div>

      <p className="eyebrow">SECRET CARDS · FULL MODE</p>
      <ErrorText>{error}</ErrorText>
      <div>
        {(cards ?? []).map((c) => {
          const k = keyOf(c)
          const colour = c.legendary === 'dato' ? 'var(--legendary-2)' : 'var(--bomoh-2)'
          const retire = (
            <>
              {' · '}
              <button type="button" style={linkBtn} disabled={busy === k} onClick={() => void act(c, async (id) => void (await call('retireSecretCard', id)))}>
                Retire
              </button>
            </>
          )
          let status: ReactNode
          let action: { label: string; run: () => void }
          if (c.state === 'retired') {
            status = c.foundAt ? `Found on ${dayMonth(c.foundAt)} · retired` : 'Retired'
            action = {
              label: 'REPRINT',
              run: () =>
                void act(c, async (id) => {
                  await call('reprintSecretCard', id)
                  await printCard(id)
                }),
            }
          } else if (c.state === 'printing') {
            status = 'New code · print it, then confirm'
            action = { label: "I'VE PRINTED IT", run: () => void act(c, async (id) => void (await call('confirmSecretCardPrinted', id))) }
          } else {
            status = (
              <>
                {c.inGame ? "In today's game" : 'Ready'}
                {retire}
              </>
            )
            action = { label: 'PRINT', run: () => void act(c, printCard) }
          }
          return (
            <div key={k} data-testid="card-row" style={{ ...rowStyle, flexWrap: 'wrap' }}>
              <div>
                <b style={{ color: colour }}>{cardName(c)}</b>
                <small className="muted" style={{ display: 'block', fontSize: 12 }}>
                  {status}
                </small>
              </div>
              <button type="button" style={pill} disabled={busy === k} onClick={action.run}>
                {action.label}
              </button>
              {errors[k] && (
                <p role="alert" style={{ flexBasis: '100%', fontSize: 13, fontWeight: 600 }}>
                  {errors[k]}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <a className="muted" href="/host/new" style={{ textDecoration: 'underline' }}>
        Back to new game
      </a>
    </Screen>
  )
}
