import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MapViewButton from './MapViewButton'

afterEach(cleanup)

it('offers 3D while flat and flat while in 3D, and toggles on click', () => {
  const onToggle = vi.fn()
  const { rerender } = render(<MapViewButton threeD={false} onToggle={onToggle} />)
  const btn = screen.getByRole('button', { name: 'Show buildings in 3D' })
  expect(btn.classList.contains('on')).toBe(false)
  fireEvent.click(btn)
  expect(onToggle).toHaveBeenCalledTimes(1)
  rerender(<MapViewButton threeD onToggle={onToggle} />)
  expect(screen.getByRole('button', { name: 'Show buildings flat' }).classList.contains('on')).toBe(true)
})
