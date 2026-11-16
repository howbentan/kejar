import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SideQuest from './SideQuest'

const vibrate = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  vibrate.mockReset()
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete (navigator as { vibrate?: unknown }).vibrate
})

describe('SideQuest', () => {
  it('settles into its words after the decode, and Found calls onFound', () => {
    const onFound = vi.fn()
    render(<SideQuest gameCode="ABC234" onFound={onFound} onClose={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('Find the Tupperware')).toBeInTheDocument()
    expect(screen.getByText('SIDE QUEST')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Found' }))
    expect(onFound).toHaveBeenCalledTimes(1)
  })

  it('the close button calls onClose', () => {
    const onClose = vi.fn()
    render(<SideQuest gameCode="ABC234" onFound={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('buzzes every 2 s while mounted, and stops on unmount', () => {
    const { unmount } = render(<SideQuest gameCode="ABC234" onFound={() => {}} onClose={() => {}} />)
    expect(vibrate).toHaveBeenCalledWith([300, 200, 300])
    vibrate.mockClear()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(vibrate).toHaveBeenCalledTimes(2)
    unmount()
    vibrate.mockClear()
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(vibrate).not.toHaveBeenCalledWith([300, 200, 300])
  })

  it('runs fine where the phone cannot vibrate', () => {
    delete (navigator as { vibrate?: unknown }).vibrate
    expect(() => render(<SideQuest gameCode="ABC234" onFound={() => {}} onClose={() => {}} />)).not.toThrow()
  })
})
