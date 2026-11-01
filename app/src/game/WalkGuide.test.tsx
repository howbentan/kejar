import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./Map', () => ({ default: () => <div data-testid="map" /> }))
import { WalkGuide } from './WalkGuide'

const JAIL = { lat: 3.0, lng: 101.0 }
const north = (m: number) => ({ coords: { latitude: JAIL.lat + m / 111_195, longitude: JAIL.lng, accuracy: 5 } })

let onFix: ((p: unknown) => void) | null = null
let onErr: ((e: unknown) => void) | null = null
const clearWatch = vi.fn()

beforeEach(() => {
  onFix = null
  onErr = null
  clearWatch.mockReset()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (ok: (p: unknown) => void, err: (e: unknown) => void) => {
        onFix = ok
        onErr = err
        return 7
      },
      clearWatch,
    },
  })
})
afterEach(cleanup)

describe('WalkGuide', () => {
  it('says how far Penjara is', () => {
    render(<WalkGuide jail={JAIL} onArrived={() => {}} />)
    act(() => onFix!(north(160)))
    expect(screen.getByText("160 M · WALK, DON'T RUN")).toBeInTheDocument()
  })

  it('within 30 m, you have arrived', () => {
    const onArrived = vi.fn()
    render(<WalkGuide jail={JAIL} onArrived={onArrived} />)
    act(() => onFix!(north(20)))
    expect(onArrived).toHaveBeenCalledTimes(1)
  })

  it('without a location, points at the pin instead', () => {
    render(<WalkGuide jail={JAIL} onArrived={() => {}} />)
    act(() => onErr!({ code: 1 }))
    expect(screen.getByText('Walk to the PENJARA pin on the map.')).toBeInTheDocument()
  })

  it('a blip after a good fix is not "lost": the guide keeps going', () => {
    const onLost = vi.fn()
    render(<WalkGuide jail={JAIL} onArrived={() => {}} onLost={onLost} />)
    act(() => onFix!(north(160)))
    act(() => onErr!({ code: 2 }))
    expect(onLost).not.toHaveBeenCalled()
    expect(screen.getByText("160 M · WALK, DON'T RUN")).toBeInTheDocument()
  })

  it('stops watching when it goes away', () => {
    const { unmount } = render(<WalkGuide jail={JAIL} onArrived={() => {}} />)
    unmount()
    expect(clearWatch).toHaveBeenCalledWith(7)
  })
})
