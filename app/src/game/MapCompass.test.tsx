import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type maplibregl from 'maplibre-gl'
import MapCompass from './MapCompass'

function fakeMap() {
  const handlers: Record<string, () => void> = {}
  let bearing = 0
  return {
    handlers,
    setBearing(b: number) {
      bearing = b
      handlers.rotate?.()
    },
    getBearing: () => bearing,
    on: (ev: string, cb: () => void) => (handlers[ev] = cb),
    off: vi.fn(),
    easeTo: vi.fn(),
  }
}

afterEach(cleanup)

describe('MapCompass', () => {
  it('turns its needle against the map so it keeps pointing north', () => {
    const m = fakeMap()
    const { container } = render(<MapCompass map={m as unknown as maplibregl.Map} ready />)
    act(() => m.setBearing(90))
    expect((container.querySelector('.needle') as SVGElement).style.transform).toBe('rotate(-90deg)')
  })

  it('turns the map back to north on a tap', () => {
    const m = fakeMap()
    render(<MapCompass map={m as unknown as maplibregl.Map} ready />)
    fireEvent.click(screen.getByRole('button', { name: /compass/i }))
    expect(m.easeTo).toHaveBeenCalledWith({ bearing: 0, duration: 450 })
  })
})
