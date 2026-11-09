import { useEffect, useRef, useState, type ReactNode } from 'react'
import { crewFor } from '../../shared/kit.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import SetupSteps from './SetupSteps'
import { ErrorText } from './ui'

interface Row {
  key: number
  title: string
  note: string
  link?: string
  sent?: boolean
  error?: string
}

const pill = { marginLeft: 'auto', fontFamily: 'var(--mono, monospace)', fontSize: 9, letterSpacing: '0.1em' } as const
const ADDED = { title: 'Marshal', note: 'Roams a side of the park' }

const cacheKey = (code: string) => `kejar.crew.${code}`
function readCache(code: string): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(cacheKey(code)) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}
function writeCache(code: string, key: number, link: string) {
  try {
    sessionStorage.setItem(cacheKey(code), JSON.stringify({ ...readCache(code), [key]: link }))
  } catch {
    // Private mode: the invites just get made again next visit.
  }
}

/**
 * Setup step 4: who helps on the day. The rows are only on screen; the invites are what gets saved. Each row's
 * invite is made as soon as the row exists, so a tap can call `navigator.share` straight away: iOS drops the share
 * if anything is awaited between the tap and the call.
 */
export default function CrewStep({ code, view, organiserToken }: { code: string; view: View; organiserToken: string }) {
  const band = view.settings.playersBand ?? 20
  const helpers = crewFor(band) - 1
  const [rows, setRows] = useState<Row[]>(() => {
    const cached = readCache(code)
    return [
      { key: 1, title: 'Helper at Penjara', note: 'Marshal · plays Pak Pulis', link: cached[1] },
      ...Array.from({ length: helpers - 1 }, (_, i) => ({ key: i + 2, ...ADDED, link: cached[i + 2] })),
    ]
  })
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const requested = useRef(new Set<number>())
  const sharing = useRef(false)
  const initial = (view.me?.name ?? '').trim().charAt(0).toUpperCase() || 'Y'

  function invite(key: number) {
    if (requested.current.has(key)) return
    requested.current.add(key)
    call<{ inviteToken: string }>('createMarshalInvite', { code, organiserToken }).then(
      ({ inviteToken }) => {
        const link = `${window.location.origin}/m/${code}/${inviteToken}`
        writeCache(code, key, link)
        setRows((r) => r.map((x) => (x.key === key ? { ...x, link } : x)))
      },
      (e) => {
        requested.current.delete(key)
        setError(e instanceof Error ? e.message : String(e))
      },
    )
  }

  useEffect(() => {
    rows.filter((r) => r.link).forEach((r) => requested.current.add(r.key))
    rows.filter((r) => !r.link).forEach((r) => invite(r.key))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function add() {
    const key = Math.max(0, ...rows.map((x) => x.key)) + 1
    setRows((r) => [...r, { key, ...ADDED }])
    invite(key)
  }

  const mark = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  /** Called straight from a tap: nothing is awaited before `navigator.share`. */
  function shareRow(row: Row) {
    if (!row.link || sharing.current) return
    setError('')
    if (typeof navigator.share !== 'function') {
      void navigator.clipboard.writeText(row.link)
      setCopied(true)
      mark(row.key, { sent: true })
      return
    }
    sharing.current = true
    navigator.share({ text: `Join my Kejar crew as a marshal: ${row.link}` }).then(
      () => mark(row.key, { sent: true, error: undefined }),
      (e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) mark(row.key, { error: e instanceof Error ? e.message : String(e) })
      },
    ).finally(() => {
      sharing.current = false
    })
  }

  const nextUnsent = rows.find((r) => r.link && !r.sent)

  function sendAll() {
    if (typeof navigator.share !== 'function') {
      const ready = rows.filter((r) => r.link)
      if (ready.length === 0) return
      void navigator.clipboard.writeText(ready.map((r) => r.link).join('\n'))
      setCopied(true)
      setRows((r) => r.map((x) => (x.link ? { ...x, sent: true } : x)))
      return
    }
    if (nextUnsent) shareRow(nextUnsent)
  }

  function next() {
    const notice = new URLSearchParams(window.location.search).get('notice')
    window.location.assign(`/host/${code}?setup=pack${notice === 'dato' ? '&notice=dato' : ''}`)
  }

  const person = (av: string, bg: string, fg: string, title: string, note: string, status: ReactNode, key?: number, errorText?: string) => (
    <div key={key} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 14, flexWrap: 'wrap' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, flex: 'none', background: bg, color: fg }}>{av}</div>
      <div>
        <b style={{ fontSize: 13.5 }}>{title}</b>
        <small style={{ display: 'block', fontSize: 11, opacity: 0.65 }}>{note}</small>
      </div>
      {status}
      {errorText && <p className="muted" style={{ flexBasis: '100%' }}>{errorText}</p>}
    </div>
  )

  return (
    <>
      <SetupSteps step={4} />
      <h1>Your crew.</h1>
      <p className="muted">{`You plus ${helpers} ${helpers === 1 ? 'helper' : 'helpers'} for up to ${band} players.`}</p>
      {person(initial, '#F28C28', '#0A0A0B', 'You', 'Roaming marshal · gets every SOS', <span style={{ ...pill, color: 'var(--volt)' }}>READY</span>)}
      {rows.map((r) =>
        person(
          '?',
          '#333',
          '#F5F5F0',
          r.title,
          r.note,
          <button
            type="button"
            disabled={!r.link}
            onClick={() => shareRow(r)}
            style={{ ...pill, background: 'none', border: 0, padding: 4, cursor: 'pointer', color: r.sent ? 'var(--volt)' : 'inherit', opacity: r.sent ? 1 : 0.7 }}
          >
            {!r.link ? 'Creating…' : r.sent ? 'SENT' : 'INVITE'}
          </button>,
          r.key,
          r.error,
        ),
      )}
      <button
        type="button"
        className="muted"
        style={{ background: 'none', border: '1px dashed var(--hair)', borderRadius: 14, padding: 10, textAlign: 'center', cursor: 'pointer' }}
        onClick={add}
      >
        + Add a marshal
      </button>
      {copied && <p className="muted">Links copied.</p>}
      <ErrorText>{error}</ErrorText>
      <button className="btn" disabled={!nextUnsent && !(typeof navigator.share !== 'function' && rows.some((r) => r.link))} onClick={sendAll}>
        Send invite links
      </button>
      <button className="btn btn-ghost" onClick={next}>
        Next
      </button>
    </>
  )
}
