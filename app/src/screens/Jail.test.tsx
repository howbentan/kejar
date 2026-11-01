import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
import { ARRIVAL_MS } from '../game/PenjaraArrival'
import Jail from './Jail'
import { testView } from './testView'

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const CAUGHT_LINES = ['Masuk penjara, bossku!', 'Lepak kat Penjara dulu, bro.', 'Habis la, boss.', 'Hailat bro.', 'Skill issue.']
/** testView's clock is at 100 000 ms; caught `ago` ms before it. */
const caught = (ago: number, over: Partial<ReturnType<typeof testView>['me']> = {}) => {
  const view = testView({ caughtBy: 'Ben', jailReason: 'caught' })
  return { ...view, me: { ...view.me, jailed: true, caught_by: 'c1', caught_at: new Date(100_000 - ago).toISOString(), ...over } }
}

describe('Jail', () => {
  it('a fresh catch lands the bars and the stamp, then says who got you', () => {
    vi.useFakeTimers()
    render(<Jail code="ABC234" view={caught(3_000)} />)
    expect(screen.getByText('dikejar!')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(ARRIVAL_MS))
    expect(screen.queryByText('dikejar!')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ben got you.' })).toBeInTheDocument()
    expect(CAUGHT_LINES.some((l) => screen.queryByText(l))).toBe(true)
  })

  it('the moment plays once: reopening the page goes straight to Penjara', () => {
    vi.useFakeTimers()
    const { unmount } = render(<Jail code="ABC234" view={caught(3_000)} />)
    act(() => vi.advanceTimersByTime(ARRIVAL_MS))
    unmount()
    render(<Jail code="ABC234" view={caught(3_000)} />)
    expect(screen.queryByText('dikejar!')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ben got you.' })).toBeInTheDocument()
  })

  it('an old catch shows no moment', () => {
    render(<Jail code="ABC234" view={caught(60_000)} />)
    expect(screen.queryByText('dikejar!')).toBeNull()
    expect(screen.getByText('PENJARA')).toBeInTheDocument()
  })

  it('with no location, points at the pin and keeps the spectator view', () => {
    const view = caught(60_000)
    render(<Jail code="ABC234" view={{ ...view, settings: { ...view.settings, spectatorDelayMin: 3 } }} />)
    expect(screen.getByText('Walk to the PENJARA pin on the map.')).toBeInTheDocument()
    expect(screen.getByText('Spectator view · 3 min delayed')).toBeInTheDocument()
  })

  it('auto-jailed: says why, gives a line, and points to a marshal', () => {
    const view = testView({ caughtBy: null, jailReason: 'missed-checkins' })
    render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true } }} />)
    expect(screen.getByText('PENJARA · AUTO')).toBeInTheDocument()
    expect(screen.getByText(/Missed two check-ins\./)).toBeInTheDocument()
    const lines = ['Your phone went ponteng, bro.', 'Signal hilang, bossku?', 'Kena check in lah, boss.', 'Phone in your pocket too deep.']
    expect(lines.some((l) => screen.queryByText(l))).toBe(true)
    expect(screen.getByText('Phone died or no buzz? Tell a marshal.')).toBeInTheDocument()
  })

  it('auto-jailed after already being freed once: out for good', () => {
    const view = testView({ caughtBy: null, jailReason: 'missed-checkins' })
    render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true, freed_once: true } }} />)
    expect(screen.getByText(/That's the game for you\./)).toBeInTheDocument()
    expect(screen.getByText('You were already freed once, so you stay in Penjara until the end. Watch the chase from here.')).toBeInTheDocument()
  })

  it('already broken out once: says they stay this time', () => {
    render(<Jail code="ABC234" view={caught(60_000, { freed_once: true })} />)
    expect(screen.getByText('You’ve already been broken out once, so you stay in Penjara this time.')).toBeInTheDocument()
  })
})
