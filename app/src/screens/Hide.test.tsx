import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useWakeLock = vi.hoisted(() => vi.fn())
vi.mock('../game/useWakeLock', () => ({ useWakeLock }))
vi.mock('../game/Map', () => ({ default: () => null }))

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
    render(<Hide view={as('chaser')} />)
    expect(useWakeLock).toHaveBeenLastCalledWith(true)
  })

  it('a runner on the hide screen never asks for the lock', () => {
    render(<Hide view={as('runner')} />)
    expect(useWakeLock).not.toHaveBeenCalledWith(true)
  })
})
