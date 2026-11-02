import { POWER_NAME } from '../../shared/powerNames.js'
import type { PowerUpKind } from '../../shared/types.js'

/** Each power-up's Malaysian name and plain-English copy (power-ups design §5). */
export const INFO: Record<PowerUpKind, { name: string; effect: string; used: string }> = {
  decoy: { name: 'Gostan', effect: 'Your next ping shows you somewhere else', used: 'Gostan set for your next ping' },
  shield: { name: 'Durian', effect: 'Blocks the next catch, up to 10 min', used: 'Durian on for up to 10 min' },
  cloak: { name: 'Ponteng', effect: 'You skip the next ping', used: "Ponteng: you'll skip the next ping" },
  flare: { name: 'Mat Rempit', effect: 'Extra ping in 30 s', used: 'Mat Rempit! Dikejar check in now' },
  focus: { name: 'Pak Guard', effect: 'Dikejar within 75 m show exactly', used: 'Pak Guard on for the next ping' },
  toyol: { name: POWER_NAME.toyol, effect: 'Takes a random power-up from a Kejar', used: 'Toyol stole a power-up!' },
  along: { name: POWER_NAME.along, effect: 'Takes a random power-up from a Dikejar', used: 'Ah Long came to collect!' },
}
