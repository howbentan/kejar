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
    render(<SideQuest onFound={onFound} onClose={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    // The real words are always there for a screen reader; the glyph copy is hidden from it and has settled too.
    expect(screen.getAllByText('Find the Tupperware')).toHaveLength(2)
    expect(screen.getAllByText('SIDE QUEST')).toHaveLength(2)
    expect(screen.queryByText('BUZZING')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Found' }))
    expect(onFound).toHaveBeenCalledTimes(1)
  })

  it('the close button calls onClose', () => {
    const onClose = vi.fn()
    render(<SideQuest onFound={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('buzzes every 2 s while mounted, and stops on unmount', () => {
    const { unmount } = render(<SideQuest onFound={() => {}} onClose={() => {}} />)
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
    expect(() => render(<SideQuest onFound={() => {}} onClose={() => {}} />)).not.toThrow()
  })
})
