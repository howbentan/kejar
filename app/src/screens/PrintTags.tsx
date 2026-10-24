import { useEffect, useState } from 'react'
import { JAIL_QR, MAX_STATIONS, stationQr, tagQr } from '../../shared/ids.js'
import { qrDataUrl } from '../game/qr'

const TAGS = Array.from({ length: 30 }, (_, i) => i + 1)
const STATIONS = Array.from({ length: MAX_STATIONS }, (_, i) => i + 1)

/** Printable sheet: 30 runner tags plus the jail code. Black on white, no lime text (spec §9). */
export default function PrintTags() {
  const [codes, setCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    void Promise.all([...TAGS.map((n) => tagQr(n)), ...STATIONS.map((n) => stationQr(n)), JAIL_QR].map(async (t) => [t, await qrDataUrl(t)] as const)).then(
      (pairs) => setCodes(Object.fromEntries(pairs)),
    )
  }, [])

  return (
    <div style={{ background: '#fff', color: '#0A0A0B', minHeight: '100dvh', padding: 16 }}>
      <style>{`@media print { .no-print { display: none } } .tag { break-inside: avoid }`}</style>
      <p className="no-print" style={{ marginBottom: 12 }}>
        Print on A4, cut out each tag, laminate, and stick a hook-velcro square on the back.{' '}
        <button onClick={() => window.print()}>Print</button>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {TAGS.map((n) => (
          <div key={n} className="tag" style={{ border: '1px dashed #999', padding: 8, textAlign: 'center' }}>
            {codes[tagQr(n)] && <img src={codes[tagQr(n)]} alt={`Tag ${n}`} style={{ width: '40mm', height: '40mm' }} />}
            <div style={{ fontWeight: 800, fontSize: 22, fontFamily: 'var(--mono)' }}>#{String(n).padStart(2, '0')}</div>
            <div style={{ fontWeight: 800, letterSpacing: '-0.05em' }}>kejar.</div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24, fontWeight: 700 }}>Power-up stations: tape each at the matching numbered spot on the map.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 8 }}>
        {STATIONS.map((n) => (
          <div key={n} className="tag" style={{ border: '2px solid #0A0A0B', padding: 10, textAlign: 'center' }}>
            {codes[stationQr(n)] && (
              <img src={codes[stationQr(n)]} alt={`Station ${n}`} style={{ width: '55mm', height: '55mm' }} />
            )}
            <div style={{ fontWeight: 800, fontSize: 22 }}>{`STATION ${n}`}</div>
            <div style={{ fontSize: 12 }}>Scan to get a power-up</div>
          </div>
        ))}
      </div>
      <div className="tag" style={{ marginTop: 24, border: '2px solid #0A0A0B', padding: 16, textAlign: 'center' }}>
        {codes[JAIL_QR] && <img src={codes[JAIL_QR]} alt="Jail code" style={{ width: '90mm', height: '90mm' }} />}
        <div style={{ fontWeight: 800, fontSize: 40 }}>JAIL</div>
        <div>Free runners: scan this to break everyone out (once each).</div>
      </div>
    </div>
  )
}
