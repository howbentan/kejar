import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'

/** Camera QR scanner. Calls `onResult` once with the decoded text; optional typed-number fallback. */
export default function Scanner({
  onResult,
  onCancel,
  numberFallback,
}: {
  onResult: (text: string) => void
  onCancel: () => void
  numberFallback?: { label: string; onNumber: (n: number) => void }
}) {
  const video = useRef<HTMLVideoElement>(null)
  const done = useRef(false)
  const [problem, setProblem] = useState('')
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!video.current) return
    const scanner = new QrScanner(
      video.current,
      (r) => {
        if (done.current) return
        done.current = true
        scanner.stop()
        onResult(r.data)
      },
      { returnDetailedScanResult: true, highlightScanRegion: true, preferredCamera: 'environment' },
    )
    scanner.start().catch(() => setProblem('Camera unavailable — allow camera access for this site.'))
    return () => scanner.destroy()
  }, [onResult])

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <video ref={video} style={{ width: '100%', borderRadius: 14, background: '#000' }} muted playsInline />
      {problem && <p className="muted">{problem}</p>}
      {numberFallback && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            inputMode="numeric"
            placeholder={numberFallback.label}
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 2))}
          />
          <button className="btn" disabled={!typed} onClick={() => numberFallback.onNumber(Number(typed))}>
            Use
          </button>
        </div>
      )}
      <button className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
