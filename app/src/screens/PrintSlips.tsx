import { useEffect, useState } from 'react'
import { slipQr } from '../../shared/ids.js'
import { call } from '../game/api'
import { loadOrganiserSession } from '../game/organiserSession'
import { qrDataUrl } from '../game/qr'
import { type Slip, slipLabel } from '../game/slips'

/**
 * The Tupperware slip sheet, opened from Your Kit. One slip per unused slip the organiser holds, Dikejar first, laid
 * out as an A4 grid with cut lines. A bound slip is dead (it was used up for a game), so only unused ones print. The
 * QR carries the slip's secret token; the label is for the organiser to tell the two sides apart. Black on white,
 * like the tag sheet.
 */
export default function PrintSlips() {
  const organiserToken = loadOrganiserSession(localStorage)?.organiserToken
  const [slips, setSlips] = useState<Slip[]>([])
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!organiserToken) return
    let live = true
    call<Slip[]>('listSlips', { organiserToken })
      .then(async (all) => {
        const unused = all.filter((s) => s.state === 'unused')
        const pairs = await Promise.all(unused.map(async (s) => [s.token, await qrDataUrl(slipQr(s.token))] as const))
        if (!live) return
        setSlips(unused)
        setCodes(Object.fromEntries(pairs))
        setLoaded(true)
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [organiserToken])

  return (
    <div style={{ background: '#fff', color: '#0A0A0B', minHeight: '100dvh', padding: 16 }}>
      <style>{`@media print { .no-print { display: none } } .slip { break-inside: avoid }`}</style>
      {!organiserToken ? (
        <p>Open this from an organiser phone, in Your Kit.</p>
      ) : (
        <>
          <p className="no-print" style={{ marginBottom: 12 }}>
            Print on A4 and cut along the lines. Put one slip inside each Tupperware box. <button onClick={() => window.print()}>Print</button>
          </p>
          {error && <p role="alert">{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <b style={{ fontSize: 20 }}>kejar.</b>
            <span style={{ fontSize: 12 }}>Tupperware slips · each slip works once</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
            {slips.map((s) => (
              <div key={s.token} className="slip" style={{ border: '1px dashed #999', padding: 8, textAlign: 'center' }}>
                {codes[s.token] && <img src={codes[s.token]} alt={slipLabel(s)} style={{ width: '32mm', height: '32mm' }} />}
                <div style={{ fontWeight: 800, fontSize: 16, fontFamily: 'var(--mono)' }}>{slipLabel(s)}</div>
              </div>
            ))}
          </div>
          {loaded && slips.length === 0 && !error && <p>No unused slips. Make a new sheet in Your Kit.</p>}
          <p style={{ marginTop: 12, fontSize: 12 }}>Any unused slip of the right side works.</p>
        </>
      )}
    </div>
  )
}
