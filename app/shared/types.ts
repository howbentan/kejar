export type Role = 'runner' | 'chaser' | 'marshal'
export type Phase = 'lobby' | 'hiding' | 'chasing' | 'ended'
export type CheckinMode = 'push' | 'schedule'

export interface LatLng {
  lat: number
  lng: number
}

/** A reported location; `at` is the server time it was received (ISO). */
export interface Position extends LatLng {
  accuracy_m: number
  at: string
}

export interface Settings {
  lengthMin: number
  hideMin: number
  pingMin: 2 | 3 | 5
  spectatorDelayMin: number
  checkinMode: CheckinMode
}

/** Spec §4.3 defaults. */
export const DEFAULT_SETTINGS: Settings = {
  lengthMin: 45,
  hideMin: 5,
  pingMin: 5,
  spectatorDelayMin: 2,
  checkinMode: 'push',
}

export interface Arena {
  id: string
  name: string
  boundary: LatLng[]
  jail: LatLng
  start: LatLng
  /** Power-up stations; index i is station i + 1. */
  stations?: LatLng[]
}

export interface Game {
  id: string
  code: string
  arena: Arena
  settings: Settings
  started_at: string | null
  ended_at: string | null
  winner: 'runners' | 'chasers' | null
}

export interface Player {
  id: string
  game_id: string
  name: string
  role: Role | null
  tag_id: number | null
  accepted_at: string
  caught_at: string | null
  caught_by: string | null
  jailed: boolean
  freed_once: boolean
  push: PushSubscriptionJSON | null
}

export interface Ping {
  game_id: string
  seq: number
  alert_at: string
  reveal_at: string
  alerted: boolean
  revealed: boolean
}

export type EventType =
  | 'joined'
  | 'roles'
  | 'started'
  | 'chase'
  | 'ping'
  | 'caught'
  | 'jailbreak'
  | 'ended'
  | 'powerup'
  | 'used'
  | 'shielded'

export type PowerUpKind = 'decoy' | 'shield' | 'cloak' | 'flare' | 'focus'

export interface PowerUp {
  id: string
  game_id: string
  player_id: string
  kind: PowerUpKind
  station: number
  claimed_at: string
  used_at: string | null
  consumed_at: string | null
}

export interface GameEvent {
  id: string
  game_id: string
  at: string
  type: EventType
  actor_id: string | null
  target_id: string | null
  data: Record<string, unknown>
}

export interface Results {
  winner: 'runners' | 'chasers'
  survivors: string[]
  longestSurvivor: { id: string; ms: number } | null
  mostCatches: { id: string; count: number } | null
  jailbreakHero: { id: string; freed: number } | null
}
