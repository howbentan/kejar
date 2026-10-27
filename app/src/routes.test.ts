import { describe, expect, it } from 'vitest'
import { routeFor } from './routes'

describe('routeFor', () => {
  it('maps the spike pages', () => {
    expect(routeFor('/spike')).toEqual({ route: 'spike-join' })
    expect(routeFor('/spike/')).toEqual({ route: 'spike-join' })
    expect(routeFor('/spike/admin')).toEqual({ route: 'spike-admin' })
    expect(routeFor('/spike/report')).toEqual({ route: 'spike-report' })
  })

  it('maps the game pages with their codes', () => {
    expect(routeFor('/')).toEqual({ route: 'home' })
    expect(routeFor('/host/new')).toEqual({ route: 'host-new' })
    expect(routeFor('/host/ABC234')).toEqual({ route: 'host-lobby', code: 'ABC234' })
    expect(routeFor('/g/abc234')).toEqual({ route: 'game', code: 'ABC234' })
    expect(routeFor('/join/ABC234/')).toEqual({ route: 'join', code: 'ABC234' })
    expect(routeFor('/print/tags')).toEqual({ route: 'print-tags' })
  })

  it('returns not-found for unknown paths', () => {
    expect(routeFor('/nope')).toEqual({ route: 'not-found' })
    expect(routeFor('/g/')).toEqual({ route: 'not-found' })
  })

  it('maps an organiser invite link, keeping the token case-sensitive', () => {
    expect(routeFor('/organiser/AbC-123_xyz')).toEqual({ route: 'organiser-redeem', token: 'AbC-123_xyz' })
  })

  it('maps a marshal invite link, uppercasing the code but not the token', () => {
    expect(routeFor('/m/abc234/XyZ-9_tok')).toEqual({ route: 'marshal-redeem', code: 'ABC234', token: 'XyZ-9_tok' })
  })
})
