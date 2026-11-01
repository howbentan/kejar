import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CatchMoment, { CATCH_MOMENT_MS } from './CatchMoment'
import Stamp from './Stamp'

const vibrate = vi.fn()
beforeEach(() => {
  vi.useFakeTimers()
  vibrate.mockReset()
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Stamp', () => {
  it('shows its text, with or without the black plate', () => {
    const { container, rerender } = render(<Stamp text="dikejar!" />)
    expect(screen.getByText('dikejar!')).toBeInTheDocument()
    expect(container.querySelector('.stamp-plate')).toBeNull()
    rerender(<Stamp text="dikejar!" plate />)
    expect(container.querySelector('.stamp-plate')).not.toBeNull()
  })
})

describe('CatchMoment', () => {
  it('stamps dikejar!, names the runner, buzzes once, and finishes after the moment', () => {
    const onDone = vi.fn()
    render(<CatchMoment label="#07 Aina" onDone={onDone} />)
    expect(screen.getByText('dikejar!')).toBeInTheDocument()
    expect(screen.getByText('#07 Aina → Penjara')).toBeInTheDocument()
    expect(vibrate).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(CATCH_MOMENT_MS - 1))
    expect(onDone).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('a tap ends it early', () => {
    const onDone = vi.fn()
    render(<CatchMoment label="#07 Aina" onDone={onDone} />)
    fireEvent.click(screen.getByRole('status'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
