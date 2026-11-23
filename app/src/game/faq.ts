import type { PowerUpKind } from '../../shared/types.js'

/** The power-ups a FAQ covers: every deck card (not Sike, not the legendaries). */
export type FaqKind = Exclude<PowerUpKind, 'sike' | 'dato' | 'ring'>

/** Short plain answers for each deck card (playtest batch §2.10). The owner reviews the wording. */
export const FAQ: Record<FaqKind, { q: string; a: string }[]> = {
  decoy: [
    { q: 'Where do I show up?', a: 'Somewhere else in the play area, for your next ping only.' },
    { q: 'When does it work?', a: 'On your next ping after you use it. Then it is spent.' },
  ],
  shield: [
    { q: 'What does it block?', a: 'The next catch on you. The Kejar who tags you gets nothing.' },
    { q: 'How long does it last?', a: 'Up to 10 minutes, or until it blocks a catch.' },
  ],
  cloak: [
    { q: 'What happens at the next ping?', a: 'You are left off the map for that ping. Kejar see nothing for you.' },
    { q: 'Do I still check in?', a: 'Yes. Ponteng only hides you from the map.' },
  ],
  flare: [
    { q: 'What does it do?', a: 'Every Dikejar checks in 30 s after you use it, on top of the usual pings.' },
    { q: 'Can I use two in a row?', a: 'No. Wait 3 minutes after an extra ping before the next one.' },
  ],
  focus: [
    { q: 'Who shows exactly?', a: 'Dikejar within 75 m of you at the next ping. Everyone else stays fuzzy.' },
    { q: 'When does it work?', a: 'At the next ping after you use it.' },
  ],
  toyol: [
    { q: 'What does it take?', a: 'A random power-up from a random Kejar who has one.' },
    { q: 'Can it take a legendary?', a: 'No. Dato Seri and Super Ring are safe, and so is a card from Abang Grab.' },
  ],
  along: [
    { q: 'What does it take?', a: 'A random power-up from a random Dikejar who has one.' },
    { q: 'Can it take a legendary?', a: 'No. Dato Seri and Super Ring are safe, and so is a card from Abang Grab.' },
  ],
  grab: [
    { q: 'What do I see?', a: 'The top 3 cards of your side’s deck. Keep one.' },
    { q: 'Can it be stolen?', a: 'No. The card Abang Grab brings can’t be taken by Toyol or Ah Long.' },
  ],
  cheese: [
    { q: 'What does it freeze?', a: 'One Kejar’s power-up, for 3 minutes. You pick who.' },
    { q: 'Can they still play?', a: 'Yes. They just can’t use or claim power-ups until it thaws.' },
  ],
  combo: [
    { q: 'What works twice?', a: 'The next power-up you get. It comes with a second use.' },
    { q: 'Does a Sike use it up?', a: 'No. It waits for your next real card.' },
  ],
  toll: [
    { q: 'Who gets charged?', a: 'Dikejar who check in within 40 m of you show exactly.' },
    { q: 'How long is the gate up?', a: 'For the next ping after you use it.' },
  ],
}
