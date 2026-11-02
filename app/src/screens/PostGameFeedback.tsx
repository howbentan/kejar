import { useState } from 'react'
import { NOTE_MAX, REASON_LABEL, type ReportReason } from '../../shared/alerts.js'
import type { View } from '../../shared/views.js'
import { call } from '../game/api'
import { credentials } from '../game/auth'
import { currentCoords } from '../game/here'
import { ErrorText, Pills } from '../game/ui'

const REPORT_REASONS = (Object.keys(REASON_LABEL) as ReportReason[]).map((value) => ({ value, text: REASON_LABEL[value] }))
const RATINGS = [1, 2, 3, 4, 5]

/**
 * Post-game only: "How fun was it?" and "Report a player", both moved out of the in-game SOS sheet onto
 * the Results screen (Plan C3) now that a report can be filed after the whistle too.
 */
export default function PostGameFeedback({ code, view }: { code: string; view: View }) {
  const [rating, setRating] = useState<number | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const [rateBusy, setRateBusy] = useState(false)
  const [rateError, setRateError] = useState('')
  const [rated, setRated] = useState(false)

  const [reporting, setReporting] = useState(false)
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState<ReportReason>('unsafe')
  const [note, setNote] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reported, setReported] = useState(false)

  async function sendRating() {
    if (!rating) return
    setRateBusy(true)
    setRateError('')
    try {
      await call('rate', { code, ...credentials(code), rating, note: changeNote.trim() })
      setRated(true)
    } catch (e) {
      setRateError(e instanceof Error ? e.message : String(e))
    } finally {
      setRateBusy(false)
    }
  }

  async function sendReport() {
    setReportBusy(true)
    setReportError('')
    try {
      const here = await currentCoords()
      await call('report', { code, ...credentials(code), targetId: target, reason, note: note.trim(), ...here })
      setReported(true)
    } catch (e) {
      setReportError(e instanceof Error ? e.message : String(e))
    } finally {
      setReportBusy(false)
    }
  }

  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p className="eyebrow">How fun was it?</p>
        {rated ? (
          <p className="muted">Thanks!</p>
        ) : (
          <>
            <div className="sos-chips">
              {RATINGS.map((n) => (
                <button key={n} type="button" aria-pressed={rating === n} className={rating === n ? 'on' : ''} onClick={() => setRating(n)}>
                  {n}
                </button>
              ))}
            </div>
            <label className="eyebrow" htmlFor="fun-change">
              What would you change? (optional)
            </label>
            <textarea
              id="fun-change"
              className="input"
              rows={2}
              maxLength={NOTE_MAX}
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
            />
            <ErrorText>{rateError}</ErrorText>
            <button type="button" className="btn" disabled={rateBusy || !rating} onClick={sendRating}>
              Send
            </button>
          </>
        )}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reported ? (
          <p role="status" className="safety-status">
            Report sent
          </p>
        ) : reporting ? (
          <>
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
            <Pills label="Reason" options={REPORT_REASONS} value={reason} onChange={setReason} />
            <label className="eyebrow" htmlFor="report-note">
              Note (optional)
            </label>
            <textarea id="report-note" className="input" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
            <ErrorText>{reportError}</ErrorText>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn" disabled={reportBusy || !target} onClick={sendReport}>
                Send report
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setReporting(false)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="sos-link" onClick={() => setReporting(true)}>
            Report a player
          </button>
        )}
      </div>
    </>
  )
}
