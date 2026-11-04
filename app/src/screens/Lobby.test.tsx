import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testView } from './testView'

vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
vi.mock('../game/Scanner', () => ({ default: () => null }))
// jsdom has no matchMedia, which the alerts card checks.
vi.mock('../game/push', () => ({
  subscribe: vi.fn(),
  pushSupport: () => 'unsupported',
  currentPushEnv: () => ({}),
  NotificationsDeniedError: class extends Error {},
}))

import Lobby from './Lobby'

afterEach(cleanup)

const stations = [
  { n: 1, lat: 3.1, lng: 101.1 },
  { n: 2, lat: 3.2, lng: 101.2 },
]

describe('Lobby setup map', () => {
  it("marshals see the setup map with numbered stations; runners don't", () => {
    const base = testView({ phase: 'lobby', stations })
    const { unmount } = render(<Lobby code="ABC234" view={{ ...base, me: { ...base.me, role: 'marshal' } }} refresh={vi.fn()} />)
    expect(screen.getByText('Setup: where things go')).toBeInTheDocument()
    expect(screen.getByText('Station 1')).toBeInTheDocument()
    expect(screen.getByText('Station 2')).toBeInTheDocument()
    expect(screen.getByText('Penjara')).toBeInTheDocument()
    expect(screen.getByText('Start')).toBeInTheDocument()
    unmount()
    render(<Lobby code="ABC234" view={base} refresh={vi.fn()} />)
    expect(screen.queryByText('Setup: where things go')).toBeNull()
  })
})

describe('Lobby: Dato Seri for marshals', () => {
  it('a marshal in a Full lobby gets the hidden card behind a closed toggle; a runner never does', () => {
    localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 'm1' }))
    const stash = { lat: 3.1, lng: 101.1, claimedBy: null, claimedAt: null }
    const base = testView({ phase: 'lobby', settings: { ...testView().settings, mode: 'full' }, datoStash: stash })
    const { unmount } = render(<Lobby code="ABC234" view={{ ...base, me: { ...base.me, role: 'marshal' } }} refresh={vi.fn()} />)
    expect(document.body.textContent).not.toMatch(/dato|legendary|yellow pin/i)
    fireEvent.click(screen.getByRole('button', { name: 'Organiser tools' }))
    expect(screen.getByRole('button', { name: 'Drop the ★ card here' })).toBeInTheDocument()
    unmount()
    render(<Lobby code="ABC234" view={{ ...base, datoStash: undefined }} refresh={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Organiser tools' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/dato/i)
    localStorage.clear()
  })
})

describe('Lobby mode badge', () => {
  it('shows CORE or FULL, and CORE when an older game has no mode', () => {
    const base = testView({ phase: 'lobby' })
    const { unmount } = render(<Lobby code="ABC234" view={{ ...base, settings: { ...base.settings, mode: 'full' } }} refresh={vi.fn()} />)
    expect(screen.getByText('FULL')).toBeInTheDocument()
    unmount()
    const old = { ...base.settings } as Partial<typeof base.settings>
    delete old.mode
    render(<Lobby code="ABC234" view={{ ...base, settings: old as typeof base.settings }} refresh={vi.fn()} />)
    expect(screen.getByText('CORE')).toBeInTheDocument()
  })
})
