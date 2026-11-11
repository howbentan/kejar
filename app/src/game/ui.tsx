import type { ReactNode } from 'react'

/** The hand-drawn kejar logo (the j is a running figure), in volt on the dark screens. `size` is its height in px. */
export function Wordmark({ size = 64 }: { size?: number }) {
  return (
    <h1 className="wordmark" style={{ margin: 0, lineHeight: 0 }}>
      <img src="/logo-volt.png" alt="kejar." style={{ height: size * 1.25, width: 'auto', display: 'block' }} />
    </h1>
  )
}

/** The game mode next to a game code: CORE or FULL (rules doc §1). Older games without a mode are Core. */
export function ModeBadge({ mode }: { mode?: 'core' | 'full' }) {
  return (
    <span className="mono" style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--volt)', border: '1px solid var(--volt)', borderRadius: 6, padding: '3px 7px' }}>
      {(mode ?? 'core').toUpperCase()}
    </span>
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
