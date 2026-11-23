import { useEffect, useRef, useState, type ReactNode } from 'react'
import { crewFor } from '../../shared/kit.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import SetupSteps from './SetupSteps'
import { ErrorText } from './ui'
import { MiniRunner } from './Runner'

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
  // Invite links (by token) a helper has already used: their rows say JOINED.
  const [joined, setJoined] = useState<Set<string>>(() => new Set())
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

  const tokenOf = (link: string) => link.slice(link.lastIndexOf('/') + 1)
  const isJoined = (r: Row) => !!r.link && joined.has(tokenOf(r.link))

  // While a sent invite is still waiting for its helper, ask every 5 s which links have been used.
  const waitingKey = rows
    .filter((r) => r.link && r.sent && !isJoined(r))
    .map((r) => tokenOf(r.link!))
    .join(',')
  useEffect(() => {
    if (!waitingKey) return
    const ask = () =>
      call<{ joined: string[] }>('crewStatus', { code, organiserToken, inviteTokens: waitingKey.split(',') }).then(
        (r) => {
          if (r.joined?.length) setJoined((j) => new Set([...j, ...r.joined]))
        },
        () => undefined,
      )
    void ask()
    const id = window.setInterval(() => void ask(), 5_000)
    return () => window.clearInterval(id)
  }, [waitingKey, code, organiserToken])

  /** Copies links where there is no share sheet; only a copy that worked counts as sent. */
  function copy(links: Row[]) {
    const failed = () => setError("Couldn't copy here. Open this step on your phone to share the links.")
    const write = navigator.clipboard?.writeText(links.map((r) => r.link).join('\n'))
    if (!write) return failed()
    write.then(() => {
      setCopied(true)
      setRows((r) => r.map((x) => (links.some((l) => l.key === x.key) ? { ...x, sent: true } : x)))
    }, failed)
  }

  /** Called straight from a tap: nothing is awaited before `navigator.share`. */
  function shareRow(row: Row) {
    if (!row.link || sharing.current) return
    setError('')
    if (typeof navigator.share !== 'function') return copy([row])
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

  // Still to send: made, not sent and not joined. Each tap on a phone shares the next one (a share sheet needs a tap
  // of its own); without a share sheet one tap copies them all.
  const unsent = rows.filter((r) => r.link && !r.sent && !isJoined(r))

  function sendAll() {
    setError('')
    if (typeof navigator.share !== 'function') {
      if (unsent.length) copy(unsent)
      return
    }
    if (unsent[0]) shareRow(unsent[0])
  }
  const sendLabel =
    unsent.length > 0
      ? `Send ${unsent.length} ${unsent.length === 1 ? 'invite' : 'invites'}`
      : rows.some((r) => !r.link)
        ? 'Making links'
        : 'All sent'

  function next() {
    window.location.assign(`/host/${code}?setup=pack`)
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
            aria-label={!r.link ? 'Creating invite link' : undefined}
            onClick={() => shareRow(r)}
            style={{ ...pill, background: 'none', border: 0, padding: 4, cursor: 'pointer', color: r.sent || isJoined(r) ? 'var(--volt)' : 'inherit', opacity: r.sent || isJoined(r) ? 1 : 0.7 }}
          >
            {!r.link ? <MiniRunner height={16} colour="currentColor" /> : isJoined(r) ? 'JOINED' : r.sent ? 'SENT' : 'INVITE'}
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
      <button className="btn" disabled={unsent.length === 0} onClick={sendAll}>
        {sendLabel}
      </button>
      <button className="btn btn-ghost" onClick={next}>
        Next
      </button>
    </>
  )
}
