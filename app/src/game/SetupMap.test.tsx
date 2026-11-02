import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/types.js'

const call = vi.hoisted(() => vi.fn())
const here = vi.hoisted(() => ({ coords: { lat: 3.01, lng: 101.01, accuracy_m: 4 } as Record<string, number> }))
const mapProps = vi.hoisted(() => ({ last: null as null | { stash?: unknown } }))
vi.mock('./api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('./here', () => ({ currentCoords: async () => here.coords }))
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

beforeEach(() => {
  call.mockReset()
  here.coords = { lat: 3.01, lng: 101.01, accuracy_m: 4 }
})
afterEach(cleanup)

describe('SetupMap: dropping Dato Seri', () => {
  it('in a Full lobby, the organiser drops it at their current spot', async () => {
    call.mockResolvedValue({ ok: true })
    const refresh = vi.fn()
    render(<SetupMap view={lobby()} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={refresh} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Drop Dato Seri here' })))
    expect(call).toHaveBeenCalledWith('dropDatoSeri', { code: 'ABC234', organiserToken: 'h1', lat: 3.01, lng: 101.01, accuracy_m: 4 })
    expect(refresh).toHaveBeenCalled()
  })

  it('a marshal drops it with their own token', async () => {
    call.mockResolvedValue({ ok: true })
    render(<SetupMap view={lobby()} code="ABC234" credentials={{ token: 'm1' }} refresh={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Drop Dato Seri here' })))
    expect(call).toHaveBeenCalledWith('dropDatoSeri', expect.objectContaining({ code: 'ABC234', token: 'm1' }))
  })

  it('shows the exact stash pin once dropped', () => {
    const datoStash = { lat: 3.02, lng: 101.02, claimedBy: null, claimedAt: null }
    render(<SetupMap view={lobby({ datoStash })} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={() => {}} />)
    expect(mapProps.last?.stash).toEqual({ lat: 3.02, lng: 101.02 })
    expect(screen.getByText(/hidden at the yellow pin/)).toBeInTheDocument()
  })

  it('without a location fix, says so and calls nothing', async () => {
    here.coords = {}
    render(<SetupMap view={lobby()} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Drop Dato Seri here' })))
    expect(call).not.toHaveBeenCalled()
    expect(screen.getByText('Turn on location, then stand by the card and try again')).toBeInTheDocument()
  })

  it('a refusal shows the server message', async () => {
    call.mockRejectedValue(new Error('Drop it inside the play area'))
    render(<SetupMap view={lobby()} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Drop Dato Seri here' })))
    expect(screen.getByText('Drop it inside the play area')).toBeInTheDocument()
  })

  it('not in Core, not after the start, and never without organiser or marshal access', () => {
    const creds = { code: 'ABC234', credentials: { organiserToken: 'h1' }, refresh: () => {} }
    const { rerender } = render(<SetupMap view={lobby({ settings: { ...DEFAULT_SETTINGS, mode: 'core' } })} {...creds} />)
    expect(screen.queryByRole('button', { name: 'Drop Dato Seri here' })).toBeNull()
    rerender(<SetupMap view={lobby({ phase: 'hiding' })} {...creds} />)
    expect(screen.queryByRole('button', { name: 'Drop Dato Seri here' })).toBeNull()
    rerender(<SetupMap view={lobby({ datoStash: undefined })} {...creds} />)
    expect(screen.queryByRole('button', { name: 'Drop Dato Seri here' })).toBeNull()
    rerender(<SetupMap view={lobby()} />)
    expect(screen.queryByRole('button', { name: 'Drop Dato Seri here' })).toBeNull()
  })
})
