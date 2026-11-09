import { useState } from 'react'
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
}

const pill = { marginLeft: 'auto', fontFamily: 'var(--mono, monospace)', fontSize: 9, letterSpacing: '0.1em' } as const

/** Setup step 4: who helps on the day. The rows are only on screen; the invites are what gets saved. */
export default function CrewStep({ code, view, organiserToken }: { code: string; view: View; organiserToken: string }) {
  const band = view.settings.playersBand ?? 20
  const helpers = crewFor(band) - 1
  const [rows, setRows] = useState<Row[]>(() => [
    { key: 1, title: 'Helper at Penjara', note: 'Marshal · plays Pak Pulis' },
    ...Array.from({ length: helpers - 1 }, (_, i) => ({ key: i + 2, title: `Marshal ${i + 2}`, note: 'Marshal · helps on the day' })),
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const initial = (view.me?.name ?? '').trim().charAt(0).toUpperCase() || 'Y'

  function add() {
    setRows((r) => [...r, { key: Math.max(0, ...r.map((x) => x.key)) + 1, title: `Marshal ${r.length + 1}`, note: 'Marshal · helps on the day' }])
  }

  async function send() {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      // One personal link per row; a row that already has one keeps it, so sending twice never makes a spare.
      const made: Row[] = []
      for (const row of rows) {
        if (row.link) {
          made.push(row)
          continue
        }
        const { inviteToken } = await call<{ inviteToken: string }>('createMarshalInvite', { code, organiserToken })
        made.push({ ...row, link: `${window.location.origin}/m/${code}/${inviteToken}` })
      }
      setRows(made)
      const links = made.map((r) => r.link as string)
      if (typeof navigator.share === 'function') {
        for (const link of links) await navigator.share({ text: `Join my Kejar crew as a marshal: ${link}` })
      } else {
        await navigator.clipboard.writeText(links.join('\n'))
        setCopied(true)
      }
      setRows((r) => r.map((x) => ({ ...x, sent: true })))
    } catch (e) {
      // Closing the share sheet isn't a failure.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function next() {
    const notice = new URLSearchParams(window.location.search).get('notice')
    window.location.assign(`/host/${code}?setup=pack${notice === 'dato' ? '&notice=dato' : ''}`)
  }

  const person = (av: string, bg: string, fg: string, title: string, note: string, status: string, ok?: boolean, key?: number) => (
    <div key={key} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, flex: 'none', background: bg, color: fg }}>{av}</div>
      <div>
        <b style={{ fontSize: 13.5 }}>{title}</b>
        <small style={{ display: 'block', fontSize: 11, opacity: 0.65 }}>{note}</small>
      </div>
      <span style={{ ...pill, color: ok ? 'var(--volt)' : undefined, opacity: ok ? 1 : 0.7 }}>{status}</span>
    </div>
  )

  return (
    <>
      <SetupSteps step={4} />
      <h1>Your crew.</h1>
      <p className="muted">{`You plus ${helpers} ${helpers === 1 ? 'helper' : 'helpers'} for up to ${band} players.`}</p>
      {person(initial, '#F28C28', '#0A0A0B', 'You', 'Roaming marshal · gets every SOS', 'READY', true)}
      {rows.map((r) => person('?', '#333', '#F5F5F0', r.title, r.note, r.sent ? 'SENT' : 'INVITE', r.sent, r.key))}
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
      <button className="btn" disabled={busy} onClick={() => void send()}>
        Send invite links
      </button>
      <button className="btn btn-ghost" onClick={next}>
        Next
      </button>
    </>
  )
}
