/** Doodled icons for the comic panels that have no power-up sticker (design 2026-11-24 §3). */
const ink = '#0A0A0B'

export const BangIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <g fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round">
      <path d="M14 6 L13 26" />
      <path d="M27 6 L26 26" />
    </g>
    <circle cx="13" cy="33" r="2.8" fill={ink} />
    <circle cx="26" cy="33" r="2.8" fill={ink} />
  </svg>
)

export const ClockIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <g fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round">
      <path d="M20 5.5 C29 6 35 12.6 34.6 21 C34.2 29.4 27.6 35 19.6 34.6 C11.4 34.2 5.4 27.6 5.8 19.6 C6.2 11.8 12.4 5.6 21 6" />
      <path d="M20 12 V21 L26 24" />
    </g>
  </svg>
)

export const BackIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <g fill="none" stroke={ink} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 30 C32 18 24 14 12 14" />
      <path d="M17 8 L11 14 L17 20" />
    </g>
  </svg>
)

export const DropIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 5 C26 14 31 19 31 25 C31 31 26 35 20 35 C14 35 9 31 9 25 C9 19 14 14 20 5 Z" fill="#F5F5F3" stroke={ink} strokeWidth="3" strokeLinejoin="round" />
    <path d="M14 25 C14 28 16 30 19 30" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)

export const CameraIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <g fill="none" stroke={ink} strokeWidth="3" strokeLinejoin="round">
      <path d="M6 13 H14 L16.5 8.5 H24 L26.5 13 H34 V31 H6 Z" />
      <circle cx="20" cy="21.5" r="5.5" />
    </g>
  </svg>
)

export const KeyIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <g fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="20" r="6.5" />
      <path d="M19.5 20 H34 M28 20 V26 M33 20 V24" />
    </g>
  </svg>
)
