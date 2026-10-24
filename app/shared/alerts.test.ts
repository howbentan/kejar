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

  it('ignores everything that is not an alert', () => {
    expect(
      alertsFrom([event('ping', T0), event('caught', T0, { data: { flagged: false } }), event('paused', T0), event('joined', T0)]),
    ).toEqual([])
  })
})
