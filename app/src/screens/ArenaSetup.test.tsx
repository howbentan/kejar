import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

/** A 400 m square park with a 100 m lake in the middle, around KLCC. */
const geo = vi.hoisted(() => {
  const C = { lat: 3.155, lng: 101.712 }
  const M = 111_195
  const at = (dx: number, dy: number) => ({ lat: C.lat + dy / M, lng: C.lng + dx / (M * Math.cos((C.lat * Math.PI) / 180)) })
  const rect = (x0: number, y0: number, x1: number, y1: number) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]
  return { C, at, park: rect(-200, -200, 200, 200), lake: rect(-50, -50, 50, 50) }
})

// The real map is MapLibre; this stand-in turns taps into buttons.
vi.mock('../game/PlaceMap', () => ({
  default: (p: { mode: string; onTap: (q: { lat: number; lng: number }) => void }) => (
    <div>
      <span>{`mode:${p.mode}`}</span>
      <button type="button" onClick={() => p.onTap(geo.at(0, 0))}>
        tap the lake
      </button>
      <button type="button" onClick={() => p.onTap(geo.at(100, 100))}>
        tap land A
      </button>
      <button type="button" onClick={() => p.onTap(geo.at(-100, 100))}>
        tap land B
      </button>
      <button type="button" onClick={() => p.onTap(geo.at(150, 0))}>
        tap land C
      </button>
    </div>
  ),
}))

import ArenaSetup from './ArenaSetup'

const hit = { osmRef: 'way/10590000', name: 'KLCC Park', areaHa: 16, outline: geo.park, pieces: 1 }

beforeEach(() => {
  call.mockReset()
  call.mockImplementation(async (action: string) => {
    if (action === 'searchParks') return { results: [hit] }
    if (action === 'parkFeatures') return { water: [geo.lake], toilets: [], waterChecked: true }
    if (action === 'saveArena') return { arenaId: 'ar1' }
    return {}
  })
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'o1', name: 'Owner' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

async function pickKlcc() {
  fireEvent.change(screen.getByLabelText('Park name'), { target: { value: 'KLCC Park' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  fireEvent.click(await screen.findByRole('button', { name: 'KLCC Park · 16.0 ha' }))
  await screen.findByText('15.0 ha')
}

describe('ArenaSetup', () => {
  it('typing a park name never searches; tapping Search does once', async () => {
    render(<ArenaSetup onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Park name'), { target: { value: 'KLCC Pa' } })
    fireEvent.change(screen.getByLabelText('Park name'), { target: { value: 'KLCC Park' } })
    expect(call).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('searchParks', { organiserToken: 'o1', query: 'KLCC Park' }))
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('picking a result loads lakes and shows the area in hectares', async () => {
    render(<ArenaSetup onDone={vi.fn()} />)
    await pickKlcc()
    expect(call).toHaveBeenCalledWith('parkFeatures', { organiserToken: 'o1', outline: geo.park })
  })

  it('a failed lake check shows the warning but still allows saving', async () => {
    call.mockImplementation(async (action: string) => {
      if (action === 'searchParks') return { results: [hit] }
      if (action === 'parkFeatures') return { water: [], toilets: [], waterChecked: false }
      if (action === 'saveArena') return { arenaId: 'ar1' }
      return {}
    })
    const onDone = vi.fn()
    render(<ArenaSetup onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('Park name'), { target: { value: 'KLCC Park' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await screen.findByRole('button', { name: 'KLCC Park · 16.0 ha' }))
    expect(await screen.findByText("Couldn't check for lakes. Look at the map before saving.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save park' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ arenaId: 'ar1' })))
    expect(call.mock.calls.find((c) => c[0] === 'saveArena')![1].draft.waterChecked).toBe(false)
  })

  it('Save park sends the draft with placed jail, start and stations', async () => {
    const onDone = vi.fn()
    render(<ArenaSetup onDone={onDone} />)
    await pickKlcc()
    fireEvent.click(screen.getByRole('radio', { name: 'Place: Jail' }))
    fireEvent.click(screen.getByRole('button', { name: 'tap land A' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Place: Start' }))
    fireEvent.click(screen.getByRole('button', { name: 'tap land B' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Place: Stations' }))
    fireEvent.click(screen.getByRole('button', { name: 'tap land C' }))
    fireEvent.change(screen.getByLabelText('Name this park'), { target: { value: 'KLCC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save park' }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('saveArena', {
        organiserToken: 'o1',
        draft: {
          name: 'KLCC',
          source: 'osm',
          osmRef: 'way/10590000',
          outline: geo.park,
          circle: null,
          water: [geo.lake],
          toilets: [],
          waterChecked: true,
          jail: geo.at(100, 100),
          start: geo.at(-100, 100),
          stations: [geo.at(150, 0)],
        },
      }),
    )
    expect(onDone).toHaveBeenCalledWith({ arenaId: 'ar1', draft: expect.objectContaining({ name: 'KLCC' }) })
  })

  it('an error from the draft disables Save', async () => {
    render(<ArenaSetup onDone={vi.fn()} />)
    await pickKlcc()
    fireEvent.click(screen.getByRole('radio', { name: 'Place: Jail' }))
    fireEvent.click(screen.getByRole('button', { name: 'tap the lake' }))
    expect(screen.getByText('Jail must be inside the play area')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save park' })).toBeDisabled()
  })

  it('shows when only the largest part of a park is used', async () => {
    call.mockImplementation(async (action: string) => {
      if (action === 'searchParks') return { results: [{ ...hit, pieces: 2 }] }
      if (action === 'parkFeatures') return { water: [geo.lake], toilets: [], waterChecked: true }
      return {}
    })
    render(<ArenaSetup onDone={vi.fn()} />)
    await pickKlcc()
    expect(screen.getByText('Only the largest part of the park is used')).toBeInTheDocument()
  })

  it('Use once is offered for a circle around me and does not save', async () => {
    const onDone = vi.fn()
    render(<ArenaSetup onDone={onDone} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play area: Circle around me' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use once' }))
    expect(onDone).toHaveBeenCalledWith({ draft: expect.objectContaining({ source: 'circle', outline: null }) })
    expect(call).not.toHaveBeenCalledWith('saveArena', expect.anything())
  })
})
