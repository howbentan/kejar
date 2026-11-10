import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { View } from '../../shared/views.js'

const mapCalls = vi.hoisted(() => [] as { pins?: { id: string; label?: string; state?: string }[]; route?: unknown; fit?: unknown }[])
const call = vi.hoisted(() => vi.fn())
vi.mock('../game/Map', () => ({
  default: (props: (typeof mapCalls)[number]) => {
    mapCalls.push(props)
    return <div data-testid="map" />
  },
}))
vi.mock('../game/api', () => ({ call }))

import WalkPark, { WALK_HERE_M } from './WalkPark'

const M_LAT = 111_195
const M_LNG = 111_195 * Math.cos((3 * Math.PI) / 180)
const BASE = { lat: 3.0, lng: 101.0 }
const at = (p: { lat: number; lng: number }, north = 0, east = 0) => ({
  coords: { latitude: p.lat + north / M_LAT, longitude: p.lng + east / M_LNG, accuracy: 5 },
})

const arena = { id: 'a', name: 'Park', boundary: [], start: BASE, jail: BASE }
const S1 = { id: 'station-1', label: 'Station 1', ...BASE }
const S2 = { id: 'station-2', label: 'Station 2', lat: 3.0, lng: 101.002 }
const PEN = { id: 'penjara', label: 'Penjara', lat: 3.001, lng: 101.0 }
const DATO = { id: 'dato', label: 'Yellow card', lat: 3.002, lng: 101.0, tone: 'yellow' as const }

const view = (places: object[], placed: Record<string, boolean> = {}, extra: object = {}) =>
  ({ arena, kit: { items: [], places, placed }, ...extra }) as unknown as View

let onFix: ((p: unknown) => void) | null = null
let onErr: ((e: unknown) => void) | null = null
const refresh = vi.fn()
const onBack = vi.fn()

beforeEach(() => {
  mapCalls.length = 0
  onFix = null
  onErr = null
  call.mockReset()
  call.mockResolvedValue({ ok: true })
  refresh.mockReset()
  onBack.mockReset()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (ok: (p: unknown) => void, err: (e: unknown) => void) => {
        onFix = ok
        onErr = err
        return 3
      },
      clearWatch: vi.fn(),
    },
  })
})
afterEach(cleanup)

const open = (v: View, credentials: { organiserToken: string } | { token: string } = { organiserToken: 'h1' }) =>
  render(<WalkPark code="ABC234" view={v} credentials={credentials} refresh={refresh} onBack={onBack} />)

