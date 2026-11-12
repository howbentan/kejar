import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    if (action === 'recheckWater') return { waterChecked: true, problems: ['Penjara must be inside the play area'] }
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

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }))
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back' }))
const createGame = () => fireEvent.click(screen.getByRole('button', { name: 'Create game' }))
const pickPark = async (name = 'KLCC') => fireEvent.click(await screen.findByRole('button', { name: `Use ${name}` }))
/** Park chosen, on step 2. */
const toStep2 = async () => {
  await pickPark()
  next()
}
/** Park chosen and Core or Full picked, on step 3. */
const toStep3 = async (mode: 'Core' | 'Full' = 'Core') => {
  await toStep2()
  fireEvent.click(screen.getByRole('radio', { name: `Game: ${mode}` }))
  next()
}
const createdWith = (match: object) => expect(call).toHaveBeenCalledWith('create', expect.objectContaining(match))
const createCalls = () => call.mock.calls.filter((c) => c[0] === 'create')
const parksLoaded = () => screen.findByText('KLCC · 3 stations')

describe('HostNew step 1, the park', () => {
  it('shows the step, the heading and the progress bar', async () => {
    render(<HostNew />)
    expect(screen.getByText('NEW GAME · STEP 1 OF 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where are you?' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Step 1 of 5' })).toBeInTheDocument()
    await parksLoaded()
  })

  it('lists saved parks with size and station count', async () => {
    render(<HostNew />)
    expect(await parksLoaded()).toBeInTheDocument()
    expect(call).toHaveBeenCalledWith('listArenas', { organiserToken: 'ot1' })
  })

  it('Next is disabled until a park is chosen, and there is no Back', async () => {
    render(<HostNew />)
    await parksLoaded()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    await pickPark()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('a one-off play area also unlocks Next', async () => {
    render(<HostNew />)
    fireEvent.click(await screen.findByRole('button', { name: 'New play area' }))
    fireEvent.click(screen.getByRole('button', { name: 'finish one-off' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('Retry rechecks the lakes and shows what needs moving', async () => {
    arenas = [klcc({ waterChecked: false })]
    render(<HostNew />)
    expect(await screen.findByText('Lakes not checked')).toBeInTheDocument()
    arenas = [klcc({ problems: ['Penjara must be inside the play area'] })]
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('recheckWater', { organiserToken: 'ot1', arenaId: 'ar1' }))
    expect(await screen.findByText('Penjara must be inside the play area')).toBeInTheDocument()
    expect(screen.queryByText('Lakes not checked')).toBeNull()
  })

  it('warns again when the chosen park has unchecked lakes', async () => {
    arenas = [klcc({ waterChecked: false })]
    render(<HostNew />)
    await pickPark()
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

  it('has small links to invite another organiser and to the kit', async () => {
    render(<HostNew />)
    expect(screen.getByRole('link', { name: 'Your kit' }).getAttribute('href')).toBe('/host/kit')
    expect(screen.getByRole('button', { name: 'Invite another organiser' })).toBeInTheDocument()
    await parksLoaded()
  })

  it('invites a peer organiser and shows the link to share', async () => {
    render(<HostNew />)
    expect(screen.queryByLabelText("New organiser's name")).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Invite another organiser' }))
    fireEvent.change(screen.getByLabelText("New organiser's name"), { target: { value: 'Partner' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('createOrganiserInvite', { organiserToken: 'ot1', name: 'Partner' }))
    expect(await screen.findByText(`${window.location.origin}/organiser/tok1`)).toBeInTheDocument()
  })

  it('suggests creating from a phone when on a laptop', async () => {
    setUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0')
    render(<HostNew />)
    expect(screen.getByText(/create the game on your phone/i)).toBeInTheDocument()
    await parksLoaded()
  })

  it('does not nag on a phone', async () => {
    render(<HostNew />)
    expect(screen.queryByText(/create the game on your phone/i)).toBeNull()
    await parksLoaded()
  })

  it('asks for an invite link when this phone has no organiser session', () => {
    localStorage.clear()
    render(<HostNew />)
    expect(screen.getByText(/need an invite link/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })
})

describe('HostNew step 2, which game', () => {
  it('shows the park name, Core preselected with its copy and four stickers', async () => {
    render(<HostNew />)
    await toStep2()
    expect(screen.getByText('NEW GAME · STEP 2 OF 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Which game?' })).toBeInTheDocument()
    expect(screen.getByText('KLCC')).toBeInTheDocument()
    const core = screen.getByRole('radio', { name: 'Game: Core' })
    expect(core).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('BEST FOR FIRST-TIMERS')).toBeInTheDocument()
    expect(screen.getByText('The chase, check-ins and Penjara, plus 4 simple power-ups. Learnable in 5 minutes.')).toBeInTheDocument()
    expect(within(core).getAllByRole('img').map((i) => i.getAttribute('aria-label'))).toEqual(['Durian', 'Ponteng', 'Mat Rempit', 'Pak Guard'])
  })

  it('Full shows its copy and stickers, ending with both legendaries', async () => {
    render(<HostNew />)
    await toStep2()
    expect(screen.getByText('FOR REGULARS')).toBeInTheDocument()
    expect(screen.getByText('Everything in Core, plus 7 more power-ups and two secret legendaries.')).toBeInTheDocument()
    const names = within(screen.getByRole('radio', { name: 'Game: Full' }))
      .getAllByRole('img')
      .map((i) => i.getAttribute('aria-label'))
    expect(names).toHaveLength(13)
    expect(names).toEqual(expect.arrayContaining(['Cheese Ais', 'Nasi Lemak KFC', 'Tuch and Ga']))
    expect(names.slice(-2)).toEqual(['Dato Seri', 'Bomoh'])
  })

  it('has Back and Next', async () => {
    render(<HostNew />)
    await toStep2()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })
})

describe('HostNew step 3, how long', () => {
  it('creates a Core game by default with the default settings', async () => {
    render(<HostNew />)
    await toStep3()
    expect(screen.getByText('NEW GAME · STEP 3 OF 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How long?' })).toBeInTheDocument()
    expect(screen.getByText('No extra settings in Core.')).toBeInTheDocument()
    expect(screen.queryByText(/LEGENDARY CARDS/)).toBeNull()
    expect(screen.queryByRole('radio', { name: /Dikejar can see Kejar at check-in/ })).toBeNull()
    createGame()
    await waitFor(() => createdWith({ settings: expect.objectContaining({ mode: 'core', lengthMin: 45, playersBand: 20 }) }))
  })

  it('Standard is preselected and Quick and Long change the length', async () => {
    render(<HostNew />)
    await toStep3()
    expect(screen.getByRole('radio', { name: 'Length: Standard' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('30 MIN')).toBeInTheDocument()
    expect(screen.getByText('45 MIN')).toBeInTheDocument()
    expect(screen.getByText('60 MIN')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Length: Long' }))
    createGame()
    await waitFor(() => createdWith({ settings: expect.objectContaining({ lengthMin: 60 }) }))
  })

  it('shows the summary line from the real settings, and Change opens the number fields', async () => {
    render(<HostNew />)
    await toStep3()
    expect(screen.getByText('Hide 5 min · ping every 5 min · Penjara view 2 min behind.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Hide time (min)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.change(screen.getByLabelText('Hide time (min)'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Ping every: 3 min' }))
    fireEvent.change(screen.getByLabelText('Spectator delay (min)'), { target: { value: '1' } })
    expect(screen.getByLabelText('Game length (min)')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Check-ins: Push alerts' })).toBeInTheDocument()
    expect(screen.getByText('Hide 3 min · ping every 3 min · Penjara view 1 min behind.')).toBeInTheDocument()
    createGame()
    await waitFor(() => createdWith({ settings: expect.objectContaining({ hideMin: 3, pingMin: 3, spectatorDelayMin: 1 }) }))
  })

  it('expected players: Up to 20, 21–30 and 31–40', async () => {
    render(<HostNew />)
    await toStep3()
    expect(screen.getByText('EXPECTED PLAYERS')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Expected players: Up to 20' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Expected players: 21–30' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Expected players: 31–40' }))
    createGame()
    await waitFor(() => createdWith({ settings: expect.objectContaining({ playersBand: 40 }) }))
  })

  it('Full shows the legendary cards: Dato Seri on a hidden stash, Bomoh off by default', async () => {
    render(<HostNew />)
    await toStep3('Full')
    expect(screen.getByText('LEGENDARY CARDS · SECRET FROM PLAYERS')).toBeInTheDocument()
    expect(screen.getByText('FOR DIKEJAR · YELLOW')).toBeInTheDocument()
    expect(screen.getByText('FOR KEJAR · PURPLE')).toBeInTheDocument()
    expect(screen.getByText("A hidden QR card. The runner who finds it can free themselves and 2 more from Penjara. You'll hide it during the walk.")).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Dato Seri: On' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Bomoh: On' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'Bomoh: Off' })).toHaveAttribute('aria-checked', 'true')
    createGame()
    await waitFor(() =>
      createdWith({ settings: expect.objectContaining({ mode: 'full', legendaries: { dato: 'stash', bomoh: 'off' } }) }),
    )
  })

  it('Dato Seri can be turned off', async () => {
    render(<HostNew />)
    await toStep3('Full')
    fireEvent.click(screen.getByRole('radio', { name: 'Dato Seri: Off' }))
    createGame()
    await waitFor(() => createdWith({ settings: expect.objectContaining({ legendaries: { dato: 'off', bomoh: 'off' } }) }))
  })

  it('Bomoh can be turned on as a hidden stash, with its copy and no build badge', async () => {
    render(<HostNew />)
    await toStep3('Full')
    expect(screen.queryByText('NOT BUILT YET')).not.toBeInTheDocument()
    expect(
      screen.getByText("A hidden QR card. The chaser who finds it shows every runner to Kejar for 2 pings. You'll hide it during the walk."),
    ).toBeInTheDocument()
    const stash = screen.getByRole('radio', { name: 'Bomoh: On' })
    expect(stash).toBeEnabled()
    fireEvent.click(stash)
    expect(stash).toHaveAttribute('aria-checked', 'true')
    createGame()
    await waitFor(() => createdWith({ settings: expect.objectContaining({ legendaries: { dato: 'stash', bomoh: 'stash' } }) }))
  })

  it('the chaser-snapshot switch is Full only, off by default, and can be turned on', async () => {
    const { unmount } = render(<HostNew />)
    await toStep3()
    expect(screen.queryByRole('radio', { name: /Dikejar can see Kejar at check-in/ })).toBeNull()
    unmount()
    render(<HostNew />)
    await toStep3('Full')
    expect(screen.getByRole('radio', { name: 'Dikejar can see Kejar at check-in: Off' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Dikejar can see Kejar at check-in: On' }))
    createGame()
    await waitFor(() => createdWith({ settings: expect.objectContaining({ chaserSnapshot: true }) }))
  })

  it('switching back to Core turns the chaser-snapshot switch off', async () => {
    render(<HostNew />)
    await toStep3('Full')
    fireEvent.click(screen.getByRole('radio', { name: 'Dikejar can see Kejar at check-in: On' }))
    back()
    fireEvent.click(screen.getByRole('radio', { name: 'Game: Core' }))
    next()
    createGame()
    await waitFor(() => createdWith({ settings: expect.objectContaining({ mode: 'core', chaserSnapshot: false }) }))
  })

  it('has Back and Create game, and no Next', async () => {
    render(<HostNew />)
    await toStep3()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })
})

describe('HostNew creating', () => {
  it('creating from a saved park sends only the overrides that changed', async () => {
    render(<HostNew />)
    await pickPark()
    fireEvent.click(screen.getByRole('button', { name: 'tap the map' }))
    next()
    next()
    createGame()
    await waitFor(() =>
      createdWith({ organiserToken: 'ot1', savedArenaId: 'ar1', overrides: { stations: [pts.S1, pts.S2, pts.S3, pts.TAP] } }),
    )
  })

  it('creating from an untouched saved park sends no overrides', async () => {
    render(<HostNew />)
    await toStep3()
    createGame()
    await waitFor(() => createdWith({ savedArenaId: 'ar1', overrides: {} }))
  })

  it('a one-off circle from the set-up screen creates with the draft', async () => {
    render(<HostNew />)
    fireEvent.click(await screen.findByRole('button', { name: 'New play area' }))
    fireEvent.click(screen.getByRole('button', { name: 'finish one-off' }))
    next()
    next()
    createGame()
    await waitFor(() => createdWith({ draft: ONE_OFF }))
  })

  it('a newly saved park is selected for the game', async () => {
    render(<HostNew />)
    fireEvent.click(await screen.findByRole('button', { name: 'New play area' }))
    arenas = [klcc({ id: 'ar2', name: 'New Park', arena: { ...klcc().arena, id: 'ar2' } }), klcc()]
    fireEvent.click(screen.getByRole('button', { name: 'finish saved' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    next()
    next()
    createGame()
    await waitFor(() => createdWith({ savedArenaId: 'ar2' }))
  })

  it('goes to the crew step of the new game', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
    render(<HostNew />)
    await toStep3()
    createGame()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/host/ABC234?setup=crew'))
  })

  it('carries the Dato Seri notice along when create returns one', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
    call.mockImplementation(async (action: string) => {
      if (action === 'listArenas') return { arenas }
      return { code: 'ABC234', notice: 'Reprint a yellow card to use Dato Seri.' }
    })
    render(<HostNew />)
    await toStep3('Full')
    createGame()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/host/ABC234?setup=crew&notice=dato'))
  })

  it.each([
    ['Reprint a purple card to use Bomoh.', 'bomoh'],
    ['Reprint a yellow card to use Dato Seri. Reprint a purple card to use Bomoh.', 'dato,bomoh'],
  ])('carries a purple card notice along too (%s)', async (notice, param) => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
    call.mockImplementation(async (action: string) => {
      if (action === 'listArenas') return { arenas }
      return { code: 'ABC234', notice }
    })
    render(<HostNew />)
    await toStep3('Full')
    createGame()
    await waitFor(() => expect(assign).toHaveBeenCalledWith(`/host/ABC234?setup=crew&notice=${param}`))
  })

  it('shows a create error and lets the organiser try again', async () => {
    call.mockImplementation(async (action: string) => {
      if (action === 'listArenas') return { arenas }
      throw new Error('Server said no')
    })
    render(<HostNew />)
    await toStep3()
    createGame()
    expect(await screen.findByText('Server said no')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create game' })).toBeEnabled()
  })

  it('Back and forward never creates a second game', async () => {
    render(<HostNew />)
    await toStep3()
    back()
    back()
    next()
    next()
    expect(createCalls()).toHaveLength(0)
    const button = screen.getByRole('button', { name: 'Create game' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => createdWith({ savedArenaId: 'ar1' }))
    expect(createCalls()).toHaveLength(1)
  })

  it('going Back and changing the park keeps the mode and settings', async () => {
    arenas = [klcc(), klcc({ id: 'ar3', name: 'Titiwangsa', arena: { ...klcc().arena, id: 'ar3' } })]
    render(<HostNew />)
    await toStep3('Full')
    fireEvent.click(screen.getByRole('radio', { name: 'Length: Long' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Expected players: 21–30' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dato Seri: Off' }))
    back()
    expect(screen.getByRole('radio', { name: 'Game: Full' })).toHaveAttribute('aria-checked', 'true')
    back()
    await pickPark('Titiwangsa')
    next()
    expect(screen.getByRole('radio', { name: 'Game: Full' })).toHaveAttribute('aria-checked', 'true')
    next()
    expect(screen.getByRole('radio', { name: 'Length: Long' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Expected players: 21–30' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Dato Seri: Off' })).toHaveAttribute('aria-checked', 'true')
    createGame()
    await waitFor(() =>
      createdWith({
        savedArenaId: 'ar3',
        settings: expect.objectContaining({ mode: 'full', lengthMin: 60, playersBand: 30, legendaries: { dato: 'off', bomoh: 'off' } }),
      }),
    )
  })
})
