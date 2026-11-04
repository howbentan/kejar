import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'

const assign = vi.fn()

beforeEach(() => {
  assign.mockClear()
  vi.stubGlobal('location', { ...window.location, assign })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Home', () => {
  it('joins when Enter is pressed in the code box', () => {
    render(<Home />)
    const box = screen.getByLabelText(/game code/i)
    fireEvent.change(box, { target: { value: 'abc234' } })
    fireEvent.submit(box)
    expect(assign).toHaveBeenCalledWith('/join/ABC234')
  })

  it('does nothing on Enter until the code is 6 characters', () => {
    render(<Home />)
    const box = screen.getByLabelText(/game code/i)
    fireEvent.change(box, { target: { value: 'abc' } })
    fireEvent.submit(box)
    expect(assign).not.toHaveBeenCalled()
  })

  it('still joins from the Join button', () => {
    render(<Home />)
    fireEvent.change(screen.getByLabelText(/game code/i), { target: { value: 'ABC234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(assign).toHaveBeenCalledWith('/join/ABC234')
  })
})
