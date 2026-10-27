import { loadSession } from './session'
import { loadOrganiserSession } from './organiserSession'

/** What identifies this phone to the server for a game: a player token, else this phone's organiser session. */
export function credentials(code: string): { token?: string; organiserToken?: string } {
  const s = loadSession(localStorage, code)
  if (s.token) return { token: s.token }
  const organiser = loadOrganiserSession(localStorage)
  return organiser ? { organiserToken: organiser.organiserToken } : {}
}
