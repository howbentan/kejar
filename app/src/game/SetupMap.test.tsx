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
import SetupMap, { HiddenCard } from './SetupMap'

const lobby = (over: Parameters<typeof testView>[0] = {}) =>
  testView({ phase: 'lobby', settings: { ...DEFAULT_SETTINGS, mode: 'full' }, datoStash: null, ...over })

beforeEach(() => {
  call.mockReset()
  here.coords = { lat: 3.01, lng: 101.01, accuracy_m: 4 }
})
afterEach(cleanup)

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Organiser tools' }))

describe('SetupMap', () => {
  it('never shows the stash, even in a Full lobby with it dropped', () => {
    const datoStash = { lat: 3.02, lng: 101.02, claimedBy: null, claimedAt: null }
    render(<SetupMap view={lobby({ datoStash })} />)
    expect(mapProps.last?.stash ?? null).toBeNull()
    expect(document.body.textContent).not.toMatch(/dato|legendary|hidden/i)
  })
})

describe('HiddenCard: dropping Dato Seri', () => {
  it('is closed by default: no pin and no name, only a neutral toggle', () => {
    const datoStash = { lat: 3.02, lng: 101.02, claimedBy: null, claimedAt: null }
    mapProps.last = null
    render(<HiddenCard view={lobby({ datoStash })} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={() => {}} />)
    expect(mapProps.last).toBeNull()
    // Closed, it doesn't even say a hidden card exists (rules doc §9b).
    expect(document.body.textContent).toBe('Organiser tools')
    expect(screen.queryByRole('button', { name: 'Drop the ★ card here' })).toBeNull()
    open()
    expect((mapProps.last as { stash?: unknown } | null)?.stash).toEqual({ lat: 3.02, lng: 101.02 })
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('button', { name: 'Drop the ★ card here' })).toBeNull()
  })

  it('in a Full lobby, the organiser drops it at their current spot', async () => {
    call.mockResolvedValue({ ok: true })
    const refresh = vi.fn()
    render(<HiddenCard view={lobby()} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={refresh} />)
    open()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Drop the ★ card here' })))
    expect(call).toHaveBeenCalledWith('dropDatoSeri', { code: 'ABC234', organiserToken: 'h1', lat: 3.01, lng: 101.01, accuracy_m: 4 })
    expect(refresh).toHaveBeenCalled()
  })

  it('a marshal drops it with their own token', async () => {
    call.mockResolvedValue({ ok: true })
    render(<HiddenCard view={lobby()} code="ABC234" credentials={{ token: 'm1' }} refresh={() => {}} />)
    open()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Drop the ★ card here' })))
    expect(call).toHaveBeenCalledWith('dropDatoSeri', expect.objectContaining({ code: 'ABC234', token: 'm1' }))
  })

  it('shows the exact stash pin once dropped', () => {
    const datoStash = { lat: 3.02, lng: 101.02, claimedBy: null, claimedAt: null }
    render(<HiddenCard view={lobby({ datoStash })} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={() => {}} />)
    open()
    expect(mapProps.last?.stash).toEqual({ lat: 3.02, lng: 101.02 })
    expect(screen.getByText(/hidden at the yellow pin/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/dato/i)
  })

  it("opened, it links to a print page for this game's own card, with the code kept out of the server's logs", () => {
    render(<HiddenCard view={lobby({ datoCode: 'Zx9_q-4abc' })} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={() => {}} />)
    expect(screen.queryByRole('link', { name: 'Print the ★ card' })).toBeNull()
    open()
    expect(screen.getByRole('link', { name: 'Print the ★ card' })).toHaveAttribute('href', '/print/card#Zx9_q-4abc')
  })

  it('no print link when the game has no card code', () => {
    render(<HiddenCard view={lobby({ datoCode: null })} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={() => {}} />)
    open()
    expect(screen.queryByRole('link', { name: 'Print the ★ card' })).toBeNull()
  })

  it('without a location fix, says so and calls nothing', async () => {
    here.coords = {}
    render(<HiddenCard view={lobby()} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={() => {}} />)
    open()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Drop the ★ card here' })))
    expect(call).not.toHaveBeenCalled()
    expect(screen.getByText('Turn on location, then stand by the card and try again')).toBeInTheDocument()
  })

  it('a refusal shows the server message', async () => {
    call.mockRejectedValue(new Error('Drop it inside the play area'))
    render(<HiddenCard view={lobby()} code="ABC234" credentials={{ organiserToken: 'h1' }} refresh={() => {}} />)
    open()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Drop the ★ card here' })))
    expect(screen.getByText('Drop it inside the play area')).toBeInTheDocument()
  })

  it('not in Core, not after the start, and never for players', () => {
    const creds = { code: 'ABC234', credentials: { organiserToken: 'h1' }, refresh: () => {} }
    const toggle = () => screen.queryByRole('button', { name: 'Organiser tools' })
    const { rerender } = render(<HiddenCard view={lobby({ settings: { ...DEFAULT_SETTINGS, mode: 'core' } })} {...creds} />)
    expect(toggle()).toBeNull()
    rerender(<HiddenCard view={lobby({ phase: 'hiding' })} {...creds} />)
    expect(toggle()).toBeNull()
    rerender(<HiddenCard view={lobby({ datoStash: undefined })} {...creds} />)
    expect(toggle()).toBeNull()
  })
})
