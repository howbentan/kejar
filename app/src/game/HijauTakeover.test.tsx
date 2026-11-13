import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testView } from '../screens/testView'
import HijauTakeover, { SAFE_MS } from './HijauTakeover'

const SAFE_LINE = 'You touched green. The Kejar can see where you tapped.'

// Fake timers and a fixed Date.now for every test: the countdown ticks off `useServerNow`'s 1 s interval, so a slow
// run on real timers could shift the value under an assertion.
beforeEach(() => {
  vi.useFakeTimers({ now: 5_000_000 })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// testView's clock is at 100 000 ms.
const running = (over: Partial<NonNullable<ReturnType<typeof testView>['hijau']>> = {}) =>
  testView({ hijau: { claimedAt: 90_000, startsAt: 90_000, deadline: 110_000, tapped: false, ...over } })

const lit = (c: HTMLElement) => c.querySelectorAll('.hijau-seg.on').length

describe('HijauTakeover (new power-ups §6.3, tap screen A)', () => {
  it('fills the screen flat green: the sticker, the title, the countdown panel and one black pill', () => {
    const { container } = render(<HijauTakeover view={running()} onTap={vi.fn()} />)
    expect(screen.getByRole('alertdialog', { name: 'Mak kau hijau!' })).toBeInTheDocument()
    expect(screen.getByText('MAK KAU HIJAU · LEGENDARY')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Mak Kau Hijau' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'mak kau hijau!' })).toBeInTheDocument()
    expect(screen.getByText('TAP IN')).toBeInTheDocument()
    expect(screen.getByText('0:10')).toBeInTheDocument()
    expect(screen.getByText('Miss it and you go to Penjara. Tap and the Kejar see where you are.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tap the green' })).toBeEnabled()
    // Ten segments, half lit with 10 of the 20 s left.
    expect(container.querySelectorAll('.hijau-seg')).toHaveLength(10)
    expect(lit(container)).toBe(5)
  })

  it('the bar drains with the clock', () => {
    const { container } = render(<HijauTakeover view={running()} onTap={vi.fn()} />)
    act(() => vi.advanceTimersByTime(6_000))
    expect(screen.getByText('0:04')).toBeInTheDocument()
    expect(lit(container)).toBe(2)
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
    let resolve: (r: { ok: true }) => void = () => {}
    const onTap = vi.fn(() => new Promise<{ ok: true }>((r) => (resolve = r)))
    const { container, rerender } = render(<HijauTakeover view={running()} onTap={onTap} />)
    const button = screen.getByRole('button', { name: 'Tap the green' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    await act(async () => resolve({ ok: true }))
    expect(screen.getByText(SAFE_LINE)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'safe!' })).toBeInTheDocument()
    expect(screen.getByText('safe!', { selector: '.stamp' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    // The next poll says tapped: the Safe line still stays up for its moment.
    rerender(<HijauTakeover view={running({ tapped: true })} onTap={onTap} />)
    expect(screen.getByText(SAFE_LINE)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(SAFE_MS))
    expect(container).toBeEmptyDOMElement()
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('too late shows nothing new (Penjara follows on the next poll)', async () => {
    const onTap = vi.fn(async () => ({ ok: false as const, reason: 'too-late' }))
    render(<HijauTakeover view={running()} onTap={onTap} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap the green' })))
    expect(screen.queryByText(SAFE_LINE)).toBeNull()
    expect(screen.getByRole('button', { name: 'Tap the green' })).toBeDisabled()
  })

  it('a dropped connection retries quietly inside the 20 s', async () => {
    const onTap = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true })
    render(<HijauTakeover view={running()} onTap={onTap} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap the green' })))
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => vi.advanceTimersByTime(2_000))
    expect(onTap).toHaveBeenCalledTimes(2)
    expect(screen.getByText(SAFE_LINE)).toBeInTheDocument()
  })

  it('the countdown holds still while paused', () => {
    render(<HijauTakeover view={{ ...running(), paused: true }} onTap={vi.fn()} />)
    act(() => vi.advanceTimersByTime(5_000))
    expect(screen.getByText('0:10')).toBeInTheDocument()
  })

  it('the countdown ticks with the clock', () => {
    render(<HijauTakeover view={running()} onTap={vi.fn()} />)
    act(() => vi.advanceTimersByTime(5_000))
    expect(screen.getByText('0:05')).toBeInTheDocument()
  })

  it('after a good tap it stays hidden for that run, even if a slow poll still says not tapped', async () => {
    const onTap = vi.fn(async () => ({ ok: true as const }))
    const { container, rerender } = render(<HijauTakeover view={running()} onTap={onTap} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap the green' })))
    act(() => vi.advanceTimersByTime(SAFE_MS))
    rerender(<HijauTakeover view={{ ...running(), now: 100_000 + SAFE_MS }} onTap={onTap} />)
    expect(container).toBeEmptyDOMElement()
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('stays hidden after a pause and resume shifts startsAt and deadline, while a slow poll says not tapped', async () => {
    const onTap = vi.fn(async () => ({ ok: true as const }))
    const { container, rerender } = render(<HijauTakeover view={running()} onTap={onTap} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap the green' })))
    act(() => vi.advanceTimersByTime(SAFE_MS))
    // Paused for 30 s, then resumed: the server moved startsAt and deadline later; claimedAt stays put.
    const resumed = { ...running({ startsAt: 120_000, deadline: 140_000 }), now: 130_000 }
    rerender(<HijauTakeover view={resumed} onTap={onTap} />)
    expect(container).toBeEmptyDOMElement()
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('a later Mak Kau Hijau still shows, with its button ready', async () => {
    const onTap = vi.fn(async () => ({ ok: true as const }))
    const { rerender } = render(<HijauTakeover view={running()} onTap={onTap} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap the green' })))
    act(() => vi.advanceTimersByTime(SAFE_MS))
    const later = testView({ now: 500_000, hijau: { claimedAt: 490_000, startsAt: 490_000, deadline: 510_000, tapped: false } })
    rerender(<HijauTakeover view={later} onTap={onTap} />)
    expect(screen.getByRole('button', { name: 'Tap the green' })).toBeEnabled()
  })

  it('is a modal dialog, and focus moves to the button when it opens', () => {
    render(<HijauTakeover view={running()} onTap={vi.fn()} />)
    expect(screen.getByRole('alertdialog', { name: 'Mak kau hijau!' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Tap the green' })).toHaveFocus()
  })
})
