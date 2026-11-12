import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testView } from '../screens/testView'
import HijauTakeover, { SAFE_MS } from './HijauTakeover'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// testView's clock is at 100 000 ms.
const running = (over: Partial<NonNullable<ReturnType<typeof testView>['hijau']>> = {}) =>
  testView({ hijau: { startsAt: 90_000, deadline: 135_000, tapped: false, ...over } })

describe('HijauTakeover (new power-ups §6.3)', () => {
  it('fills the screen with the line, one big green button and the countdown to the deadline', () => {
    render(<HijauTakeover view={running()} onTap={vi.fn()} />)
    expect(screen.getByRole('alertdialog', { name: 'Mak kau hijau!' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mak kau hijau!' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tap the green' })).toBeEnabled()
    expect(screen.getByText('0:35')).toBeInTheDocument()
  })

  it('shows nothing with no Mak Kau Hijau, before it starts, or once tapped', () => {
    const { container, rerender } = render(<HijauTakeover view={testView()} onTap={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<HijauTakeover view={running({ startsAt: 120_000 })} onTap={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<HijauTakeover view={running({ tapped: true })} onTap={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('a tap calls touchGreen once, waits while it is in flight, says Safe, then hides', async () => {
    vi.useFakeTimers()
    let resolve: (r: { ok: true }) => void = () => {}
    const onTap = vi.fn(() => new Promise<{ ok: true }>((r) => (resolve = r)))
    const { container, rerender } = render(<HijauTakeover view={running()} onTap={onTap} />)
    const button = screen.getByRole('button', { name: 'Tap the green' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    await act(async () => resolve({ ok: true }))
    expect(screen.getByText('Safe! You touched green.')).toBeInTheDocument()
    // The next poll says tapped: the Safe line still stays up for its moment.
    rerender(<HijauTakeover view={running({ tapped: true })} onTap={onTap} />)
    expect(screen.getByText('Safe! You touched green.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(SAFE_MS))
    expect(container).toBeEmptyDOMElement()
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('too late shows nothing new (Penjara follows on the next poll)', async () => {
    const onTap = vi.fn(async () => ({ ok: false as const, reason: 'too-late' }))
    render(<HijauTakeover view={running()} onTap={onTap} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap the green' })))
    expect(screen.queryByText('Safe! You touched green.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Tap the green' })).toBeDisabled()
  })

  it('a dropped connection retries quietly inside the 45 s', async () => {
    vi.useFakeTimers()
    const onTap = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true })
    render(<HijauTakeover view={running()} onTap={onTap} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap the green' })))
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => vi.advanceTimersByTime(2_000))
    expect(onTap).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Safe! You touched green.')).toBeInTheDocument()
  })

  it('the countdown holds still while paused', () => {
    vi.useFakeTimers()
    render(<HijauTakeover view={{ ...running(), paused: true }} onTap={vi.fn()} />)
    act(() => vi.advanceTimersByTime(5_000))
    expect(screen.getByText('0:35')).toBeInTheDocument()
  })
})
