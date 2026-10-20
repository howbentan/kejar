import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PingRipple from './PingRipple'

afterEach(cleanup)

describe('PingRipple', () => {
  it("tells a runner they've been pinged right after a ping, and buzzes", () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    render(<PingRipple role="runner" lastRevealAt={100_000} now={102_000} />)
    expect(screen.getByText("You've been pinged")).toBeInTheDocument()
    expect(vibrate).toHaveBeenCalled()
  })

  it('tells a chaser the runners were revealed', () => {
    render(<PingRipple role="chaser" lastRevealAt={100_000} now={102_000} />)
    expect(screen.getByText('Ping! Runners revealed')).toBeInTheDocument()
  })

  it('stays hidden once the moment has passed', () => {
    render(<PingRipple role="runner" lastRevealAt={100_000} now={120_000} />)
    expect(screen.queryByText("You've been pinged")).toBeNull()
  })

  it('stays hidden before any ping', () => {
    render(<PingRipple role="runner" lastRevealAt={null} now={120_000} />)
    expect(screen.queryByText("You've been pinged")).toBeNull()
  })
})
