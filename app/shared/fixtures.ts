import { DEFAULT_SETTINGS, type Game, type GameEvent, type Ping, type Player, type Position, type Role } from './types.js'

/** Shared builders for tests. */
export const MIN = 60_000
export const T0 = Date.parse('2026-10-25T09:00:00Z')
export const iso = (ms: number) => new Date(ms).toISOString()

export function game(over: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    code: 'ABC234',
    arena: {
      id: 'test',
      name: 'Test park',
      boundary: [
        { lat: 3.0, lng: 101.0 },
        { lat: 3.0, lng: 101.01 },
        { lat: 3.01, lng: 101.01 },
        { lat: 3.01, lng: 101.0 },
      ],
      jail: { lat: 3.005, lng: 101.005 },
      start: { lat: 3.005, lng: 101.005 },
    },
    settings: { ...DEFAULT_SETTINGS },
    started_at: iso(T0),
    ended_at: null,
    winner: null,
    ...over,
  }
}

export function player(id: string, role: Role | null, over: Partial<Player> = {}): Player {
  return {
    id,
    game_id: 'g1',
    name: id,
    role,
    tag_id: null,
    accepted_at: iso(T0 - MIN),
    caught_at: null,
    caught_by: null,
    jailed: false,
    freed_once: false,
    push: null,
    ...over,
  }
}

export function pos(lat: number, lng: number, atMs: number): Position {
  return { lat, lng, accuracy_m: 10, at: iso(atMs) }
}

export function ping(seq: number, revealMs: number, over: Partial<Ping> = {}): Ping {
  return {
    game_id: 'g1',
    seq,
    alert_at: iso(revealMs - 30_000),
    reveal_at: iso(revealMs),
    alerted: true,
    revealed: true,
    ...over,
  }
}

export function event(type: GameEvent['type'], atMs: number, over: Partial<GameEvent> = {}): GameEvent {
  return { id: `${type}-${atMs}`, game_id: 'g1', at: iso(atMs), type, actor_id: null, target_id: null, data: {}, ...over }
}
