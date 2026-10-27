import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

const pts = vi.hoisted(() => ({
  S1: { lat: 3.151, lng: 101.711 },
  S2: { lat: 3.152, lng: 101.712 },
  S3: { lat: 3.153, lng: 101.713 },
  TAP: { lat: 3.154, lng: 101.714 },
  JAIL: { lat: 3.15, lng: 101.71 },
}))

// Stand-ins for the MapLibre map and the set-up screen.
vi.mock('../game/PlaceMap', () => ({
  default: (p: { onTap: (q: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => p.onTap(pts.TAP)}>
      tap the map
    </button>
  ),
}))
const ONE_OFF = { name: 'Around the organiser', source: 'circle' }
vi.mock('./ArenaSetup', () => ({
  default: (p: { onDone: (r: { arenaId?: string; draft: unknown }) => void }) => (
    <div>
      <button type="button" onClick={() => p.onDone({ draft: ONE_OFF })}>
        finish one-off
      </button>
      <button type="button" onClick={() => p.onDone({ arenaId: 'ar2', draft: { name: 'New Park' } })}>
        finish saved
      </button>
    </div>
  ),
}))

import HostNew from './HostNew'

const setUa = (ua: string) => Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua })

const klcc = (over: object = {}) => ({
  id: 'ar1',
  name: 'KLCC',
  areaHa: 15.7,
  waterChecked: true,
  problems: [],
  arena: { id: 'ar1', name: 'KLCC', boundary: [], holes: [], jail: pts.JAIL, start: pts.JAIL, stations: [pts.S1, pts.S2, pts.S3] },
  draft: { name: 'KLCC' },
  ...over,
})

let arenas: unknown[]

beforeEach(() => {
  arenas = [klcc()]
  call.mockReset()
  call.mockImplementation(async (action: string) => {
    if (action === 'listArenas') return { arenas }
    if (action === 'createOrganiserInvite') return { inviteToken: 'tok1' }
    if (action === 'recheckWater') return { waterChecked: true, problems: ['Jail must be inside the play area'] }
    return { code: 'ABC234', ok: true }
  })
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'ot1', name: 'Owner' }))
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
  setUa('Mozilla/5.0 (Linux; Android 14)')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('HostNew', () => {
  it('lists saved parks with size and station count', async () => {
    render(<HostNew />)
    expect(await screen.findByText('KLCC · 15.7 ha · 3 stations')).toBeInTheDocument()
    expect(call).toHaveBeenCalledWith('listArenas', { organiserToken: 'ot1' })
  })

  it('Retry rechecks the lakes and shows what needs moving', async () => {
    arenas = [klcc({ waterChecked: false })]
    render(<HostNew />)
    expect(await screen.findByText('Lakes not checked')).toBeInTheDocument()
    arenas = [klcc({ problems: ['Jail must be inside the play area'] })]
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('recheckWater', { organiserToken: 'ot1', arenaId: 'ar1' }))
    expect(await screen.findByText('Jail must be inside the play area')).toBeInTheDocument()
    expect(screen.queryByText('Lakes not checked')).toBeNull()
  })

  it('creating from a saved park sends only the overrides that changed', async () => {
    render(<HostNew />)
    fireEvent.click(await screen.findByRole('button', { name: 'Use KLCC' }))
    fireEvent.click(screen.getByRole('button', { name: 'tap the map' }))
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        'create',
        expect.objectContaining({
          organiserToken: 'ot1',
          savedArenaId: 'ar1',
          overrides: { stations: [pts.S1, pts.S2, pts.S3, pts.TAP] },
        }),
      ),
    )
  })

  it('creating from an untouched saved park sends no overrides', async () => {
    render(<HostNew />)
    fireEvent.click(await screen.findByRole('button', { name: 'Use KLCC' }))
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('create', expect.objectContaining({ savedArenaId: 'ar1', overrides: {} })),
    )
  })

  it('warns again when the chosen park has unchecked lakes', async () => {
    arenas = [klcc({ waterChecked: false })]
    render(<HostNew />)
    fireEvent.click(await screen.findByRole('button', { name: 'Use KLCC' }))
    expect(screen.getByText("Lakes weren't checked for this park. Look at the map before playing.")).toBeInTheDocument()
  })

  it('delete asks first and says existing games keep their map', async () => {
    render(<HostNew />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete KLCC' }))
    expect(call).not.toHaveBeenCalledWith('deleteArena', expect.anything())
    expect(screen.getByText('Delete KLCC? Games already made keep their map.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('deleteArena', { organiserToken: 'ot1', arenaId: 'ar1' }))
  })

  it('a one-off circle from the set-up screen creates with the draft', async () => {
    render(<HostNew />)
    fireEvent.click(await screen.findByRole('button', { name: 'New play area' }))
    fireEvent.click(screen.getByRole('button', { name: 'finish one-off' }))
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('create', expect.objectContaining({ draft: ONE_OFF })))
  })

  it('a newly saved park is selected for the game', async () => {
    render(<HostNew />)
    fireEvent.click(await screen.findByRole('button', { name: 'New play area' }))
    arenas = [klcc({ id: 'ar2', name: 'New Park', arena: { ...klcc().arena, id: 'ar2' } }), klcc()]
    fireEvent.click(screen.getByRole('button', { name: 'finish saved' }))
    fireEvent.click(await screen.findByRole('button', { name: /create game/i }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('create', expect.objectContaining({ savedArenaId: 'ar2' })))
  })

  it('asks for a play area before creating', async () => {
    render(<HostNew />)
    await screen.findByText('KLCC · 15.7 ha · 3 stations')
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    expect(await screen.findByText('Pick a park or set up a new play area first.')).toBeInTheDocument()
  })

  it('suggests creating from a phone when on a laptop', () => {
    setUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0')
    render(<HostNew />)
    expect(screen.getByText(/create the game on your phone/i)).toBeInTheDocument()
  })

  it('does not nag on a phone', () => {
    render(<HostNew />)
    expect(screen.queryByText(/create the game on your phone/i)).toBeNull()
  })

  it('asks for an invite link when this phone has no organiser session', () => {
    localStorage.clear()
    render(<HostNew />)
    expect(screen.getByText(/need an invite link/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create game/i })).toBeNull()
  })

  it('invites a peer organiser and shows the link to share', async () => {
    render(<HostNew />)
    fireEvent.change(screen.getByLabelText("New organiser's name"), { target: { value: 'Partner' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('createOrganiserInvite', { organiserToken: 'ot1', name: 'Partner' }))
    expect(await screen.findByText(`${window.location.origin}/organiser/tok1`)).toBeInTheDocument()
  })
})
