import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testView } from './testView'

const api = vi.hoisted(() => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  return { call: vi.fn(), ApiError }
})
vi.mock('../game/api', () => api)

import ReconnectCard from './ReconnectCard'

const arena = { ...testView().arena, name: 'Taman Tasik' }
const flush = () => act(async () => {})

beforeEach(() => {
  api.call.mockReset()
  localStorage.clear()
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't' }))
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ReconnectCard', () => {
  it('shows the plain card at once, then the details', async () => {
    let answer = (_v: unknown) => {}
    api.call.mockReturnValue(new Promise((r) => (answer = r)))
    render(<ReconnectCard href="/g/ABC234" code="ABC234" />)
    const link = screen.getByRole('link', { name: /reconnect/ })
    expect(link).toHaveAttribute('href', '/g/ABC234')
    expect(link).toHaveTextContent('ABC234')
    const now = Date.now()
    await act(async () => answer(testView({ phase: 'chasing', now, endsAt: now + 11.5 * 60_000, arena })))
    expect(screen.getByText('ABC234 · Taman Tasik · chasing · 12 min left')).toBeInTheDocument()
    expect(api.call).toHaveBeenCalledWith('state', { code: 'ABC234', token: 't' })
  })

  it.each([404, 401, 403])('hides when the game is gone or you are not in it (%i)', async (status) => {
    const onStatus = vi.fn()
    api.call.mockRejectedValue(new api.ApiError(status, 'nope'))
    render(<ReconnectCard href="/g/ABC234" code="ABC234" onStatus={onStatus} />)
    await flush()
    expect(screen.queryByRole('link')).toBeNull()
    expect(onStatus).toHaveBeenLastCalledWith(null)
  })

  it('stays plain on a 500', async () => {
    api.call.mockRejectedValue(new api.ApiError(500, 'down'))
    render(<ReconnectCard href="/g/ABC234" code="ABC234" />)
    await flush()
    expect(screen.getByRole('link', { name: /reconnect/ })).toBeInTheDocument()
  })

  it('reads back to the lobby in a lobby and see results when ended', async () => {
    api.call.mockResolvedValue(testView({ phase: 'lobby', now: Date.now(), arena }))
    render(<ReconnectCard href="/g/ABC234" code="ABC234" />)
    await flush()
    expect(screen.getByRole('link', { name: /back to the lobby/ })).toBeInTheDocument()
    cleanup()
    api.call.mockResolvedValue(testView({ phase: 'ended', now: Date.now(), arena }))
    render(<ReconnectCard href="/g/ABC234" code="ABC234" />)
    await flush()
    expect(screen.getByRole('link', { name: /see results/ })).toBeInTheDocument()
  })

  it('refreshes every 30 s while a start is coming, not while the tab is hidden', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    const startsAt = new Date(Date.now() + 10 * 60_000).toISOString()
    api.call.mockResolvedValue(testView({ phase: 'lobby', now: Date.now(), arena, settings: { ...testView().settings, startsAt } }))
    render(<ReconnectCard href="/g/ABC234" code="ABC234" />)
    await flush()
    expect(api.call).toHaveBeenCalledTimes(1)
    await act(async () => void vi.advanceTimersByTime(30_000))
    expect(api.call).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    await act(async () => void vi.advanceTimersByTime(60_000))
    expect(api.call).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    expect(api.call).toHaveBeenCalledTimes(3)
  })

  it('does not refresh a game with no start coming', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    api.call.mockResolvedValue(testView({ phase: 'chasing', now: Date.now(), endsAt: Date.now() + 600_000, arena }))
    render(<ReconnectCard href="/g/ABC234" code="ABC234" />)
    await flush()
    await act(async () => void vi.advanceTimersByTime(90_000))
    expect(api.call).toHaveBeenCalledTimes(1)
  })
})
