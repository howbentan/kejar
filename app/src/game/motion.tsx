import { domAnimation, LazyMotion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Motion for the whole app (motion design §3): LazyMotion keeps the first load small (use the `m`
 * components from 'motion/react-m'), and reducedMotion="user" drops movement for players who ask
 * their phone for less of it.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