describe('WalkPark', () => {
  it('is within 15 m', () => expect(WALK_HERE_M).toBe(15))

  it('on the way: the next card, distance and compass point, with a pin per item', () => {
    open(view([S1, S2, PEN], { 'station-1': true }))
    act(() => onFix!(at(S2, 0, -210)))
    expect(screen.getByText('NEXT · 2 OF 3')).toBeInTheDocument()
    expect(screen.getByText('Station 2')).toBeInTheDocument()
    expect(screen.getByText('210 M · EAST')).toBeInTheDocument()
    const pins = mapCalls.at(-1)!.pins!
    expect(pins.map((p) => p.id)).toEqual(['station-1', 'station-2', 'penjara'])
    expect(pins.map((p) => p.label)).toEqual(['1', '2', 'PENJARA'])
    expect(pins.map((p) => p.state)).toEqual(['placed', 'next', 'todo'])
    expect(mapCalls.at(-1)!.route).toBeTruthy()
  })

  it('rounds the direction to 8 compass points', () => {
    open(view([S2]))
    act(() => onFix!(at(S2, -100, -100)))
    expect(screen.getByText('140 M · NORTH-EAST')).toBeInTheDocument()
  })

  it('within 15 m the card turns to "you are here" and the button marks it placed', async () => {
    open(view([S1, S2, PEN], { 'station-1': true }))
    act(() => onFix!(at(S2, 8, 0)))
    expect(screen.getByText("YOU'RE HERE · 8 M")).toBeInTheDocument()
    expect(screen.getByText('Tape Station 2 here.')).toBeInTheDocument()
    expect(screen.getByText('At eye level, facing the path.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Station 2 is up' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('setKit', { code: 'ABC234', organiserToken: 'h1', placed: { id: 'station-2', on: true } }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('Penjara has its own line', () => {
    open(view([S1, PEN], { 'station-1': true }))
    act(() => onFix!(at(PEN, 3, 0)))
    expect(screen.getByText('Tape the Penjara card here.')).toBeInTheDocument()
  })

  it('a marshal uses the player token', async () => {
    open(view([S1]), { token: 'p1' })
    act(() => onFix!(at(S1, 2, 0)))
    fireEvent.click(screen.getByRole('button', { name: 'Station 1 is up' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('setKit', { code: 'ABC234', token: 'p1', placed: { id: 'station-1', on: true } }))
  })

  it('the organiser walk ends with the yellow secret step', async () => {
    open(view([S1, DATO], { 'station-1': true }, { datoCard: { letter: 'B', code: 'secretcode' } }))
    expect(mapCalls.at(-1)!.pins!.at(-1)).toMatchObject({ id: 'dato', label: '?' })
    // No fix yet: the card is there, but there is nothing to drop at.
    expect(screen.queryByRole('button', { name: 'Drop Dato Seri here' })).not.toBeInTheDocument()
    // 100 m from the hint spot: still the whole secret step and the drop button, with no distance or compass.
    act(() => onFix!(at(DATO, 0, 100)))
    expect(screen.getByText('SECRET · 2 OF 2')).toBeInTheDocument()
    expect(screen.getByText('Hide yellow card B.')).toBeInTheDocument()
    expect(screen.getByText('Secret. Only you see this. Pick any spot nearby.')).toBeInTheDocument()
    expect(screen.getByText('Hide it somewhere sneaky. Under a bench, behind a sign.')).toBeInTheDocument()
    expect(screen.queryByText(/ M · /)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Drop Dato Seri here' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('setKit', { code: 'ABC234', organiserToken: 'h1', placed: { id: 'dato', on: true } }))
    const drop = call.mock.calls.find((c) => c[0] === 'dropDatoSeri')!
    expect(drop[1]).toMatchObject({ code: 'ABC234', organiserToken: 'h1' })
    expect(drop[1].lat).toBeCloseTo(DATO.lat, 6)
    expect(drop[1].lng).toBeCloseTo(DATO.lng + 100 / M_LNG, 6)
    expect(call.mock.calls.map((c) => c[0])).toEqual(['dropDatoSeri', 'setKit'])
  })

  it("the helper's walk has no secret pin, step, letter or count", () => {
    // The server leaves the secret place and card out of a marshal's view; the screen adds nothing of its own.
    const { container } = open(view([S1, S2, PEN], { 'station-1': true, 'station-2': true, penjara: true }), { token: 'p1' })
    expect(mapCalls.at(-1)!.pins!.map((p) => p.id)).toEqual(['station-1', 'station-2', 'penjara'])
    expect(container.textContent).not.toMatch(/secret|yellow|Dato|hide|\?/i)
    cleanup()
    open(view([S1, S2, PEN], { 'station-1': true }), { token: 'p1' })
    act(() => onFix!(at(S2, 0, -210)))
    expect(screen.getByText('NEXT · 2 OF 3')).toBeInTheDocument()
  })

  it('finished: the kit is out, back to the lobby', () => {
    open(view([S1, PEN], { 'station-1': true, penjara: true }))
    expect(screen.getByText("Kit's out.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the lobby' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('without a location fix it asks for location and the list still works', async () => {
    open(view([S1, S2]))
    act(() => onErr!({ code: 1 }))
    expect(screen.getByText('Turn on location to see where to go.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Station 2 is up' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('setKit', expect.objectContaining({ placed: { id: 'station-2', on: true } })))
  })
})
