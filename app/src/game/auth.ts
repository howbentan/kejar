import { loadSession } from './session'

/** What identifies this phone to the server for a game: a player token, else the organiser key. */
export function credentials(code: string): { token?: string; hostKey?: string } {
  const s = loadSession(localStorage, code)
  if (s.token) return { token: s.token }
  return s.hostKey ? { hostKey: s.hostKey } : {}
}
