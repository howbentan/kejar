import { useEffect, useRef, useState } from 'react'
import { REASON_LABEL } from '../../shared/alerts.js'
import type { Alert } from '../../shared/alerts.js'
import type { RosterEntry, View } from '../../shared/views.js'
import { currentPushEnv, NotificationsDeniedError, pushSupport, subscribe } from './push'
import { call } from './api'
import { credentials } from './auth'
import { ErrorText, tagText } from './ui'

const KIND_LABEL: Record<Alert['kind'], string> = {
  sos: 'SOS',
  report: 'Report',
  outside: 'Boundary',
  missed: 'Check-ins',
  'auto-jail': 'Check-ins',
  'left-start': 'Start',
  'flagged-catch': 'Catch',
  'luar-garisan': 'Boundary',
}

const ago = (at: string, now: number) => {
  const min = Math.max(0, Math.floor((now - Date.parse(at)) / 60_000))
  return min === 0 ? 'now' : `${min} min ago`
}

/** A disqualified player's roster status: plain English, none of Penjara's furniture. */
function LuarGarisanStatus() {
  return (
    <>
      <span className="status-pill luar">LUAR GARISAN</span>
      <span className="status-reason">left the play area</span>
    </>
  )
}

/**
 * A jailed player's roster status: caught by a chaser (named, timed) or auto-jailed (no `caught_by`), plus
 * whether they've already used their one Settle/jailbreak escape — the two things a marshal gets asked about
 * that "in Penjara" alone didn't answer.
 */
function JailStatus({ p, now }: { p: RosterEntry; now: number }) {
  const auto = !p.caught_by
  return (
    <>
      <span className={auto ? 'status-pill auto' : 'status-pill jailed'}>{auto ? 'PENJARA · AUTO' : 'PENJARA'}</span>
      <span className="status-reason">{auto ? '2 missed check-ins' : `caught by ${p.caught_by}${p.caught_at ? ` · ${ago(p.caught_at, now)}` : ''}`}</span>
      {p.freed_once && <span className="status-freed">Already escaped once</span>}
    </>
  )
}

