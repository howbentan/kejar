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
  default: (p: {
    mode: string
    circle: { center: { lat: number; lng: number }; radiusM: number } | null
    onTap: (q: { lat: number; lng: number }) => void
    onCircleMove?: (q: { lat: number; lng: number }) => void
  }) => (
    <div>
      <span>{`mode:${p.mode}`}</span>
      <span>{p.circle ? `circle:${p.circle.center.lat},${p.circle.center.lng},${p.circle.radiusM}` : 'circle:none'}</span>
      <button type="button" onClick={() => p.onCircleMove?.(geo.at(10, 10))}>
        drag the circle
      </button>
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

const hit = {
  osmRef: 'way/10590000',
  name: 'KLCC Park',
  areaHa: 16,
  outline: geo.park,
  pieces: 1,
  kind: 'outline' as const,
  label: 'Park',
  center: geo.C,
  unlikely: false,
}
const suburb = { osmRef: 'node/1', name: 'Bukit Jalil', areaHa: 0, outline: [], pieces: 1, kind: 'point' as const, label: 'Area', center: { lat: 3.0618, lng: 101.6993 }, unlikely: false }
const station = { osmRef: 'way/5', name: 'SP17 Bukit Jalil', areaHa: 0.5, outline: geo.lake, pieces: 1, kind: 'outline' as const, label: 'Station', center: geo.C, unlikely: true }

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
  fireEvent.click(await screen.findByRole('button', { name: /^KLCC Park/ }))
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
    fireEvent.click(await screen.findByRole('button', { name: /^KLCC Park/ }))
    expect(await screen.findByText("Couldn't check for lakes. Look at the map before saving.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save park' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ arenaId: 'ar1' })))
    expect(call.mock.calls.find((c) => c[0] === 'saveArena')![1].draft.waterChecked).toBe(false)
  })

  it('Save park sends the draft with placed jail, start and stations', async () => {
    const onDone = vi.fn()
    render(<ArenaSetup onDone={onDone} />)
    await pickKlcc()
    fireEvent.click(screen.getByRole('radio', { name: 'Place: Penjara' }))
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
    fireEvent.click(screen.getByRole('radio', { name: 'Place: Penjara' }))
    fireEvent.click(screen.getByRole('button', { name: 'tap the lake' }))
    expect(screen.getByText('Penjara must be inside the play area')).toBeInTheDocument()
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

  describe('search results', () => {
    async function search(results: unknown[]) {
      call.mockImplementation(async (action: string) => {
        if (action === 'searchParks') return { results }
        if (action === 'parkFeatures') return { water: [], toilets: [], waterChecked: true }
        return {}
      })
      fireEvent.change(screen.getByLabelText('Park name'), { target: { value: 'Bukit Jalil' } })
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      await screen.findByRole('button', { name: /Bukit Jalil/ })
    }

    it('each row has the name, a size or label sub-line and a chip, plus the tip', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search([hit, suburb])
      const park = screen.getByRole('button', { name: /^KLCC Park/ })
      expect(park).toHaveTextContent('16.0 ha')
      expect(park).toHaveTextContent('Park')
      const area = screen.getByRole('button', { name: /^Bukit Jalil/ })
      expect(area).toHaveTextContent('Area')
      expect(area).not.toHaveTextContent('ha')
      expect(screen.getByText("Can't find it? Try \"Taman …\", or use a circle.")).toBeInTheDocument()
    })

    it('picking a point result switches to a circle centred on it', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search([suburb])
      fireEvent.click(screen.getByRole('button', { name: /^Bukit Jalil/ }))
      expect(await screen.findByText('circle:3.0618,101.6993,200')).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Play area: Circle around me', checked: true })).toBeInTheDocument()
      expect(screen.getByLabelText('Name this park')).toHaveValue('Bukit Jalil')
      expect(screen.getByText('Drag to move.')).toBeInTheDocument()
      expect(call).not.toHaveBeenCalledWith('parkFeatures', expect.anything())
    })

    it('greys unlikely rows but keeps them tappable', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search([hit, station])
      const row = screen.getByRole('button', { name: /^SP17 Bukit Jalil/ })
      expect(row).toHaveAttribute('data-unlikely', 'true')
      expect(row).toBeEnabled()
      expect(screen.getByRole('button', { name: /^KLCC Park/ })).not.toHaveAttribute('data-unlikely')
      fireEvent.click(row)
      await screen.findByText('1.0 ha')
    })

    it('dragging the handle moves the circle centre and the sizes stay put', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search([suburb])
      fireEvent.click(screen.getByRole('button', { name: /^Bukit Jalil/ }))
      await screen.findByText('circle:3.0618,101.6993,200')
      fireEvent.click(screen.getByRole('button', { name: 'drag the circle' }))
      const at = geo.at(10, 10)
      expect(screen.getByText(`circle:${at.lat},${at.lng},200`)).toBeInTheDocument()
      expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(
        expect.arrayContaining(['Circle size: 150 m', 'Circle size: 500 m']),
      )
    })

    it('shows the drag hint for "Use part of the park" too', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await pickKlcc()
      expect(screen.queryByText('Drag to move.')).toBeNull()
      fireEvent.click(screen.getByLabelText('Use part of the park'))
      expect(screen.getByText('Drag to move.')).toBeInTheDocument()
    })
  })
})
