import { saveLastGame } from './lastGame'

export interface GameSession {
  token?: string
}

const key = (code: string) => `kejar.game.${code.toUpperCase()}`

export function loadSession(storage: Storage, code: string): GameSession {
  try {
    const raw = storage.getItem(key(code))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as GameSession) : {}
  } catch {
    return {}
  }
}

export function saveSession(storage: Storage, code: string, s: GameSession): void {
  storage.setItem(key(code), JSON.stringify({ ...loadSession(storage, code), ...s }))
  // Every way a player gets into a game (join, marshal invite, phone move) saves its token here.
  if (s.token) saveLastGame(storage, code, 'player')
}
