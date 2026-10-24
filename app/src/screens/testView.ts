import { DEFAULT_SETTINGS } from '../../shared/types.js'
import type { View } from '../../shared/views.js'

/** A minimal View for screen tests. */
export function testView(over: Partial<View> = {}): View {
  return {
    phase: 'chasing',
    endsAt: 1_000_000,
    now: 100_000,
    paused: false,
    alerts: [],
    reportable: [],
    me: {
      id: 'r1',
      game_id: 'g1',
      name: 'Aina',
      role: 'runner',
      tag_id: 7,
      accepted_at: '',
      caught_at: null,
      caught_by: null,
      jailed: false,
      freed_once: false,
      push: null,
      removed_at: null,
      outside: false,
      left_start: false,
    },
    arena: { id: 'a', name: 'Test', boundary: [], jail: { lat: 3, lng: 101 }, start: { lat: 3, lng: 101 } },
    settings: { ...DEFAULT_SETTINGS },
    dots: [],
    nextRevealAt: null,
    nextAlertAt: null,
    lastRevealAt: null,
    chaserNearby: false,
    caughtBy: null,
    feed: [],
    counts: { runnersFree: 3, runnersJailed: 0, chasers: 1 },
    roster: [],
    stations: [],
    hand: [],
    shieldActive: false,
    results: null,
    ...over,
  }
}
