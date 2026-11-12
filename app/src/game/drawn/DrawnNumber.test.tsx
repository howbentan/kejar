import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

import DrawnNumber from './DrawnNumber'

beforeEach(() => (reduce.on = false))
afterEach(cleanup)

const digits = () => screen.getAllByTestId('dg').map((d) => [d.dataset.digit, d.classList.contains('draw')])

describe('DrawnNumber', () => {
  it('renders each digit and names the whole number', () => {
    render(<DrawnNumber text="4:30" />)
    expect(screen.getByRole('img', { name: '4:30' })).toBeInTheDocument()
    expect(screen.getAllByTestId('dg')).toHaveLength(3)
  })

  it('the first render draws every digit', () => {
    render(<DrawnNumber text="4:30" />)
    expect(digits()).toEqual([['4', true], ['3', true], ['0', true]])
  })

  it('only the digits that changed draw in', () => {
    const { rerender } = render(<DrawnNumber text="4:30" />)
    rerender(<DrawnNumber text="4:29" />)
    expect(digits()).toEqual([['4', false], ['2', true], ['9', true]])
  })

  it('with reduced motion nothing draws in', () => {
    reduce.on = true
    const { rerender } = render(<DrawnNumber text="4:30" />)
    rerender(<DrawnNumber text="4:29" />)
    expect(digits().every(([, d]) => d === false)).toBe(true)
  })
})
