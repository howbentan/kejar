import { useState } from 'react'
import { NOTE_MAX, REASON_LABEL, type ReportReason } from '../../shared/alerts.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { credentials } from './auth'
import { currentCoords } from './here'
import { ErrorText, Pills } from './ui'

const REASONS = (Object.keys(REASON_LABEL) as ReportReason[]).map((value) => ({ value, text: REASON_LABEL[value] }))

/** SOS and Report, fixed to the bottom of every runner and chaser screen (spec §5). */
export default function SafetyBar({ code, view }: { code: string; view: View }) {
  const [open, setOpen] = useState<'sos' | 'report' | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState<ReportReason>('unsafe')
  const [note, setNote] = useState('')

  async function send(action: 'sos' | 'report', extra: object, done: string) {
    setBusy(true)
    setError('')
    try {
      await call(action, { code, ...credentials(code), ...extra, ...(await currentCoords()) })
      setMessage(done)
      setOpen(null)
      setTarget('')
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (which: 'sos' | 'report') => {
    setMessage('')
    setError('')
    setOpen(open === which ? null : which)
  }

  return (
    <div className="safety-bar">
      {open === 'sos' && (
        <div className="card safety-sheet">
          <p style={{ fontWeight: 700 }}>Send SOS to marshals?</p>
          <p className="muted">They get your location straight away.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" disabled={busy} onClick={() => send('sos', {}, 'Marshals alerted')}>
              Send SOS
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {open === 'report' && (
        <div className="card safety-sheet">
          <label className="eyebrow" htmlFor="report-target">
            Player
          </label>
          <select id="report-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Pick a player</option>
            {view.reportable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Pills label="Reason" options={REASONS} value={reason} onChange={setReason} />
          <label className="eyebrow" htmlFor="report-note">
            Note (optional)
          </label>
          <textarea
            id="report-note"
            className="input"
            rows={2}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={busy || !target}
              onClick={() => send('report', { targetId: target, reason, note: note.trim() }, 'Report sent')}
            >
              Send report
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="safety-status">
          {message}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="safety-buttons">
        <button type="button" className="btn safety-sos" onClick={() => toggle('sos')}>
          SOS
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => toggle('report')}>
          Report
        </button>
      </div>
    </div>
  )
}
