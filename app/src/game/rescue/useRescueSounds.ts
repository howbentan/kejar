import { useEffect, useRef } from 'react'
import { keyTurn } from '../../../shared/penjara'
import { playKeyClick, playKeyLetGo, playKeyUnlock, playRescueReset } from '../sounds'
import type { RescueLockMode } from './RescueLock'

/**
 * The key's sounds, from where the lock is: a click as each of notches 1 to 3 is reached, the unlock when it opens, a
 * soft tick on let-go and the spin-back when the held time drops to nothing (a reset). Only changes make a sound, so
 * a screen that mounts mid-rescue (a reload) stays quiet about what already happened, and a notch is never clicked
 * twice when the count steps back a little between polls. The fourth notch makes no click: the unlock plays once the
 * server says it opened. `on` is false on every phone but the rescuer's (one phone making noise at the gate is
 * enough). The sounds themselves honour the mute switch.
 */
export function useRescueSounds(heldMs: number, mode: RescueLockMode, on = true): void {
  const { notch } = keyTurn(heldMs)
  const empty = heldMs <= 0
  const last = useRef({ notch, mode, empty, clicked: notch })
  useEffect(() => {
    const was = last.current
    last.current = { notch, mode, empty, clicked: empty ? 0 : Math.max(was.clicked, notch) }
    if (!on) return
    if (mode === 'open') {
      if (was.mode !== 'open') playKeyUnlock()
      return
    }
    if (notch > was.clicked && notch >= 1 && notch <= 3) playKeyClick(notch as 1 | 2 | 3)
    if (was.mode === 'holding' && mode === 'paused') playKeyLetGo()
    if (!was.empty && empty && mode !== 'snapped') playRescueReset()
  }, [notch, mode, empty, on])
}
