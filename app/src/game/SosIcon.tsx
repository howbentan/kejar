import * as m from 'motion/react-m'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { NOTE_MAX, REASON_LABEL, SOS_REASON_LABEL, type ReportReason, type SosReason } from '../../shared/alerts.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { credentials } from './auth'
import { currentCoords } from './here'
import { ErrorText, Pills } from './ui'

/** An SOS can't wait long for GPS: send what we have after 1.5 s (spec §5: "immediately"). */
const SOS_FIX_MS = 1_500
/** Hold the bar this long to send (motion design §6.0). A tap can't raise an SOS by accident. */
const HOLD_MS = 1_000
/** Letting go sooner than this reads as a tap, not a hold that stopped short. */
const TAP_MS = 250
/** The "What's happening?" chips stay up this long, then the sheet closes itself. */
const SENT_MS = 20_000

const HINT = 'HOLD 1 S · MARSHALS COME TO YOU'
const NOBODY = 'SOS saved, but no marshal has alerts on. Find a marshal or call for help.'
const ALREADY = 'Marshals already have your SOS.'

const SOS_REASONS = Object.keys(SOS_REASON_LABEL) as SosReason[]
const REPORT_REASONS = (Object.keys(REASON_LABEL) as ReportReason[]).map((value) => ({ value, text: REASON_LABEL[value] }))

type Stage = 'ask' | 'sending' | 'sent' | 'report'

/**
 * Help and SOS, a small Volt "!" in the same spot on every player screen (motion design §6.0). It reads as
 * a help icon rather than a game button. Tapping opens a sheet; only a 1 s hold on its bar alerts marshals.
 */
