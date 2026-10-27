export interface OrganiserSession {
  organiserToken: string
  name: string
}

const KEY = 'kejar.organiser'

/** Unlike GameSession, this is global — one organiser session covers every game on this phone. */
export function loadOrganiserSession(storage: Storage): OrganiserSession | null {
  try {
    const raw = storage.getItem(KEY)
    return raw ? (JSON.parse(raw) as OrganiserSession) : null
  } catch {
    return null
  }
}

export function saveOrganiserSession(storage: Storage, s: OrganiserSession): void {
  storage.setItem(KEY, JSON.stringify(s))
}

export function clearOrganiserSession(storage: Storage): void {
  storage.removeItem(KEY)
}
