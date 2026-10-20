import type { View } from '../../shared/views.js'
import { Screen } from '../game/ui'

/** Filled in by Task 9. */
export default function Results(_: { view: View; isHost: boolean }) {
  return <Screen eyebrow="Game over">{null}</Screen>
}
