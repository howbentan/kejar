import { describe, expect, it } from 'vitest'
import { alertsFrom, who } from './alerts.js'
import { event, MIN, player, T0 } from './fixtures.js'

describe('who', () => {
  it('adds the tag for a runner who has one', () => {
    expect(who(player('r1', 'runner', { name: 'Aina', tag_id: 7 }))).toBe('Aina #07')
    expect(who(player('c1', 'chaser', { name: 'Ben' }))).toBe('Ben')
  })
})

describe('alertsFrom', () => {
  const texts = (events: Parameters<typeof alertsFrom>[0]) => alertsFrom(events).map((a) => a.text)

  it('words every kind exactly', () => {
    expect(
      texts([
        event('sos', T0 + 1 * MIN, { data: { who: 'Aina #07', lat: 3, lng: 101 } }),
        event('report', T0 + 2 * MIN, { data: { name: 'Hafiz', targetName: 'Ben', reason: 'unsafe', note: '' } }),
        event('outside', T0 + 3 * MIN, { data: { who: 'Aina #07' } }),
        event('missed', T0 + 4 * MIN, { data: { who: 'Wei #14' } }),
        event('left-start', T0 + 5 * MIN, { data: { name: 'Ben' } }),
        event('caught', T0 + 6 * MIN, { data: { flagged: true, who: '#07', chaser: 'Ben' } }),
      ]),
    ).toEqual([
      'Check catch: #07 by Ben (position unknown)',
      'Ben left the start early',
      'Wei #14 missed 2 check-ins',
      'Aina #07 left the play area',
      'Hafiz reported Ben: Unsafe play',
      'SOS from Aina #07',
    ])
  })

  it('a catch on an old runner location is a Check catch even when not flagged', () => {
    expect(
      texts([event('caught', T0, { data: { flagged: false, oldRunnerFix: true, who: '#07', chaser: 'Ben' } })]),
    ).toEqual(['Check catch: #07 by Ben (runner location old)'])
  })

  it('appends a report note after a dash', () => {
    expect(
      texts([event('report', T0, { data: { name: 'Hafiz', targetName: 'Ben', reason: 'dispute', note: 'tag was already off' } })]),
    ).toEqual(['Hafiz reported Ben: Catch dispute — tag was already off'])
  })

  it('keeps the location of SOS and reports', () => {
    const [a] = alertsFrom([event('sos', T0, { data: { who: 'Aina', lat: 3.1, lng: 101.2 } })])
    expect(a).toMatchObject({ kind: 'sos', where: { lat: 3.1, lng: 101.2 }, handled: false })
    const [b] = alertsFrom([event('sos', T0, { data: { who: 'Aina', lat: null, lng: null } })])
    expect(b.where).toBeNull()
  })

  it('sinks handled alerts below open ones', () => {
    const sos = event('sos', T0 + 1 * MIN, { id: 'e1', data: { who: 'Aina' } })
    const out = event('outside', T0 + 2 * MIN, { id: 'e2', data: { who: 'Wei' } })
    const handled = event('handled', T0 + 3 * MIN, { data: { eventId: 'e2' } })
    const a = alertsFrom([sos, out, handled])
    expect(a.map((x) => [x.id, x.handled])).toEqual([
      ['e1', false],
      ['e2', true],
    ])
  })

  it('resolves the outcome from the matching handled event', () => {
    const sos = event('sos', T0 + 1 * MIN, { id: 'e1', data: { who: 'Aina' } })
    const handled = event('handled', T0 + 2 * MIN, { data: { eventId: 'e1', outcome: 'sorted' } })
    const [a] = alertsFrom([sos, handled])
    expect(a).toMatchObject({ handled: true, outcome: 'sorted' })
  })

  it('defaults outcome to null when the alert is open or handled without one', () => {
    const [open] = alertsFrom([event('sos', T0, { id: 'e1', data: { who: 'Aina' } })])
    expect(open.outcome).toBeNull()
    const sos = event('sos', T0 + 1 * MIN, { id: 'e2', data: { who: 'Wei' } })
    const handled = event('handled', T0 + 2 * MIN, { data: { eventId: 'e2' } })
    const [closed] = alertsFrom([sos, handled])
    expect(closed.outcome).toBeNull()
  })

  it('resolves who closed it from the handled event, newest wins, and null while open or unnamed', () => {
    const sos = event('sos', T0 + 1 * MIN, { id: 'e1', data: { who: 'Aina' } })
    expect(alertsFrom([sos])[0].closedByName).toBeNull()
    expect(alertsFrom([sos, event('handled', T0 + 2 * MIN, { data: { eventId: 'e1' } })])[0].closedByName).toBeNull()
    const [a] = alertsFrom([
      sos,
      event('handled', T0 + 2 * MIN, { data: { eventId: 'e1', name: 'Siti' } }),
      event('handled', T0 + 3 * MIN, { data: { eventId: 'e1', name: 'Owner' } }),
    ])
    expect(a.closedByName).toBe('Owner')
  })

  it('ignores everything that is not an alert', () => {
    expect(
      alertsFrom([event('ping', T0), event('caught', T0, { data: { flagged: false } }), event('paused', T0), event('joined', T0)]),
    ).toEqual([])
  })
})

