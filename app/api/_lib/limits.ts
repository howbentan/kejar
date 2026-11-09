import { hashToken } from './secrets.js'

export const TOKEN_LIMIT_PER_MIN = 120
export const IP_LIMIT_PER_MIN = 60
/** Join and the invite redeems: a whole group can join at once from one mobile-carrier IP (lobbies cap at 40). */
export const IP_KEYED_LIMIT_PER_MIN = 200
export const LIMIT_WINDOW_MS = 60_000
/** Wrong guesses (401, 403, 404) allowed per IP per minute before the answer is a 429. */
export const FAIL_LIMIT_PER_MIN = 30

/** Actions that make a new player or session from nothing: a made-up token must not buy a fresh bucket. */
export const IP_KEYED_ACTIONS: readonly string[] = ['join', 'redeemOrganiserInvite', 'redeemMarshalInvite']

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/** Who a request counts against: its token (hashed, so the secret never lands in the table), else its IP. */
export function limitKey(action: string, body: Record<string, unknown>, ip: string | null): { key: string; limit: number } {
  // Their own bucket, so a group joining at once can't use up the IP's 60 for other tokenless requests.
  if (IP_KEYED_ACTIONS.includes(action)) return { key: `join-ip:${ip ?? 'unknown'}`, limit: IP_KEYED_LIMIT_PER_MIN }
  const token = nonEmpty(body.token) ? body.token : nonEmpty(body.organiserToken) ? body.organiserToken : null
  if (token) return { key: `tok:${hashToken(token)}`, limit: TOKEN_LIMIT_PER_MIN }
  return { key: `ip:${ip ?? 'unknown'}`, limit: IP_LIMIT_PER_MIN }
}
