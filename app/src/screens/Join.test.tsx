import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
import Join from './Join'

afterEach(cleanup)

describe('Join', () => {
  it('keeps the button disabled until both checkboxes are ticked', () => {
    render(<Join code="ABC234" />)
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Aina' } })
    const button = screen.getByRole('button', { name: /join game/i })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/no grabbing/i))
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/waiver/i))
    expect(button).toBeEnabled()
  })
})
