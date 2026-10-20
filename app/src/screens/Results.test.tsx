import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Results from './Results'
import { testView } from './testView'

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
    render(<Results view={view} isHost={false} />)
    expect(screen.getByText('Runners escaped.')).toBeInTheDocument()
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
    render(<Results view={view} isHost={false} />)
    expect(screen.getByText('Chasers win.')).toBeInTheDocument()
    expect(screen.queryByText(/most catches/i)).toBeNull()
    expect(screen.queryByText(/jailbreak hero/i)).toBeNull()
  })
})
