import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
import RunnerChase from './RunnerChase'
import { testView } from './testView'

afterEach(cleanup)

describe('RunnerChase', () => {
  it('shows the check-in card only in the last 30 s before a reveal', () => {
    const { unmount } = render(<RunnerChase code="ABC234" view={testView({ nextRevealAt: 100_000 + 20_000 })} />)
    expect(screen.getByText(/check in/i)).toBeInTheDocument()
    expect(screen.getByText('0:20')).toBeInTheDocument()
    unmount()
    render(<RunnerChase code="ABC234" view={testView({ nextRevealAt: 100_000 + 60_000 })} />)
    expect(screen.queryByText(/check in/i)).toBeNull()
  })

  it('shows the chaser warning when chaserNearby', () => {
    render(<RunnerChase code="ABC234" view={testView({ chaserNearby: true })} />)
    expect(screen.getByText('Chaser within 100 m')).toBeInTheDocument()
  })

  it('does not warn when no chaser is near', () => {
    render(<RunnerChase code="ABC234" view={testView()} />)
    expect(screen.queryByText('Chaser within 100 m')).toBeNull()
  })

  it('the game clock stands still while paused', () => {
    vi.useFakeTimers()
    try {
      render(<RunnerChase code="ABC234" view={testView({ paused: true, endsAt: 100_000 + 90_000 })} />)
      expect(screen.getByText('1:30')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(5_000))
      expect(screen.getByText('1:30')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
