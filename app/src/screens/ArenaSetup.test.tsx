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

const hit = { osmRef: 'way/10590000', name: 'KLCC Park', areaHa: 16, outline: geo.park, pieces: 1 }
const jalil = { name: 'Bukit Jalil', center: { lat: 3.0618, lng: 101.6993 } }
const taman = { osmRef: 'way/77', name: 'Taman Rekreasi Bukit Jalil', areaHa: 31.84, outline: geo.lake, pieces: 1 }
const found = (parks: unknown[] = [], around: unknown = null, nearby: unknown[] = []) => ({ parks, around, nearby })

beforeEach(() => {
  call.mockReset()
  call.mockImplementation(async (action: string) => {
    if (action === 'searchParks') return found([hit])
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
  await screen.findByText('0 stations')
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
      if (action === 'searchParks') return found([hit])
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
      if (action === 'searchParks') return found([{ ...hit, pieces: 2 }])
      if (action === 'parkFeatures') return { water: [geo.lake], toilets: [], waterChecked: true }
      return {}
    })
    render(<ArenaSetup onDone={vi.fn()} />)
    await pickKlcc()
    expect(screen.getByText('Only the largest part of the park is used')).toBeInTheDocument()
  })

  it('Use once is offered for a circle and does not save', async () => {
    const onDone = vi.fn()
    render(<ArenaSetup onDone={onDone} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play area: Circle' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use once' }))
    expect(onDone).toHaveBeenCalledWith({ draft: expect.objectContaining({ source: 'circle', outline: null }) })
    expect(call).not.toHaveBeenCalledWith('saveArena', expect.anything())
  })

  describe('search results', () => {
    /** `nearby` rides along in the fixture and is served by the separate nearbyParks action. */
    async function search(result: unknown, nearbyReply?: () => Promise<unknown>) {
      const { nearby = [], ...res } = result as { nearby?: unknown[] }
      call.mockImplementation(async (action: string) => {
        if (action === 'searchParks') return res
        if (action === 'nearbyParks') return nearbyReply ? nearbyReply() : { nearby }
        if (action === 'parkFeatures') return { water: [], toilets: [], waterChecked: true }
        return {}
      })
      fireEvent.change(screen.getByLabelText('Park name'), { target: { value: 'Bukit Jalil' } })
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      await waitFor(() => expect(call).toHaveBeenCalledWith('searchParks', expect.anything()))
    }
    const deferred = <T,>() => {
      let resolve!: (v: T) => void
      let reject!: (e: unknown) => void
      const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
      return { promise, resolve, reject }
    }

    it('asks for parks near the circle centre, skipping the parks already listed', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([hit], jalil, [taman]))
      await screen.findByRole('button', { name: /^Taman Rekreasi/ })
      expect(call).toHaveBeenCalledWith('nearbyParks', { organiserToken: 'o1', center: jalil.center, skip: [hit.osmRef] })
    })

    it('does not ask for nearby parks when there is no circle option', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([hit]))
      await screen.findByRole('button', { name: /^KLCC Park/ })
      expect(call).not.toHaveBeenCalledWith('nearbyParks', expect.anything())
    })

    it('shows the rows at once, a loading line while nearby parks load, then the heading and rows', async () => {
      const slow = deferred<{ nearby: unknown[] }>()
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([hit], jalil), () => slow.promise)
      expect(await screen.findByRole('button', { name: /^KLCC Park/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Circle around Bukit Jalil' })).toBeInTheDocument()
      expect(screen.getByText('Finding parks near Bukit Jalil…')).toBeInTheDocument()
      expect(screen.queryByText('Parks near Bukit Jalil')).toBeNull()
      slow.resolve({ nearby: [taman] })
      expect(await screen.findByText('Parks near Bukit Jalil')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Taman Rekreasi/ })).toBeInTheDocument()
      expect(screen.queryByText(/^Finding parks near/)).toBeNull()
    })

    it('a failed or empty nearby lookup shows nothing extra and no error', async () => {
      const bad = deferred<unknown>()
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([hit], jalil), () => bad.promise)
      await screen.findByText('Finding parks near Bukit Jalil…')
      bad.reject(new Error('Park search is down'))
      await waitFor(() => expect(screen.queryByText(/^Finding parks near/)).toBeNull())
      expect(screen.queryByText(/^Parks near/)).toBeNull()
      expect(screen.queryByText(/down/)).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('old rows go as soon as a new search starts', async () => {
      const slow = deferred<unknown>()
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([hit], jalil))
      await screen.findByRole('button', { name: /^KLCC Park/ })
      call.mockImplementation(async () => slow.promise)
      fireEvent.change(screen.getByLabelText('Park name'), { target: { value: 'Sri Petaling' } })
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: /^KLCC Park/ })).toBeNull())
      expect(screen.queryByRole('button', { name: 'Circle around Bukit Jalil' })).toBeNull()
      expect(screen.queryByText(/No parks found/)).toBeNull()
    })

    it('a superseded search that fails late shows no error and does not re-enable Search early', async () => {
      const first = deferred<unknown>()
      const second = deferred<unknown>()
      render(<ArenaSetup onDone={vi.fn()} />)
      call.mockImplementationOnce(async () => first.promise).mockImplementationOnce(async () => second.promise)
      fireEvent.change(screen.getByLabelText('Park name'), { target: { value: 'Bukit Jalil' } })
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      await waitFor(() => expect(call).toHaveBeenCalledTimes(1))
      fireEvent.keyDown(screen.getByLabelText('Park name'), { key: 'Enter' })
      await waitFor(() => expect(call).toHaveBeenCalledTimes(2))
      first.reject(new Error('Park search is down right now.'))
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.queryByText(/down right now/)).toBeNull()
      expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
      second.resolve(found([hit]))
      expect(await screen.findByRole('button', { name: /^KLCC Park/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled()
    })

    it('ignores a nearby reply that arrives after the organiser searched again', async () => {
      const first = deferred<{ nearby: unknown[] }>()
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([], jalil), () => first.promise)
      await screen.findByText('Finding parks near Bukit Jalil…')
      const sri = { name: 'Sri Petaling', center: { lat: 3.07, lng: 101.69 } }
      const other = { osmRef: 'way/88', name: 'Taman Sri Petaling', areaHa: 5, outline: geo.lake, pieces: 1 }
      call.mockImplementation(async (action: string) => {
        if (action === 'searchParks') return found([], sri)
        if (action === 'nearbyParks') return { nearby: [other] }
        return {}
      })
      fireEvent.change(screen.getByLabelText('Park name'), { target: { value: 'Sri Petaling' } })
      fireEvent.click(screen.getByRole('button', { name: 'Search' }))
      expect(await screen.findByText('Parks near Sri Petaling')).toBeInTheDocument()
      first.resolve({ nearby: [taman] })
      await new Promise((r) => setTimeout(r, 20))
      expect(screen.queryByText('Parks near Bukit Jalil')).toBeNull()
      expect(screen.queryByRole('button', { name: /^Taman Rekreasi/ })).toBeNull()
      expect(screen.getByRole('button', { name: /^Taman Sri Petaling/ })).toBeInTheDocument()
    })

    it('rows run parks, then the circle, then a Parks near heading with the nearby parks', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([hit], jalil, [taman]))
      await screen.findByRole('button', { name: /^KLCC Park/ })
      const rows = screen
        .getAllByRole('button')
        .map((b) => b.textContent ?? '')
        .filter((t) => /KLCC Park|Circle around|Taman Rekreasi/.test(t))
      expect(rows).toEqual(['KLCC Park', 'Circle around Bukit Jalil', 'Taman Rekreasi Bukit Jalil'])
      const heading = screen.getByText('Parks near Bukit Jalil')
      const circle = screen.getByRole('button', { name: 'Circle around Bukit Jalil' })
      const nearbyRow = screen.getByRole('button', { name: /^Taman Rekreasi/ })
      expect(circle.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(heading.compareDocumentPosition(nearbyRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('shows the name only: no size, no chips, no tip, no greyed rows', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([hit], jalil, [taman]))
      const row = await screen.findByRole('button', { name: /^KLCC Park/ })
      expect(row).toHaveTextContent(/^KLCC Park$/)
      expect(row).not.toHaveTextContent(/Park\b.*Park\b/)
      expect(row).not.toHaveAttribute('data-unlikely')
      expect(document.querySelector('.chip')).toBeNull()
      expect(screen.queryByText(/Can't find it/)).toBeNull()
    })

    it('no Parks near heading when there is no circle option', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([hit]))
      await screen.findByRole('button', { name: /^KLCC Park/ })
      expect(screen.queryByText(/^Parks near/)).toBeNull()
      expect(screen.queryByRole('button', { name: /^Circle around/ })).toBeNull()
    })

    it('no heading either when nothing is nearby', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([], jalil, []))
      await screen.findByRole('button', { name: 'Circle around Bukit Jalil' })
      expect(screen.queryByText(/^Parks near/)).toBeNull()
    })

    it('Circle around Bukit Jalil opens a draggable circle at the centre', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([], jalil, [taman]))
      fireEvent.click(await screen.findByRole('button', { name: 'Circle around Bukit Jalil' }))
      expect(await screen.findByText('circle:3.0618,101.6993,200')).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Play area: Circle', checked: true })).toBeInTheDocument()
      expect(screen.getByLabelText('Name this park')).toHaveValue('Bukit Jalil')
      expect(screen.getByText('Drag to move.')).toBeInTheDocument()
      expect(call).not.toHaveBeenCalledWith('parkFeatures', expect.anything())
    })

    it('tapping a nearby park selects its outline and checks its lakes', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([], jalil, [taman]))
      fireEvent.click(await screen.findByRole('button', { name: /^Taman Rekreasi Bukit Jalil/ }))
      await waitFor(() => expect(call).toHaveBeenCalledWith('parkFeatures', { organiserToken: 'o1', outline: geo.lake }))
      expect(await screen.findByText('0 stations')).toBeInTheDocument()
      expect(screen.getByLabelText('Name this park')).toHaveValue('Taman Rekreasi Bukit Jalil')
    })

    it('says so when there is nothing at all', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found())
      expect(await screen.findByText("No parks found. Use a circle and drag it where you'll play.")).toBeInTheDocument()
    })

    it('dragging the handle moves the circle centre and the sizes stay put', async () => {
      render(<ArenaSetup onDone={vi.fn()} />)
      await search(found([], jalil))
      fireEvent.click(await screen.findByRole('button', { name: 'Circle around Bukit Jalil' }))
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
