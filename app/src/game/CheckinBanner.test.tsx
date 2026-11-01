import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Checkin } from '../../shared/views.js'
import CheckinBanner from './CheckinBanner'

afterEach(cleanup)

const NOW = 1_000_000
const c = (state: Checkin['state'], missedInRow: 0 | 1 = 0): Checkin => ({ state, alertAt: NOW + 30_000, revealAt: NOW + 44_000, missedInRow })

describe('CheckinBanner', () => {
  it('checked in: says so, when Kejar see you, and that you can pocket the phone', () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    render(<CheckinBanner checkin={c('in')} now={NOW} openedByPush={false} />)
    expect(screen.getByText('Checked in')).toBeInTheDocument()
    expect(screen.getByText('Kejar see you in 0:44')).toBeInTheDocument()
    expect(screen.getByText('You can pocket your phone now.')).toBeInTheDocument()
    expect(vibrate).toHaveBeenCalledWith(80)
  })

  it('open: check in now', () => {
    render(<CheckinBanner checkin={c('open')} now={NOW} openedByPush={false} />)
    expect(screen.getByText('Check in now')).toBeInTheDocument()
    expect(screen.getByText('Kejar see you in 0:44')).toBeInTheDocument()
  })

  it('early: nothing, unless the check-in push opened the page', () => {
    const { container, unmount } = render(<CheckinBanner checkin={c('early')} now={NOW} openedByPush={false} />)
    expect(container).toBeEmptyDOMElement()
    unmount()
    render(<CheckinBanner checkin={c('early')} now={NOW} openedByPush />)
    expect(screen.getByText('Check-in opens in 0:30')).toBeInTheDocument()
    expect(screen.getByText('Keep Kejar open and it checks you in by itself')).toBeInTheDocument()
  })

  it('missed: says so, and that one more means Penjara', () => {
    render(<CheckinBanner checkin={c('missed', 1)} now={NOW} openedByPush={false} />)
    expect(screen.getByText('Missed this check-in')).toBeInTheDocument()
    expect(screen.getByText('Kejar saw your last spot, marked "missed"')).toBeInTheDocument()
    expect(screen.getByText('MISSED IN A ROW')).toBeInTheDocument()
    expect(screen.getByText("Miss the next one too and you're sent to Penjara.")).toBeInTheDocument()
  })

  it('nothing for a runner with no check-in', () => {
    const { container } = render(<CheckinBanner checkin={null} now={NOW} openedByPush={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
