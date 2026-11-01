import * as m from 'motion/react-m'

/** An overshooting slam, shared by every stamp. */
export const SLAM_EASE = [0.34, 1.56, 0.64, 1] as const

/**
 * The stamp (motion design §4): lowercase Geist 800 with the logo's tight spacing, lime text and border,
 * slamming from 3× to 1× at −8°. `plate` sets it on a solid black plate so it reads over the Penjara bars (§5).
 * `small` is for long stamps (`CLAIMED · Station 12 ✓`), so they fit a 360 px phone.
 */
export default function Stamp({ text, plate = false, small = false }: { text: string; plate?: boolean; small?: boolean }) {
  return (
    <m.div
      className={['stamp', plate && 'stamp-plate', small && 'stamp-small'].filter(Boolean).join(' ')}
      initial={{ scale: 3, rotate: -8, opacity: 0 }}
      animate={{ scale: 1, rotate: -8, opacity: 1 }}
      transition={{ duration: 0.35, ease: SLAM_EASE }}
    >
      {text}
    </m.div>
  )
}
