/** One Tupperware slip as the organiser sees it (the token is secret, so it's only ever in organiser calls). */
export interface Slip {
  side: 'dikejar' | 'kejar'
  number: number
  token: string
  state: 'unused' | 'bound' | 'used'
}

/** The label printed on a slip: `Dikejar #04`. */
export const slipLabel = (s: Pick<Slip, 'side' | 'number'>) =>
  `${s.side === 'dikejar' ? 'Dikejar' : 'Kejar'} #${String(s.number).padStart(2, '0')}`

/** How many unused slips each side has left. A bound slip is dead, so it doesn't count. */
export function unusedCounts(slips: Slip[]) {
  const count = (side: Slip['side']) => slips.filter((s) => s.side === side && s.state === 'unused').length
  return { dikejar: count('dikejar'), kejar: count('kejar') }
}
