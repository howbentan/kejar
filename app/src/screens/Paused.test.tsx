import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Paused from './Paused'
import { testView } from './testView'

afterEach(cleanup)

describe('Paused', () => {
  it('shows the time-out picture with a marker frame, the frozen clock, and what to do', () => {
    const { container } = render(<Paused view={testView({ paused: true, endsAt: 100_000 + 90_000 })} />)
    expect(screen.getByRole('img', { name: 'Time out' })).toBeInTheDocument()
    expect(container.querySelector('.marker')).not.toBeNull()
    expect(screen.getByText('Game paused')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
    expect(screen.getByText('Stay where you are. A marshal will restart the game.')).toBeInTheDocument()
  })
})
