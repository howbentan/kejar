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

/** A row of pill buttons for picking one option (accessible as a radio group). */
export function Pills<T extends string>(props: {
  label: string
  options: { value: T; text: string }[]
  value: T | null
  disabled?: boolean
  onChange: (value: T) => void
}) {
  return (
    <div className="pills" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          aria-label={`${props.label}: ${o.text}`}
          className={props.value === o.value ? 'pill pill-on' : 'pill'}
          disabled={props.disabled}
          onClick={() => props.value !== o.value && props.onChange(o.value)}
        >
          {o.text}
        </button>
      ))}
    </div>
  )
}
