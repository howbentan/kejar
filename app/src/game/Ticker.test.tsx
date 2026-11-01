import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FeedItem } from '../../shared/views.js'
import Ticker from './Ticker'

afterEach(cleanup)

const item = (n: number, over: Partial<FeedItem> = {}): FeedItem => ({
  at: new Date(1_000_000 + n * 1_000).toISOString(),
  text: `Line ${n}.`,
  means: `Means ${n}.`,
  act: false,
  label: 'PING',
  ...over,
})

describe('Ticker', () => {
  it('shows the newest line with its label and what it means', () => {
    render(<Ticker feed={[item(2), item(1)]} />)
    const t = screen.getByRole('button', { name: /feed/i })
    expect(t).toHaveTextContent('PING')
    expect(t).toHaveTextContent('Line 2.')
    expect(t).toHaveTextContent('→ Means 2.')
  })

  it('counts lines that came in since the feed was last opened', () => {
    const { rerender } = render(<Ticker feed={[item(1)]} />)
    expect(screen.queryByText('+2')).toBeNull()
    rerender(<Ticker feed={[item(3), item(2), item(1)]} />)
    expect(screen.getByText('+2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /feed/i }))
    expect(screen.queryByText('+2')).toBeNull()
  })

  it('outlines a line that needs you to act, and buzzes once when it first arrives', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    const { rerender } = render(<Ticker feed={[item(1)]} />)
    const urgent = item(2, { act: true, label: 'Mat Rempit' })
    rerender(<Ticker feed={[urgent, item(1)]} />)
    rerender(<Ticker feed={[urgent, item(1)]} />)
    expect(screen.getByRole('button', { name: /feed/i })).toHaveClass('act')
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith(60)
  })

  it('tapping opens the sheet with every line and its meaning', () => {
    render(<Ticker feed={[item(3), item(2), item(1, { means: null })]} />)
    fireEvent.click(screen.getByRole('button', { name: /feed/i }))
    const sheet = screen.getByRole('dialog', { name: 'Feed' })
    expect(sheet).toHaveTextContent('Line 3.')
    expect(sheet).toHaveTextContent('Means 2.')
    expect(sheet).toHaveTextContent('Line 1.')
  })

  it('screen readers hear the newest line and what it means', () => {
    render(<Ticker feed={[item(2), item(1)]} />)
    expect(screen.getByRole('button', { name: 'Feed: Line 2. Means 2.' })).toBeInTheDocument()
  })

  it('shows nothing to open before anything has happened', () => {
    render(<Ticker feed={[]} />)
    expect(screen.getByRole('button', { name: /feed/i })).toHaveTextContent('Nothing yet')
  })
})
