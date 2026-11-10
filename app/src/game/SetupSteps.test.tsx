import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import SetupSteps from './SetupSteps'

afterEach(cleanup)

const filled = () => Array.from(screen.getByRole('img').children).map((s) => s.classList.contains('on'))

describe('SetupSteps', () => {
  it('has five segments, the current step and those before it filled', () => {
    render(<SetupSteps step={3} />)
    expect(screen.getByRole('img', { name: 'Step 3 of 5' })).toBeInTheDocument()
    expect(filled()).toEqual([true, true, true, false, false])
  })

  it('fills only the first segment on step 1 and all five on step 5', () => {
    const { rerender } = render(<SetupSteps step={1} />)
    expect(filled()).toEqual([true, false, false, false, false])
    rerender(<SetupSteps step={5} />)
    expect(filled()).toEqual([true, true, true, true, true])
  })
})
