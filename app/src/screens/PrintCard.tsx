import { useEffect, useState } from 'react'
import { datoQr } from '../../shared/ids.js'
import { qrDataUrl } from '../game/qr'

/**
 * One game's hidden ★ card, opened from Organiser tools in the lobby (ruling R15). Its QR carries that game's own
 * secret code, which arrives in the URL's # part so it never reaches the server or its logs. The card shows only a
 * ★ and kejar. so a passer-by can't tell what it is (rules doc §9b). Black on white, like the tag sheet.
 */
export default function PrintCard({ cardCode }: { cardCode: string }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    if (!cardCode) return
    let live = true
    void qrDataUrl(datoQr(cardCode)).then((url) => live && setSrc(url))
    return () => {
      live = false
    }
  }, [cardCode])

  return (
    <div style={{ background: '#fff', color: '#0A0A0B', minHeight: '100dvh', padding: 16 }}>
      <style>{`@media print { .no-print { display: none } } .tag { break-inside: avoid }`}</style>
      {!cardCode ? (
        <p>Open this from Organiser tools in the game lobby.</p>
      ) : (
        <>
          <p className="no-print" style={{ marginBottom: 12 }}>
            This ★ card only works in this game. Hide it in the play area, stand by it, then in the lobby open Organiser
            tools and drop it there. Don&apos;t tell the players. <button onClick={() => window.print()}>Print</button>
          </p>
          <div data-testid="stash-card" className="tag" style={{ width: '70mm', border: '2px solid #0A0A0B', padding: 12, textAlign: 'center' }}>
            {src && <img src={src} alt="★" style={{ width: '55mm', height: '55mm' }} />}
            <div style={{ fontWeight: 800, fontSize: 28 }}>★</div>
            <div style={{ fontWeight: 800, letterSpacing: '-0.05em' }}>kejar.</div>
          </div>
        </>
      )}
    </div>
  )
}
