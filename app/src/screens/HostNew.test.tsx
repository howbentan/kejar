import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
// The real picker is a MapLibre map; this stand-in reports a chosen centre straight away.
vi.mock('../game/AreaPicker', async () => {
  const { useEffect } = await import('react')
  return {
    default: ({ onChange }: { onChange: (c: { lat: number; lng: number }) => void }) => {
      useEffect(() => onChange({ lat: 3.5, lng: 101.5 }), [onChange])
      return <div>area picker</div>
    },
  }
})

import HostNew from './HostNew'

const setUa = (ua: string) => Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua })

beforeEach(() => {
  call.mockReset()
  call.mockResolvedValue({ code: 'ABC234', hostKey: 'h1' })
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
})
afterEach(cleanup)

describe('HostNew', () => {
  it('creates the game at the centre and size picked on the map', async () => {
    setUa('Mozilla/5.0 (Linux; Android 14)')
    render(<HostNew />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play area size: 300 m' }))
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({ arenaId: 'around-me', center: { lat: 3.5, lng: 101.5 }, radiusM: 300 }),
      ),
    )
  })

  it('suggests creating from a phone when on a laptop', () => {
    setUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0')
    render(<HostNew />)
    expect(screen.getByText(/create the game on your phone/i)).toBeInTheDocument()
  })

  it('does not nag on a phone', () => {
    setUa('Mozilla/5.0 (Linux; Android 14)')
    render(<HostNew />)
    expect(screen.queryByText(/create the game on your phone/i)).toBeNull()
  })
})
