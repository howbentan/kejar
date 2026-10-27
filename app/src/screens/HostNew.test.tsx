import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
// The real picker is a MapLibre map; this stand-in reports a chosen centre straight away.
vi.mock('../game/AreaPicker', async () => {
  const { useEffect } = await import('react')
  return {
    default: ({
      onChange,
      onStationsChange,
    }: {
      onChange: (c: { lat: number; lng: number }) => void
      onStationsChange: (s: { lat: number; lng: number }[]) => void
    }) => {
      useEffect(() => onChange({ lat: 3.5, lng: 101.5 }), [onChange])
      return (
        <button type="button" onClick={() => onStationsChange([A, B])}>
          drop two stations
        </button>
      )
    },
  }
})

import HostNew from './HostNew'

const A = { lat: 3.5001, lng: 101.5 }
const B = { lat: 3.5, lng: 101.5001 }

const setUa = (ua: string) => Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua })

beforeEach(() => {
  call.mockReset()
  call.mockResolvedValue({ code: 'ABC234' })
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'ot1', name: 'Owner' }))
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('HostNew', () => {
  it('creates the game at the centre and size picked on the map', async () => {
    setUa('Mozilla/5.0 (Linux; Android 14)')
    render(<HostNew />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play area size: 300 m' }))
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({ arenaId: 'around-me', center: { lat: 3.5, lng: 101.5 }, radiusM: 300, organiserToken: 'ot1' }),
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

  it('sends the stations dropped on the map', async () => {
    setUa('Mozilla/5.0 (Linux; Android 14)')
    render(<HostNew />)
    fireEvent.click(screen.getByRole('button', { name: 'drop two stations' }))
    expect(screen.getByText('Stations: 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('create', expect.objectContaining({ stations: [A, B], organiserToken: 'ot1' })))
  })

  it('asks for an invite link when this phone has no organiser session', () => {
    localStorage.clear()
    render(<HostNew />)
    expect(screen.getByText(/need an invite link/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create game/i })).toBeNull()
  })

  it('invites a peer organiser and shows the link to share', async () => {
    call.mockImplementation(async (action: string) => {
      if (action === 'createOrganiserInvite') return { inviteToken: 'tok1' }
      return { code: 'ABC234' }
    })
    render(<HostNew />)
    fireEvent.change(screen.getByLabelText('New organiser\'s name'), { target: { value: 'Partner' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('createOrganiserInvite', { organiserToken: 'ot1', name: 'Partner' }),
    )
    expect(await screen.findByText(`${window.location.origin}/organiser/tok1`)).toBeInTheDocument()
  })
})
