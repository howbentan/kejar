export interface GameSession {
  token?: string
}

const key = (code: string) => `kejar.game.${code.toUpperCase()}`

export function loadSession(storage: Storage, code: string): GameSession {
  try {
    const raw = storage.getItem(key(code))
    return raw ? (JSON.parse(raw) as GameSession) : {}
  } catch {
    return {}
  }
}

export function saveSession(storage: Storage, code: string, s: GameSession): void {
  storage.setItem(key(code), JSON.stringify({ ...loadSession(storage, code), ...s }))
}
