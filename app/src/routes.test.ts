import { describe, expect, it } from 'vitest'
import { routeFor } from './routes'

describe('routeFor', () => {
  it('maps known paths to routes', () => {
    expect(routeFor('/')).toBe('home')
    expect(routeFor('/spike')).toBe('spike-join')
    expect(routeFor('/spike/')).toBe('spike-join')
    expect(routeFor('/spike/admin')).toBe('spike-admin')
    expect(routeFor('/spike/report')).toBe('spike-report')
  })

  it('returns not-found for unknown paths', () => {
    expect(routeFor('/nope')).toBe('not-found')
  })
})
