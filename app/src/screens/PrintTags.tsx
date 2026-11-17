import { useEffect, useState } from 'react'
import { JAIL_QR, MAX_PLAYERS_PER_GAME, MAX_STATIONS, stationQr, tagQr } from '../../shared/ids.js'
import { qrDataUrl } from '../game/qr'

const TAGS = Array.from({ length: MAX_PLAYERS_PER_GAME }, (_, i) => i + 1)
const STATIONS = Array.from({ length: MAX_STATIONS }, (_, i) => i + 1)

/**
 * Printable sheet: armbands #01 to #40 (one per player at the game cap), then each station and Penjara on an A4 page of its own. Black on white, no lime text (spec §9). It's public, so it
 * never has Full mode's Tupperware slips: those print from Your kit (`PrintSlips`), organiser only.
 */
export default function PrintTags() {
  const [codes, setCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    const texts = [...TAGS.map((n) => tagQr(n)), ...STATIONS.map((n) => stationQr(n)), JAIL_QR]
    void Promise.all(texts.map(async (t) => [t, await qrDataUrl(t)] as const)).then((pairs) => setCodes(Object.fromEntries(pairs)))
  }, [])

  return (
    <div style={{ background: '#fff', color: '#0A0A0B', minHeight: '100dvh', padding: 16 }}>
      <style>{`@media print { .no-print { display: none } } .tag { break-inside: avoid }
        .a4-poster { break-before: page; break-inside: avoid; box-sizing: border-box; height: 270mm; margin-top: 24px; border: 3px solid #0A0A0B; border-radius: 6mm;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6mm; text-align: center; padding: 10mm }
        @media print { .a4-poster { margin-top: 0 } }`}</style>
      <p className="no-print" style={{ marginBottom: 12 }}>
        Print on A4. Cut out each tag, laminate, and stick a hook-velcro square on the back. Each station and Penjara gets a page of its own: tape it up at its spot.{' '}
        <button onClick={() => window.print()}>Print</button>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {TAGS.map((n) => (
          <div key={n} className="tag" style={{ border: '1px dashed #999', padding: 8, textAlign: 'center' }}>
            {codes[tagQr(n)] && <img src={codes[tagQr(n)]} alt={`Tag ${n}`} style={{ width: '40mm', height: '40mm' }} />}
            <div style={{ fontWeight: 800, fontSize: 22, fontFamily: 'var(--mono)' }}>#{String(n).padStart(2, '0')}</div>
            <img src="/logo-ink.png" alt="kejar." style={{ height: '7mm', width: 'auto', display: 'block', margin: '0 auto' }} />
          </div>
        ))}
      </div>
      {STATIONS.map((n) => (
        <Poster key={n} qr={codes[stationQr(n)]} alt={`Station ${n}`} title={`STATION ${n}`} line="Scan to get a power-up" />
      ))}
      <Poster qr={codes[JAIL_QR]} alt="Penjara code" title="PENJARA" line="Free runners: scan this to break everyone out (once each)." />
    </div>
  )
}

/**
 * One station or Penjara as a whole A4 page: it's taped to a pole or a wall and scanned from a step away, so the QR is
 * 150 mm and the name reads from across the path.
 */
function Poster({ qr, alt, title, line }: { qr?: string; alt: string; title: string; line: string }) {
  return (
    <div className="a4-poster">
      {qr && <img src={qr} alt={alt} style={{ width: '150mm', height: '150mm' }} />}
      <h2 style={{ margin: 0, fontWeight: 800, fontSize: '22mm', lineHeight: 1, letterSpacing: '-0.02em' }}>{title}</h2>
      <p style={{ margin: 0, fontSize: '7mm' }}>{line}</p>
      <img src="/logo-ink.png" alt="kejar." style={{ height: '12mm', width: 'auto' }} />
    </div>
  )
}
