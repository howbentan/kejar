import { INFO } from './powerInfo'

/**
 * Home's tip line (home upgrades design): one short line from the game's own copy, the name in bold. Power-up tips
 * take their names from INFO so they never drift; the rule lines come from the how-to-play cards.
 */
export interface Tip {
  name: string
  rest: string
}

export const TIPS: Tip[] = [
  { name: INFO.cloak.name, rest: ' skips your next ping.' },
  { name: INFO.shield.name, rest: ' blocks the next catch, up to 10 min.' },
  { name: INFO.decoy.name, rest: ' makes your next ping show you elsewhere.' },
  { name: INFO.focus.name, rest: ' shows Dikejar within 75 m exactly.' },
  { name: INFO.flare.name, rest: ' calls an extra ping in 30 s.' },
  { name: INFO.grab.name, rest: ' shows the top 3 cards; keep one.' },
  { name: 'Tag ripped?', rest: ' Stop and walk to Penjara.' },
  { name: 'Penjara', rest: ' gives you one pull of the reel.' },
]

export function pickTip(rand: () => number): number {
  return Math.min(TIPS.length - 1, Math.floor(rand() * TIPS.length))
}
