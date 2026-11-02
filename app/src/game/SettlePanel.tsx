import { useState } from 'react'
import { JAIL_QR } from '../../shared/ids.js'
import type { View } from '../../shared/views.js'
import { call } from './api'
import { currentCoords } from './here'
import Scanner from './Scanner'
import { loadSession } from './session'
import { ErrorText } from './ui'

/** Settle frees the holder plus up to this many others (rules doc §9c). */
const MAX_PICKS = 2

type SettleResult = { ok: true; freedIds: string[] } | { ok: false; reason: string; targetId?: string }

const REFUSALS: Record<string, string> = {
  'too-far-from-jail': 'Get within 30 m of Penjara',
  'nobody-to-free': 'Nobody to free. Pick someone who hasn’t escaped yet.',
  'too-many-targets': 'Pick up to 2 people',
  'unknown-target': 'Someone you picked isn’t in Penjara any more. Pick again.',
  'not-jailed': 'Settle works from inside Penjara',
  'no-dato': 'You don’t have it any more',
  'already-used': 'Already used',
  'not-chasing': 'Settle works during the chase',
  paused: 'Game is paused',
}

/** "You", "You and Hafiz", "You, Hafiz and Wei". */
function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
}

/**
 * Settle, for a jailed runner holding Dato Seri (jail design §4b, §4d). Pick up to 2 others in Penjara, then scan
 * the Penjara code: the scan is the confirm, and it sends the location the server checks (30 m, under 30 s old),
 * exactly like a jailbreak. Those who already used their one escape are greyed out.
 */
export default function SettlePanel({ code, settle }: { code: string; settle: NonNullable<View['settle']> }) {
  const [picked, setPicked] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX_PICKS ? [...p, id] : p))
  // Already escaped once: Settle can only free others, so it needs at least one pick.
  const ready = settle.canFreeSelf || picked.length > 0

  async function onScan(text: string) {
    setScanning(false)
    setMessage('')
    setError('')
    if (text.trim() !== JAIL_QR) return setError("That's not the Penjara code")
    setBusy(true)
    try {
      const here = await currentCoords()
      const r = await call<SettleResult>('settle', { code, token: loadSession(localStorage, code).token, qr: JAIL_QR, targetIds: picked, ...here })
      if (r.ok) {
        navigator.vibrate?.([60, 40, 300])
        const who = r.freedIds.map((id) => settle.options.find((o) => o.id === id)?.name ?? 'You')
        // The holder first, as "You".
        who.sort((a, b) => (a === 'You' ? -1 : b === 'You' ? 1 : 0))
        const verb = who.length === 1 && who[0] !== 'You' ? 'is' : 'are'
        setMessage(`Settled! ${names(who)} ${verb} free.`)
      } else if (r.reason === 'target-already-freed') {
        const name = settle.options.find((o) => o.id === r.targetId)?.name ?? 'Someone you picked'
        setError(`${name} has already escaped once. Pick someone else.`)
      } else setError(REFUSALS[r.reason] ?? 'Nobody freed')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card settle">
      <p className="eyebrow settle-eyebrow">★ LEGENDARY</p>
      <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.04em' }}>Settle</h2>
      <p className="muted">
        {settle.canFreeSelf
          ? 'Free yourself and up to 2 others in Penjara. Pick who, then scan the Penjara code.'
          : "You've already escaped once — Settle can still free others"}
      </p>
      {settle.options.length > 0 ? (
        <ul className="settle-list">
          {settle.options.map((o) => {
            const on = picked.includes(o.id)
            const full = !on && picked.length >= MAX_PICKS
            return (
              <li key={o.id}>
                <label className={o.eligible ? '' : 'off'}>
                  <input type="checkbox" checked={on} disabled={!o.eligible || full || busy} onChange={() => toggle(o.id)} />
                  <span>{o.name}</span>
                  {!o.eligible && <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>Already escaped once</span>}
                </label>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted">Nobody else is in Penjara.</p>
      )}
      <p className="muted" style={{ fontSize: 12 }}>{`${picked.length} of ${MAX_PICKS} picked`}</p>
      <button type="button" className="btn btn-legendary" disabled={!ready || busy} onClick={() => setScanning(true)}>
        Scan Penjara to settle
      </button>
      {message && <p role="status">{message}</p>}
      <ErrorText>{error}</ErrorText>
      {scanning && (
        <div className="scan-overlay">
          <Scanner onResult={(t) => void onScan(t)} onCancel={() => setScanning(false)} hint="Point at the Penjara card" />
        </div>
      )}
    </div>
  )
}
