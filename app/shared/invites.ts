/** Spec §4.3: a leaked or forgotten organiser invite stops working after 48 hours. */
export const ORGANISER_INVITE_TTL_MS = 48 * 60 * 60 * 1000
/** Spec §5: a marshal invite stops working after 6 hours, or when the game leaves lobby — whichever first. */
export const MARSHAL_INVITE_TTL_MS = 6 * 60 * 60 * 1000

export function isExpired(expiresAtIso: string, now: number): boolean {
  return now >= Date.parse(expiresAtIso)
}