describe('SOS details', () => {
  const sos = event('sos', T0 + MIN, { actor_id: 'r1', data: { who: 'Aina #07', lat: 3, lng: 101 } })
  const details = (data: Record<string, unknown>, atMs = T0 + 1.2 * MIN) =>
    event('sos-details', atMs, { actor_id: 'r1', data: { sosId: sos.id, ...data } })

  it('folds the reason and who into the SOS text', () => {
    expect(alertsFrom([sos, details({ reason: 'dispute', withName: 'Ben' })]).map((a) => a.text)).toEqual(['SOS from Aina #07: Catch dispute with Ben'])
  })
  it('leaves out "with" when there is no one', () => {
    expect(alertsFrom([sos, details({ reason: 'hurt', withName: null })]).map((a) => a.text)).toEqual(['SOS from Aina #07: Hurt'])
  })
  it('uses the latest details for that SOS', () => {
    const texts = alertsFrom([sos, details({ reason: 'lost' }), details({ reason: 'hurt' }, T0 + 1.5 * MIN)]).map((a) => a.text)
    expect(texts).toEqual(['SOS from Aina #07: Hurt'])
  })
})

describe('SOS responding', () => {
  it('a marshal tapping "I\'m going" shows on the alert for everyone', () => {
    const events = [event('sos', T0, { id: 'e1', data: { who: 'Aina #07' } }), event('sos-responding', T0 + MIN, { data: { sosId: 'e1', name: 'Hafiz' } })]
    const alert = alertsFrom(events).find((a) => a.id === 'e1')
    expect(alert?.respondingName).toBe('Hafiz')
  })

  it('defaults to null when nobody has responded', () => {
    const [a] = alertsFrom([event('sos', T0, { id: 'e1', data: { who: 'Aina #07' } })])
    expect(a.respondingName).toBeNull()
  })

  it('uses the latest responder for that SOS', () => {
    const events = [
      event('sos', T0, { id: 'e1', data: { who: 'Aina #07' } }),
      event('sos-responding', T0 + MIN, { data: { sosId: 'e1', name: 'Hafiz' } }),
      event('sos-responding', T0 + 2 * MIN, { data: { sosId: 'e1', name: 'Siti' } }),
    ]
    const alert = alertsFrom(events).find((a) => a.id === 'e1')
    expect(alert?.respondingName).toBe('Siti')
  })
})

describe('auto-jail alert', () => {
  it('has its own kind and names the runner it is about', () => {
    const [a] = alertsFrom([event('auto-jailed', T0 + 15 * MIN, { target_id: 'r2', data: { who: 'Hafiz #03' } })])
    expect(a.kind).toBe('auto-jail')
    expect(a.targetId).toBe('r2')
    expect(alertsFrom([event('outside', T0 + MIN, { data: { who: 'Aina #07' } })])[0].targetId).toBeNull()
  })
  it('reads as missed and sent to Penjara', () => {
    expect(alertsFrom([event('auto-jailed', T0 + 15 * MIN, { target_id: 'r2', data: { who: 'Hafiz #03' } })]).map((a) => a.text)).toEqual([
      'Hafiz #03 missed 2 check-ins — sent to Penjara',
    ])
  })
})

describe('luar-garisan alert', () => {
  it('words it for marshals', () => {
    const [a] = alertsFrom([event('luar-garisan', T0, { actor_id: 'r1', data: { who: 'Aina #07' } })])
    expect(a).toMatchObject({ kind: 'luar-garisan', text: 'Aina #07 is Luar Garisan (left the play area twice)', handled: false })
  })
})
