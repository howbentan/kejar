import { describe, expect, it } from 'vitest'
import { testView } from '../screens/testView'
import { startsIn, statusFrom, statusLine } from './homeStatus'

const NOW = 1_000_000
const arena = { ...testView().arena, name: 'Taman Tasik' }

describe('home status', () => {
  it('a lobby game with a start time: back to the lobby, and the time to start corrected for a fast phone clock', () => {
    const startsAt = new Date(NOW + 270_000).toISOString()
    const view = testView({ phase: 'lobby', now: NOW, endsAt: null, arena, settings: { ...testView().settings, startsAt } })
    const phoneNow = NOW + 3 * 60_000 // the phone is 3 minutes fast
    const s = statusFrom('ABC234', view, phoneNow)
    expect(startsIn(s, phoneNow)).toBe(270_000)
    expect(statusLine(s, phoneNow)).toEqual({ title: 'back to the lobby', detail: 'ABC234 · Taman Tasik · lobby', live: false })
  })

  it('chasing shows minutes left and is live', () => {
    const view = testView({ phase: 'chasing', now: NOW, endsAt: NOW + 11.5 * 60_000, arena })
    const s = statusFrom('ABC234', view, NOW)
    expect(statusLine(s, NOW)).toEqual({ title: 'reconnect', detail: 'ABC234 · Taman Tasik · chasing · 12 min left', live: true })
    expect(startsIn(s, NOW)).toBeNull()
  })

  it('paused wins over the phase and is not live', () => {
    const s = statusFrom('ABC234', testView({ phase: 'chasing', paused: true, now: NOW, endsAt: NOW + 600_000, arena }), NOW)
    expect(statusLine(s, NOW)).toEqual({ title: 'reconnect', detail: 'ABC234 · Taman Tasik · paused', live: false })
  })

  it('ended reads see results', () => {
    const s = statusFrom('ABC234', testView({ phase: 'ended', now: NOW, arena }), NOW)
    expect(statusLine(s, NOW).title).toBe('see results')
    expect(statusLine(s, NOW).detail).toBe('ABC234 · Taman Tasik · ended')
  })

  it('hiding shows no time and is live', () => {
    const s = statusFrom('ABC234', testView({ phase: 'hiding', now: NOW, endsAt: NOW + 3_000_000, arena }), NOW)
    expect(statusLine(s, NOW)).toEqual({ title: 'reconnect', detail: 'ABC234 · Taman Tasik · hiding', live: true })
  })

  it('players only when the roster is non-empty', () => {
    const roster = [{ id: 'a' }, { id: 'b' }] as never
    const withRoster = statusFrom('ABC234', testView({ phase: 'lobby', now: NOW, arena, roster }), NOW)
    expect(statusLine(withRoster, NOW).detail).toBe('ABC234 · Taman Tasik · lobby · 2 players')
    expect(statusFrom('ABC234', testView({ phase: 'lobby', now: NOW, arena, roster: [] }), NOW).players).toBeNull()
  })
})
