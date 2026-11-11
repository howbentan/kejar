import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useWakeLock = vi.hoisted(() => vi.fn())
vi.mock('../game/useWakeLock', () => ({ useWakeLock }))
vi.mock('../game/Map', () => ({ default: () => null }))
vi.mock('../game/push', () => ({
  subscribe: vi.fn(),
  pushSupport: () => 'ok',
  currentPushEnv: () => ({}),
  NotificationsDeniedError: class extends Error {},
}))

import Hide from './Hide'
import { testView } from './testView'

const as = (role: 'chaser' | 'runner') => {
  const base = testView()
  return testView({ phase: 'hiding', me: { ...base.me, role } })
}

beforeEach(() => useWakeLock.mockClear())
afterEach(cleanup)

describe('Hide', () => {
  it('a chaser on the hide screen keeps the screen awake', () => {
    render(<Hide code="ABC234" view={as('chaser')} />)
    expect(useWakeLock).toHaveBeenLastCalledWith(true)
  })

  it('a runner on the hide screen never asks for the lock', () => {
    render(<Hide code="ABC234" view={as('runner')} />)
    expect(useWakeLock).not.toHaveBeenCalledWith(true)
  })
})

describe('Hide: alerts after New phone', () => {
  it('a runner in push mode with no subscription can turn alerts back on', () => {
    render(<Hide code="ABC234" view={as('runner')} />)
    expect(screen.getByRole('button', { name: 'Turn on alerts' })).toBeInTheDocument()
  })
  it('a chaser is not asked', () => {
    render(<Hide code="ABC234" view={as('chaser')} />)
    expect(screen.queryByRole('button', { name: 'Turn on alerts' })).toBeNull()
  })
})
