import { hashToken } from './secrets.js'

export const TOKEN_LIMIT_PER_MIN = 120
export const IP_LIMIT_PER_MIN = 60
export const LIMIT_WINDOW_MS = 60_000

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/** Who a request counts against: its token (hashed, so the secret never lands in the table), else its IP. */
export function limitKey(body: Record<string, unknown>, ip: string | null): { key: string; limit: number } {
  const token = nonEmpty(body.token) ? body.token : nonEmpty(body.organiserToken) ? body.organiserToken : null
  if (token) return { key: `tok:${hashToken(token)}`, limit: TOKEN_LIMIT_PER_MIN }
  return { key: `ip:${ip ?? 'unknown'}`, limit: IP_LIMIT_PER_MIN }
}
