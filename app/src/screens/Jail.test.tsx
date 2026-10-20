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
})
