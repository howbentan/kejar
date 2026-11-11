import { loadOrganiserSession } from './organiserSession'
import { loadSession } from './session'

/**
 * The game this phone was last in, for the home screen's `reconnect` button. One record: the newest
 * game touched wins, whether as a player or as the organiser.
 */
export type LastGameRole = 'player' | 'organiser'

const KEY = 'kejar.lastGame'
export const RECONNECT_MS = 24 * 60 * 60 * 1000

export function saveLastGame(storage: Storage, code: string, role: LastGameRole, now = Date.now()): void {
  try {
    storage.setItem(KEY, JSON.stringify({ code: code.toUpperCase(), role, at: now }))
  } catch {
    // Storage full or blocked: reconnect is a nicety, never worth breaking the join for.
  }
}

/** Where `reconnect` goes, or null when there is no recent game this phone can still get back into. */
export function reconnectHref(storage: Storage, now = Date.now()): string | null {
  let rec: unknown
  try {
    rec = JSON.parse(storage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
  if (!rec || typeof rec !== 'object') return null
  const { code, role, at } = rec as { code?: unknown; role?: unknown; at?: unknown }
  if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code)) return null
  if (typeof at !== 'number' || now - at > RECONNECT_MS || now < at - 60_000) return null
  if (role === 'player') return loadSession(storage, code).token ? `/g/${code}` : null
  if (role === 'organiser') return loadOrganiserSession(storage) ? `/host/${code}` : null
  return null
}
