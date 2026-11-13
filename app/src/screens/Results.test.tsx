import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testView } from './testView'

vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))

import Results from './Results'

afterEach(cleanup)

const roster = [
  { id: 'r1', name: 'Aina', role: 'runner' as const, tag_id: 7, jailed: false },
  { id: 'c1', name: 'Ben', role: 'chaser' as const, tag_id: null, jailed: false },
  { id: 'r3', name: 'Wei', role: 'runner' as const, tag_id: 11, jailed: false },
]

describe('Results', () => {
  it('shows the winner line and three awards', () => {
    const view = testView({
      phase: 'ended',
      roster,
      results: {
        winner: 'runners',
        survivors: ['r1', 'r3'],
        longestSurvivor: { id: 'r1', ms: 25 * 60_000 },
        mostCatches: { id: 'c1', count: 2 },
        jailbreakHero: { id: 'r3', freed: 1 },
      },
    })
    render(<Results code="ABC234" view={view} isHost={false} />)
    expect(screen.getByText('Dikejar escaped.')).toBeInTheDocument()
    expect(screen.getByText('Aina · 25:00')).toBeInTheDocument()
    expect(screen.getByText('Ben · 2')).toBeInTheDocument()
    expect(screen.getByText('Wei · 1 freed')).toBeInTheDocument()
  })

  it('hides awards that are null', () => {
    const view = testView({
      phase: 'ended',
      roster,
      results: { winner: 'chasers', survivors: [], longestSurvivor: null, mostCatches: null, jailbreakHero: null },
    })
    render(<Results code="ABC234" view={view} isHost={false} />)
    expect(screen.getByText('Kejar win.')).toBeInTheDocument()
    expect(screen.queryByText(/most catches/i)).toBeNull()
    expect(screen.queryByText(/jailbreak hero/i)).toBeNull()
  })

  it('renders the post-game feedback: the fun rating and the report link', () => {
    const view = testView({ phase: 'ended', roster, results: null })
    render(<Results code="ABC234" view={view} isHost={false} />)
    expect(screen.getByText('How fun was it?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Report a player' })).toBeInTheDocument()
  })
})

describe('Results: the endgame (endgame design §6.4)', () => {
  const ended = (endgame: ReturnType<typeof testView>['endgame'], winner: 'runners' | 'chasers') =>
    testView({ phase: 'ended', roster, endgame, results: { winner, survivors: [], longestSurvivor: null, mostCatches: null, jailbreakHero: null } })

  it('names the endgame in its colour', () => {
    render(<Results code="ABC234" view={ended({ kind: 'bomba', revealedAt: 1, wanted: null, bountyCaught: false }, 'runners')} isHost={false} />)
    expect(screen.getByText('Endgame: Bomba.')).toHaveStyle({ color: 'var(--bomba)' })
  })

  it('Hang Hebat says whether the bounty was caught', () => {
    const wanted = { id: 'r1', label: '#07', name: 'Aina' }
    const { unmount } = render(<Results code="ABC234" view={ended({ kind: 'hebat', revealedAt: 1, wanted, bountyCaught: true }, 'chasers')} isHost={false} />)
    expect(screen.getByText('Endgame: Hang Hebat. The bounty was caught.')).toBeInTheDocument()
    unmount()
    render(<Results code="ABC234" view={ended({ kind: 'hebat', revealedAt: 1, wanted, bountyCaught: false }, 'runners')} isHost={false} />)
    expect(screen.getByText('Endgame: Hang Hebat. The bounty got away.')).toBeInTheDocument()
  })

  it('no line for a game with no endgame', () => {
    render(<Results code="ABC234" view={ended(null, 'runners')} isHost={false} />)
    expect(screen.queryByText(/Endgame:/)).toBeNull()
  })
})
