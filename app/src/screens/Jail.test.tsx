import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
import Jail from './Jail'
import { testView } from './testView'

afterEach(cleanup)

describe('Jail', () => {
  it('shows who caught you and the spectator delay label from settings', () => {
    const view = testView({ caughtBy: 'Ben', settings: { ...testView().settings, spectatorDelayMin: 3 } })
    render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true } }} />)
    expect(screen.getByText('Caught by Ben')).toBeInTheDocument()
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

  it('calls it Penjara everywhere', () => {
    const view = testView({ caughtBy: 'Ben' })
    render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true, freed_once: true } }} />)
    expect(screen.getByText('Penjara')).toBeInTheDocument()
    expect(screen.getByText(/Walk to Penjara\./)).toBeInTheDocument()
    expect(screen.getByText('You’ve already been broken out once, so you stay in Penjara this time.')).toBeInTheDocument()
  })
})
