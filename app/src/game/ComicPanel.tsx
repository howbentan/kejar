import { Children, type ReactNode } from 'react'

/**
 * A comic panel on the map (design 2026-11-24 §3): thick black border, a white outline, the state's colour with
 * halftone dots, a slight tilt and a hard shadow, a tilted caption, an icon, a title in Kejar Hand and one live line.
 * `big` is the endgame's; the rest are the smaller state panels. Tappable when `onClick` is given.
 */
export default function ComicPanel(props: {
  colour: string
  ink: string
  caption: string
  icon: ReactNode
  title: string
  line?: string
  fx?: 'speed' | 'frost' | 'drip'
  big?: boolean
  label?: string
  /** Read out at once (role alert), for a warning that needs acting on. */
  alert?: boolean
  onClick?: () => void
}) {
  const { colour, ink, caption, icon, title, line, fx, big, label, alert, onClick } = props
  const body = (
    <span className={`comic-frame${fx ? ` comic-${fx}` : ''}`} style={{ ['--c' as string]: colour, ['--ink' as string]: ink }}>
      <span className="comic-cap">{caption}</span>
      <span className="comic-icon">{icon}</span>
      <span className="comic-title">{title}</span>
      {line && <span className="comic-line">{line}</span>}
    </span>
  )
  const cls = `comic${big ? ' comic-big' : ''}`
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={label}>
      {body}
    </button>
  ) : (
    <div className={cls} role={alert ? 'alert' : 'status'} aria-label={label}>
      {body}
    </div>
  )
}

/** The panels stack top left, three at most; the rest are counted in a "+N more" tag. */
export const MAX_PANELS = 3
export function PanelStack({ children }: { children: ReactNode }) {
  const all = Children.toArray(children)
  if (!all.length) return null
  return (
    <div className="comic-stack">
      {all.slice(0, MAX_PANELS)}
      {all.length > MAX_PANELS && <span className="comic-more">{`+${all.length - MAX_PANELS} more`}</span>}
    </div>
  )
}
