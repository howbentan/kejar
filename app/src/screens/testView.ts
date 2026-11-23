import { game, iso, MIN, player, T0 } from '../../shared/fixtures.js'
import { DEFAULT_SETTINGS } from '../../shared/types.js'
import { viewFor, type View } from '../../shared/views.js'

/** A minimal View for screen tests. */
export function testView(over: Partial<View> = {}): View {
  return {
    phase: 'chasing',
    endsAt: 1_000_000,
    now: 100_000,
    paused: false,
    alerts: [],
    sosPositions: {},
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
      freed_at: null,
      push: null,
      removed_at: null,
      outside: false,
      left_start: false,
      reel_pulled_at: null,
      brief_opened_at: null,
      brief_ready_at: null,
    },
    arena: { id: 'a', name: 'Test', boundary: [], jail: { lat: 3, lng: 101 }, start: { lat: 3, lng: 101 } },
    settings: { ...DEFAULT_SETTINGS },
    dots: [],
    nextRevealAt: null,
    nextAlertAt: null,
    lastRevealAt: null,
    chaserNearby: false,
    sideQuest: false,
    caughtBy: null,
    outWarned: false,
    jailReason: null,
    activeEndsAt: null,
    flareReadyAt: null,
    jailCheckins: null,
    checkin: null,
    chaserSnapshot: null,
    snapshotted: false,
    endgame: null,
    endgameOn: false,
    feed: [],
    counts: { runnersFree: 3, runnersJailed: 0, runnersLuarGarisan: 0, chasers: 1 },
    roster: [],
    reports: [],
    ratings: [],
    stations: [],
    hand: [],
    deal: null,
    deckLeft: null,
    activePowerUp: null,
    shieldActive: false,
    settle: null,
    rescue: null,
    fiveLeft: false,
    reel: null,
    freezeTargets: null,
    frozenUntil: null,
    arrest: null,
    hijau: null,
    penjaraLockedUntil: null,
    comboReady: false,
    tollGates: [],
    briefing: null,
    results: null,
    ...over,
  }
}

/**
 * A rescue exactly as the server's view sends it at testView's clock (100 000 ms): `banked` ms held in earlier
 * stretches, plus a thumb that went down `stretch` ms ago and is still beating. Built through `viewFor`, so a screen is
 * tested on the real shape and can't count the live stretch twice. `by` holds the key; `name` is theirs.
 */
export function viewedRescue(banked: number, stretch: number, by = 'r3', name = 'Hafiz'): NonNullable<View['rescue']> {
  const now = T0 + 16 * MIN
  const since = iso(now - stretch)
  const rescue = { by, startedAt: since, heldMs: banked, holdSince: since, lastBeat: iso(now), releasedAt: null }
  const me = player('r1', 'runner', { name: 'Aina' })
  const players = [me, player(by, 'runner', { name }), player('c1', 'chaser')]
  const v = viewFor({ game: game({ rescue }), me, players, positions: {}, pings: [], events: [], now, results: null, powerUps: [] })
  // The view's times, moved onto testView's clock.
  const shift = (t: number | null) => (t === null ? null : t - now + 100_000)
  return { ...v.rescue!, holdSince: shift(v.rescue!.holdSince), resetAt: shift(v.rescue!.resetAt) }
}
