import type { View } from '../../shared/views.js'
import { Screen } from '../game/ui'

/** Filled in by Task 9. */
export function BreakOut(_: { code: string; view: View }) {
  return null
}

export default function Jail(_: { code: string; view: View }) {
  return <Screen eyebrow="In jail">{null}</Screen>
}