/** Lets a marshal or the organiser get SOS and report alerts on this phone, until they're on. */
export function AlertsOnPhone({ code, view, refresh }: { code: string; view: View; refresh: () => void }) {
  const [message, setMessage] = useState('')
  if (view.me.push || pushSupport(currentPushEnv()) !== 'ok') return null
  async function turnOn() {
    setMessage('')
    try {
      const subscription = await subscribe(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      await call('subscribe', { code, ...credentials(code), subscription })
      refresh()
    } catch (e) {
      setMessage(
        e instanceof NotificationsDeniedError
          ? 'Notifications are blocked. Allow them in your phone settings, then reload.'
          : `Couldn't turn on alerts: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="muted">Players' SOS and reports buzz this phone, even when the page is closed.</p>
      <button type="button" className="btn" onClick={turnOn}>
        Get SOS alerts on this phone
      </button>
      <ErrorText>{message}</ErrorText>
    </div>
  )
}

/**
 * Pause and resume, the alert list, and removing players (spec §5.1). An open SOS is only ever closed from the
 * SOS takeover (which insists on an outcome); its pinned row here brings the takeover back via `onOpenSos`.
 */
export default function MarshalTools({
  code,
  view,
  refresh,
  onOpenSos,
}: {
  code: string
  view: View
  refresh: () => void
  onOpenSos?: (alertId: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)
  const [tab, setTab] = useState<'live' | 'after'>('live')
  // New phone links made on this screen, by player id. Each link is made on one tap and shared on the next.
  const [phoneLinks, setPhoneLinks] = useState<Record<string, string>>({})

  // Buzz when a new SOS comes in: marshals may be looking at the park, not the screen.
  const openSos = view.alerts.filter((a) => a.kind === 'sos' && !a.handled).length
  const lastSos = useRef(openSos)
  useEffect(() => {
    if (openSos > lastSos.current) navigator.vibrate?.([200, 100, 200])
    lastSos.current = openSos
  }, [openSos])

  async function act(action: string, extra: object = {}) {
    setBusy(true)
    setError('')
    try {
      const r = await call<{ ok?: boolean; reason?: string } | undefined>(action, { code, ...credentials(code), ...extra })
      // An undo that lost a race (the game ended, or another marshal got there first) says so instead of vanishing.
      if (r && r.ok === false && r.reason === 'not-undoable') setError("Too late, that one can't be undone now.")
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function makePhoneLink(playerId: string) {
    setBusy(true)
    setError('')
    try {
      const { inviteToken } = await call<{ inviteToken: string }>('createPhoneMove', { code, ...credentials(code), playerId })
      setPhoneLinks((l) => ({ ...l, [playerId]: `${window.location.origin}/p/${code}/${inviteToken}` }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** Called straight from a tap: nothing is awaited before `navigator.share`, or iPhone drops the share. */
  function sendPhoneLink(name: string, link: string) {
    setError('')
    if (typeof navigator.share !== 'function') {
      void navigator.clipboard.writeText(link)
      setError('Link copied. Paste it to their new phone.')
      return
    }
    navigator.share({ text: `Your new phone link for Kejar, ${name}: ${link}` }).catch((e) => {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : String(e))
    })
  }

  // Live tab order (motion design): open SOS pinned up top, then everything else open, then closed.
  const openAlerts = view.alerts.filter((a) => !a.handled)
  const openSosAlerts = openAlerts.filter((a) => a.kind === 'sos')
  const needsALook = openAlerts.filter((a) => a.kind !== 'sos')
  const closedAlerts = view.alerts.filter((a) => a.handled)
  const players = view.roster.filter((p) => p.role !== 'marshal' || p.id !== view.me.id)
  // Catches Undo kejar can still undo (fair-play §1.4), so a flagged-catch alert offers it only while it would work.
  const undoable = new Set(view.roster.flatMap((p) => (p.undoKejarId ? [p.undoKejarId] : [])))

  function AlertRow(a: Alert) {
    return (
      <li key={a.id} className={`alert-row${a.handled ? ' alert-handled' : ''}${a.kind === 'sos' && !a.handled ? ' alert-sos' : ''}`}>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">
            {KIND_LABEL[a.kind]} · {ago(a.at, view.now)}
          </p>
          <p>{a.text}</p>
          {a.kind === 'sos' && !a.handled && (
            <p className="eyebrow" style={{ color: 'var(--volt)' }}>
              {a.respondingName ? `${a.respondingName} IS GOING` : "NOBODY'S GOING YET"}
            </p>
          )}
          {a.handled && (a.outcome || a.closedByName) && (
            <p className="muted">{[a.outcome, a.closedByName && `closed by ${a.closedByName}`].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        {!a.handled && a.kind === 'sos' && onOpenSos && (
          <button type="button" className="btn alert-btn" onClick={() => onOpenSos(a.id)}>
            Open SOS
          </button>
        )}
        {!a.handled && a.kind === 'auto-jail' && (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button type="button" className="btn alert-btn" disabled={busy} onClick={() => act('undoAutoJail', { eventId: a.id })}>
              Phone problem: undo
            </button>
            <button type="button" className="btn btn-ghost alert-btn" disabled={busy} onClick={() => act('handleAlert', { eventId: a.id })}>
              It stands
            </button>
          </span>
        )}
        {!a.handled && a.kind === 'flagged-catch' && undoable.has(a.id) && (
          <button type="button" className="btn alert-btn" disabled={busy} onClick={() => act('undoKejar', { eventId: a.id })}>
            Undo kejar
          </button>
        )}
        {!a.handled && a.kind !== 'auto-jail' && a.kind !== 'sos' && (
          <button type="button" className="btn btn-ghost alert-btn" disabled={busy} onClick={() => act('handleAlert', { eventId: a.id })}>
            Handled
          </button>
        )}
      </li>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <AlertsOnPhone code={code} view={view} refresh={refresh} />
      <button
        type="button"
        className={view.paused ? 'btn' : 'btn btn-ghost'}
        disabled={busy}
        onClick={() => act(view.paused ? 'resume' : 'pause')}
      >
        {view.paused ? 'Resume game' : 'Pause game'}
      </button>
      <ErrorText>{error}</ErrorText>

      <p className="eyebrow">Alerts</p>
      <div className="pills" role="tablist" aria-label="Alerts">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'live'}
          className={tab === 'live' ? 'pill pill-on' : 'pill'}
          onClick={() => setTab('live')}
        >
          Live
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'after'}
          className={tab === 'after' ? 'pill pill-on' : 'pill'}
          onClick={() => setTab('after')}
        >
          After game
        </button>
      </div>

      {tab === 'live' ? (
        <div role="tabpanel" aria-label="Live">
          {view.alerts.length === 0 ? (
            <p className="muted">No alerts.</p>
          ) : (
            <>
              {openSosAlerts.length > 0 && <ul className="alert-list">{openSosAlerts.map(AlertRow)}</ul>}
              {needsALook.length > 0 && (
                <>
                  <p className="eyebrow">Needs a look</p>
                  <ul className="alert-list">{needsALook.map(AlertRow)}</ul>
                </>
              )}
              {closedAlerts.length > 0 && (
                <>
                  <p className="eyebrow">Closed</p>
                  <ul className="alert-list">{closedAlerts.map(AlertRow)}</ul>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label="After game">
          {view.reports.length === 0 && view.ratings.length === 0 ? (
            <p className="muted">No reports yet.</p>
          ) : (
            <>
              {view.ratings.length > 0 && (
                <>
                  <p className="eyebrow">How fun was it?</p>
                  <ul className="alert-list">
                    {view.ratings.map((r) => (
                      <li key={r.id} className="alert-row">
                        <div style={{ flex: 1 }}>
                          <p className="eyebrow">
                            {r.rating}/5 · {ago(r.at, view.now)}
                          </p>
                          <p>
                            {r.name}
                            {r.note ? `: ${r.note}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {view.reports.length > 0 && (
                <>
                  <p className="eyebrow">Reports</p>
                  <ul className="alert-list">
                    {view.reports.map((r) => (
                      <li key={r.id} className="alert-row">
                        <div style={{ flex: 1 }}>
                          <p className="eyebrow">
                            {REASON_LABEL[r.reason]} · {ago(r.at, view.now)}
                          </p>
                          <p>
                            {r.name} reported {r.targetName}
                            {r.note ? `: ${r.note}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}

      <p className="eyebrow">Players</p>
      {removing && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontWeight: 700 }}>{`Remove ${removing.name} from the game?`}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                const id = removing.id
                setRemoving(null)
                act('removePlayer', { playerId: id })
              }}
            >
              Yes, remove
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <table>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.role}</td>
              <td className="mono">{p.role === 'runner' ? tagText(p.tag_id) : ''}</td>
              <td>{p.disqualified_at ? <LuarGarisanStatus /> : p.jailed && <JailStatus p={p} now={view.now} />}</td>
              <td style={{ textAlign: 'right' }}>
                {p.undoKejarId && (
                  <button type="button" className="pill" disabled={busy} onClick={() => act('undoKejar', { eventId: p.undoKejarId })}>
                    Undo kejar
                  </button>
                )}
                {(p.role === 'runner' || p.role === 'chaser') &&
                  (phoneLinks[p.id] ? (
                    <>
                      <span className="muted">{`Link ready. Send it to ${p.name}'s new phone.`}</span>{' '}
                      <button type="button" className="pill" onClick={() => sendPhoneLink(p.name, phoneLinks[p.id])}>
                        Send link
                      </button>
                    </>
                  ) : (
                    <button type="button" className="pill" aria-label={`New phone for ${p.name}`} disabled={busy} onClick={() => makePhoneLink(p.id)}>
                      New phone
                    </button>
                  ))}
                <button
                  type="button"
                  className="pill"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => setRemoving({ id: p.id, name: p.name })}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
