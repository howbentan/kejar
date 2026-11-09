import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => <div data-testid="map" /> }))
import LuarGarisan from './LuarGarisan'
import { testView } from './testView'

afterEach(cleanup)

const out = () => {
  const base = testView()
  return testView({ me: { ...base.me, disqualified_at: '1970-01-01T00:01:00.000Z' }, settle: null })
}

describe('LuarGarisan', () => {
  it('says what happened, and that they can play along', () => {
    render(<LuarGarisan view={out()} />)
    expect(screen.getByRole('heading', { name: /Luar Garisan/ })).toBeInTheDocument()
    expect(screen.getByText('Alamak, you left the play area. No winning this round, but you can still play along.')).toBeInTheDocument()
  })

  it('shows the spectator map', () => {
    render(<LuarGarisan view={out()} />)
    expect(screen.getByTestId('map')).toBeInTheDocument()
  })

  it('has none of Penjara: no ticket, walk guide, Settle or scan button', () => {
    const { container } = render(<LuarGarisan view={out()} />)
    expect(container.textContent).not.toMatch(/penjara/i)
    expect(screen.queryByText(/settle/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /scan/i })).toBeNull()
    expect(container.querySelector('.ticket, .walk-guide')).toBeNull()
    expect(container.textContent).not.toContain('—')
  })
})