export default function SosIcon({ code, view }: { code: string; view: View }) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('ask')
  const [hint, setHint] = useState(HINT)
  const [holding, setHolding] = useState(false)
  const [error, setError] = useState('')
  /** `notified` is null for a repeat within 30 s: the server raised no new alert, so we don't know who has it. */
  const [sos, setSos] = useState<{ id: string; notified: number | null } | null>(null)
  const [reason, setReason] = useState<SosReason | null>(null)
  const [withId, setWithId] = useState<string | null>(null)
  const [reported, setReported] = useState('')
  const hold = useRef<{ at: number; timer: number } | null>(null)

  const close = () => {
    if (hold.current) window.clearTimeout(hold.current.timer)
    hold.current = null
    setOpen(false)
    setHolding(false)
  }

  // The chips drain away 20 s after the last tap.
  useEffect(() => {
    if (!open || stage !== 'sent') return
    const t = window.setTimeout(close, SENT_MS)
    return () => window.clearTimeout(t)
  }, [open, stage, reason, withId])

  // A hold still running when the screen goes away must never send.
  useEffect(() => () => window.clearTimeout(hold.current?.timer), [])

  // "Tell a marshal" elsewhere (the auto-jailed screen) opens this sheet with a reason already picked.
  const preset = useRef<SosReason | null>(null)
  useEffect(() => {
    const onAsk = (e: Event) => {
      if (open) return
      preset.current = (e as CustomEvent<{ reason?: SosReason }>).detail?.reason ?? null
      show()
    }
    window.addEventListener('kejar:sos', onAsk)
    return () => window.removeEventListener('kejar:sos', onAsk)
  })

  const show = () => {
    // Already open: a second tap mustn't reset a send in flight or the chips already picked.
    if (open) return
    setStage('ask')
    setHint(HINT)
    setError('')
    setSos(null)
    setReason(null)
    setWithId(null)
    setReported('')
    setOpen(true)
  }

  async function send() {
    hold.current = null
    setHolding(false)
    setStage('sending')
    setHint('SENDING…')
    try {
      const here = await currentCoords(SOS_FIX_MS)
      const r = await call<{ ok: boolean; notified?: number; sosId?: string }>('sos', { code, ...credentials(code), ...here })
      setSos({ id: r?.sosId ?? '', notified: r?.notified ?? null })
      setStage('sent')
      navigator.vibrate?.([200, 100, 400])
      const picked = preset.current
      preset.current = null
      if (picked && r?.sosId) {
        setReason(picked)
        // The SOS itself went through; a failed detail mustn't take the sheet back to "hold to send".
        call('sosDetails', { code, ...credentials(code), sosId: r.sosId, reason: picked }).catch((e: unknown) =>
          setError(e instanceof Error ? e.message : String(e)),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage('ask')
      setHint(HINT)
    }
  }

  const press = () => {
    if (hold.current || stage !== 'ask') return
    navigator.vibrate?.(30)
    setHolding(true)
    setHint('KEEP HOLDING…')
    hold.current = { at: Date.now(), timer: window.setTimeout(send, HOLD_MS) }
  }
  const release = () => {
    if (!hold.current) return
    window.clearTimeout(hold.current.timer)
    const short = Date.now() - hold.current.at < TAP_MS
    hold.current = null
    setHolding(false)
    setHint(short ? 'HOLD FOR 1 SECOND TO SEND SOS' : 'LET GO TOO EARLY · HOLD 1 S')
  }
  const isHoldKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter'

  async function details(next: SosReason, who: string | null) {
    setReason(next)
    setWithId(who)
    if (!sos?.id) return
    try {
      await call('sosDetails', { code, ...credentials(code), sosId: sos.id, reason: next, ...(who ? { withId: who } : {}) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const asksWho = reason === 'unsafe' || reason === 'dispute'

  return (
    <>
      <button
        type="button"
        className="sos-icon"
        aria-label="Help and SOS"
        onClick={() => {
          if (!open) preset.current = null
          show()
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5.5v8" />
          <path d="M12 18h.01" />
        </svg>
      </button>
      {open && (
        <>
          <div className="sos-shade" onClick={close} />
          <m.div
            className="sos-sheet"
            role="dialog"
            aria-label="Help and SOS"
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="sos-grip" />
            {(stage === 'ask' || stage === 'sending') && (
              <>
                <h3>Need help?</h3>
                <p className="muted">Hurt, lost, or something unsafe? Hold the bar for 1 second and every marshal is alerted with where you are.</p>
                <div className="sos-hint">{hint}</div>
                <div className="sos-hold">
                  <button
                    type="button"
                    className={holding ? 'sos-bar holding' : 'sos-bar'}
                    aria-label="Hold for 1 second to send SOS"
                    disabled={stage === 'sending'}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      press()
                    }}
                    onPointerUp={release}
                    onPointerLeave={release}
                    onPointerCancel={release}
                    onBlur={release}
                    onContextMenu={(e) => e.preventDefault()}
                    onKeyDown={(e) => {
                      if (!isHoldKey(e)) return
                      e.preventDefault()
                      if (!e.repeat) press()
                    }}
                    onKeyUp={(e) => {
                      if (!isHoldKey(e)) return
                      e.preventDefault()
                      release()
                    }}
                  >
                    <span className="sos-fill" />
                    <span className="sos-label">sos</span>
                  </button>
                  {holding && <span className="sos-ripple" aria-hidden="true" />}
                </div>
                <ErrorText>{error}</ErrorText>
                <button type="button" className="sos-cancel" onClick={close}>
                  Cancel
                </button>
                {stage === 'ask' && (
                  <button type="button" className="sos-link" onClick={() => setStage('report')}>
                    Report a player
                  </button>
                )}
              </>
            )}
            {stage === 'sent' && (
              <>
                <div className="sos-big">sos sent</div>
                <p className="muted">
                  {sos?.notified === 0 ? NOBODY : sos?.notified === null ? ALREADY : 'Marshals alerted.'} What's happening? (optional, helps the marshal)
                </p>
                <div className="sos-chips">
                  {SOS_REASONS.map((r) => (
                    <button key={r} type="button" aria-pressed={reason === r} className={reason === r ? 'on' : ''} onClick={() => details(r, null)}>
                      {SOS_REASON_LABEL[r]}
                    </button>
                  ))}
                </div>
                {asksWho && (
                  <>
                    <div className="sos-hint">With who?</div>
                    <div className="sos-chips">
                      {view.reportable.map((p) => (
                        <button key={p.id} type="button" aria-pressed={withId === p.id} className={withId === p.id ? 'on' : ''} onClick={() => details(reason, p.id)}>
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <ErrorText>{error}</ErrorText>
                <div className="sos-drain" aria-hidden="true" />
                <button type="button" className="sos-cancel" onClick={close}>
                  Done
                </button>
              </>
            )}
            {stage === 'report' &&
              (reported ? (
                <>
                  <p role="status" className="safety-status">
                    {reported}
                  </p>
                  <button type="button" className="sos-cancel" onClick={close}>
                    Done
                  </button>
                </>
              ) : (
                <ReportForm code={code} view={view} onSent={() => setReported('Report sent')} onCancel={close} />
              ))}
          </m.div>
        </>
      )}
    </>
  )
}

/** Today's report form, kept inside the sheet until the post-game report replaces it (Plan C3). */
function ReportForm({ code, view, onSent, onCancel }: { code: string; view: View; onSent: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState<ReportReason>('unsafe')
  const [note, setNote] = useState('')

  async function send() {
    setBusy(true)
    setError('')
    try {
      const here = await currentCoords()
      await call('report', { code, ...credentials(code), targetId: target, reason, note: note.trim(), ...here })
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="safety-sheet">
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
      <ErrorText>{error}</ErrorText>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" disabled={busy || !target} onClick={send}>
          Send report
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
