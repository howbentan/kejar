import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'

/** Camera QR scanner. Calls `onResult` once with the decoded text; optional typed-number fallback. */
export default function Scanner({
  onResult,
  onCancel,
  numberFallback,
  hint,
}: {
  onResult: (text: string) => void
  onCancel: () => void
  /** Shown over a lime viewfinder with a sweeping scan line (motion design §7). */
  hint?: string
  /** `buttons`: one button per meaning of the number (a Kejar's number may be a tag or a station); otherwise "Use". */
  numberFallback?: { label: string; onNumber: (n: number) => void; buttons?: { label: string; onNumber: (n: number) => void }[] }
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
    scanner.start().catch(() => setProblem('Camera unavailable. Allow camera access for this site.'))
    return () => scanner.destroy()
  }, [onResult])

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative' }}>
        <video ref={video} style={{ width: '100%', borderRadius: 14, background: '#000' }} muted playsInline />
        {hint && (
          <div className="viewfinder" aria-hidden="true">
            <span className="vf-line" />
          </div>
        )}
      </div>
      {hint && <p className="vf-hint">{hint}</p>}
      {problem && <p className="muted">{problem}</p>}
      {numberFallback && (
        // Two meanings (Tag or Station): the box gets its own row and the two buttons share the row below.
        <div style={numberFallback.buttons && numberFallback.buttons.length > 1 ? { display: 'flex', flexDirection: 'column', gap: 8 } : { display: 'flex', gap: 8 }}>
          <input
            className="input"
            inputMode="numeric"
            placeholder={numberFallback.label}
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 2))}
          />
          <div className="btn-pair" style={{ width: 'auto' }}>
            {(numberFallback.buttons ?? [{ label: 'Use', onNumber: numberFallback.onNumber }]).map((b) => (
              <button key={b.label} className="btn scan-num" disabled={!typed} onClick={() => b.onNumber(Number(typed))}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <button className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
