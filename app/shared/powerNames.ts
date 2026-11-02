import type { PowerUpKind } from './types.js'

/** Each power-up's Malaysian name. Shared so the server-built feed can name a card the same way the cards do. */
export const POWER_NAME: Record<PowerUpKind, string> = {
  decoy: 'Gostan',
  shield: 'Durian',
  cloak: 'Ponteng',
  flare: 'Mat Rempit',
  focus: 'Pak Guard',
  toyol: 'Toyol',
  along: 'Ah Long',
  grab: 'Abang Grab',
  dato: 'Dato Seri',
}
