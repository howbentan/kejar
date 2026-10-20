import type { ReactNode } from 'react'

/** The lowercase wordmark with the volt full stop. */
export function Wordmark({ size = 64 }: { size?: number }) {
  return (
    <h1 className="wordmark" style={{ fontSize: size }}>
      <span>kejar</span>
      <span style={{ color: 'var(--volt)' }}>.</span>
    </h1>
  )
}

export function Screen({ eyebrow, children }: { eyebrow?: string; children: ReactNode }) {
  return (
    <main className="screen">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      {children}
    </main>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" style={{ color: 'var(--white)', fontWeight: 600 }}>
      {children}
    </p>
  ) : null
}

export const tagText = (tag: number | null) => (tag === null ? 'No tag yet' : `#${String(tag).padStart(2, '0')}`)
