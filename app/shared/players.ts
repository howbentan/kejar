import type { Player } from './types.js'

/**
 * No longer free: jailed in Penjara, or disqualified for Luar Garisan. The one test every
 * "is anyone still free?" check uses, so the game-ending checks, results and counts can't drift apart.
 * The flag is optional on old rows and fixtures, so it is read as truthy.
 */
export function isOut(p: Player): boolean {
  return p.jailed || !!p.disqualified_at
}
