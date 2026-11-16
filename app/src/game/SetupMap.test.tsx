import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/types.js'

const mapProps = vi.hoisted(() => ({ last: null as null | { stash?: unknown } }))
vi.mock('./Map', () => ({
  default: (p: { stash?: unknown }) => {
    mapProps.last = p
    return null
  },
}))

import { testView } from '../screens/testView'
import SetupMap from './SetupMap'

const lobby = (over: Parameters<typeof testView>[0] = {}) =>
  testView({ phase: 'lobby', settings: { ...DEFAULT_SETTINGS, mode: 'full' }, datoStash: null, ...over })

afterEach(cleanup)

describe('SetupMap', () => {
  it('never shows the stash, even in a Full lobby with it dropped', () => {
    const datoStash = { lat: 3.02, lng: 101.02, claimedBy: null, claimedAt: null }
    render(<SetupMap view={lobby({ datoStash })} />)
    expect(mapProps.last?.stash ?? null).toBeNull()
    expect(document.body.textContent).not.toMatch(/dato|legendary|hidden/i)
  })
})
