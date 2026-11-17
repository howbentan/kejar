import type { View } from '../../../shared/views.js'
import RescueLock, { type RescueLockMode } from './RescueLock'
import { heldAt, resetsIn, secondsToHold, useRescueNow } from './rescueTime'

/**
 * What a runner in Penjara sees while someone breaks them out (rules §9a): the same lock as the rescuer's, turned by
 * the server's held time, with who is holding it and whether they let go. No button and no sounds: one phone making
 * noise at the gate is enough. Paused, it holds still at the server's moment.
 */
export default function RescueWatch({ view }: { view: View }) {
  const rescue = view.rescue
  const now = useRescueNow(view.now, view.paused, !!rescue?.holdSince)
  if (!rescue) return null
  const name = rescue.byName ?? 'A Dikejar'
  const held = heldAt(rescue, now)
  const mode: RescueLockMode = rescue.holdSince !== null ? 'holding' : held > 0 ? 'paused' : 'idle'
  const line =
    mode === 'holding'
      ? `Every 5 s that ${name} holds is one click.`
      : mode === 'paused'
        ? `Resets in ${resetsIn(rescue.resetAt, now)}. ${name} has to hold again.`
        : `${name} has to hold the key for 20 s.`
  return (
    <section aria-label="Rescue" className="rescue-watch">
      <p className="rescue-big">{mode === 'paused' ? `${name} let go` : `${name} is breaking you out`}</p>
      <RescueLock heldMs={held} mode={mode} size={190} />
      <div className={`rescue-count${mode === 'paused' ? ' dim' : ''}`} role="timer" aria-label="Seconds left to hold">
        {secondsToHold(held)}
        <small>s</small>
      </div>
      <p className="rescue-line">{line}</p>
    </section>
  )
}
