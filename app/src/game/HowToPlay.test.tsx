import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HowToPlay, { renderLine } from './HowToPlay'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const setup = (over: Partial<Parameters<typeof HowToPlay>[0]> = {}) => {
  const props = { side: 'runner' as const, mode: 'core' as const, snapshot: false, onClose: vi.fn(), onReady: vi.fn(), onOpened: vi.fn(), ...over }
  render(<HowToPlay {...props} />)
  return props
}

describe('HowToPlay', () => {
  it('right tap goes forward and left tap goes back', () => {
    setup()
    expect(screen.getByRole('heading')).toHaveTextContent("You're Dikejar.")
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    expect(screen.getByRole('heading')).toHaveTextContent('When it buzzes, check in.')
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }))
    expect(screen.getByRole('heading')).toHaveTextContent("You're Dikejar.")
  })

  it('advances every 7 seconds', () => {
    vi.useFakeTimers()
    setup()
    act(() => void vi.advanceTimersByTime(6_900))
    expect(screen.getByRole('heading')).toHaveTextContent("You're Dikejar.")
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.getByRole('heading')).toHaveTextContent('When it buzzes, check in.')
  })

  it('has one progress segment per card', () => {
    setup()
    expect(screen.getByTestId('segments').children).toHaveLength(7)
  })

  it("the last card shows I'm ready, which calls onReady and onClose", () => {
    const p = setup()
    expect(screen.queryByRole('button', { name: "I'm ready" })).toBeNull()
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }))
    expect(p.onReady).toHaveBeenCalledTimes(1)
    expect(p.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onOpened once', () => {
    const p = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    expect(p.onOpened).toHaveBeenCalledTimes(1)
  })

  it('shows the CORE badge', () => {
    setup()
    expect(screen.getByText('CORE')).toBeInTheDocument()
  })

  it('renders <b> bold and other tags as text', () => {
    const { container } = render(<p>{renderLine('a <b>bold</b> and <i>x</i><script>')}</p>)
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('i')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toBe('a bold and <i>x</i><script>')
  })

  it('is a modal dialog: aria-modal, focus on Close, Escape closes', () => {
    const p = setup()
    const dialog = screen.getByRole('dialog', { name: 'How to play' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(p.onClose).toHaveBeenCalledTimes(1)
  })

  it('lays out as a flex column with the ready button in the flow, not absolute', () => {
    setup()
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    const dialog = screen.getByRole('dialog', { name: 'How to play' })
    expect(dialog.style.display).toBe('flex')
    expect(dialog.style.flexDirection).toBe('column')
    const scene = screen.getByTestId('scene-box')
    expect(scene.style.height).toBe('min(250px, 40dvh)')
    expect(scene.style.minHeight).toBe('0px')
    const ready = screen.getByRole('button', { name: "I'm ready" })
    expect(ready.style.position).not.toBe('absolute')
    expect(dialog.contains(ready)).toBe(true)
  })

  it('keeps the Close button a 32px target away from the top-right SOS icon', () => {
    setup()
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close.style.width).toBe('32px')
    expect(close.style.height).toBe('32px')
    expect(close.parentElement?.style.justifyContent).toBe('space-between')
    expect(close.parentElement?.firstElementChild).toBe(close)
  })
})
