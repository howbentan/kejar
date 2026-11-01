import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
const scanned = vi.hoisted(() => ({ text: '' }))
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
const mapProps = vi.hoisted(() => ({ last: null as null | { ripple?: { at: number } | null } }))
vi.mock('../game/Map', () => ({
  default: (p: { ripple?: { at: number } | null }) => {
    mapProps.last = p
    return <div data-testid="map" />
  },
}))
vi.mock('../game/here', () => ({ currentCoords: async () => ({}) }))
vi.mock('../game/Scanner', () => ({
  default: ({ onResult }: { onResult: (t: string) => void }) => (
    <button type="button" onClick={() => onResult(scanned.text)}>
      fake camera
    </button>
  ),
}))
import RunnerChase from './RunnerChase'
import { testView } from './testView'

beforeEach(() => {
  call.mockReset()
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

async function scan(text: string) {
  scanned.text = text
  fireEvent.click(screen.getByRole('button', { name: 'Scan' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'fake camera' })))
}

describe('RunnerChase', () => {
  it('is one screen: top bar, chip, map, slot, Scan and the ticker, with no separate break-out button', () => {
    const view = testView({
      counts: { runnersFree: 9, runnersJailed: 2, chasers: 2 },
      checkin: { state: 'early', alertAt: 100_000 + 134_000, revealAt: 100_000 + 179_000, missedInRow: 0 },
    })
    render(<RunnerChase code="ABC234" view={view} />)
    expect(screen.getByText('DIKEJAR #07')).toBeInTheDocument()
    expect(screen.getByText('9 free')).toBeInTheDocument()
    expect(screen.getByText('Check in in 2:14')).toBeInTheDocument()
    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.getByText('No power-up. Find a station and scan it.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /feed/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /break them out/i })).toBeNull()
  })

  it('shows the banner instead of the chip once the window opens', () => {
    render(<RunnerChase code="ABC234" view={testView({ checkin: { state: 'open', alertAt: 100_000, revealAt: 120_000, missedInRow: 0 } })} />)
    expect(screen.getByText('Check in now')).toBeInTheDocument()
    expect(screen.getByText('Kejar see you in 0:20')).toBeInTheDocument()
    expect(screen.queryByText(/^Check in in/)).toBeNull()
  })

  it('scanning the Penjara code breaks people out', async () => {
    call.mockResolvedValue({ ok: true, freedIds: ['r2', 'r3'] })
    render(<RunnerChase code="ABC234" view={testView({ counts: { runnersFree: 3, runnersJailed: 2, chasers: 1 } })} />)
    await scan('KEJAR:JAIL')
    expect(call).toHaveBeenCalledWith('jailbreak', { code: 'ABC234', token: 't1', qr: 'KEJAR:JAIL' })
    expect(screen.getByText('Freed 2 Dikejar ✓')).toBeInTheDocument()
  })

  it('scanning a station claims it, opens the lucky dip, and no other scan can start meanwhile', async () => {
    call.mockResolvedValue({ ok: true, kind: 'shield' })
    render(<RunnerChase code="ABC234" view={testView()} />)
    await scan('KEJAR:STATION:2')
    expect(call).toHaveBeenCalledWith('claim', { code: 'ABC234', token: 't1', qr: 'KEJAR:STATION:2' })
    expect(screen.getByText('CLAIMED · Station 2 ✓')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan' })).toBeDisabled()
  })

  it('while a claim is still on its way, no second scan can start', async () => {
    let finish: (v: unknown) => void = () => {}
    call.mockImplementation(() => new Promise((r) => (finish = r)))
    render(<RunnerChase code="ABC234" view={testView()} />)
    await scan('KEJAR:STATION:2')
    expect(screen.getByRole('button', { name: 'Scan' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }))
    expect(screen.queryByRole('button', { name: 'fake camera' })).toBeNull()
    expect(call).toHaveBeenCalledTimes(1)
    await act(async () => finish({ ok: false, reason: 'too-far' }))
    expect(screen.getByRole('button', { name: 'Scan' })).not.toBeDisabled()
  })

  it('a refused claim names the station, with no dip', async () => {
    call.mockResolvedValue({ ok: false, reason: 'too-far' })
    render(<RunnerChase code="ABC234" view={testView()} />)
    await scan('KEJAR:STATION:2')
    expect(screen.getByText('Get closer. You need to be within 30 m of Station 2.')).toBeInTheDocument()
    expect(screen.queryByText(/CLAIMED/)).toBeNull()
  })

  it('scanning anything else says so and calls nothing', async () => {
    render(<RunnerChase code="ABC234" view={testView()} />)
    await scan('KEJAR:TAG:03')
    expect(call).not.toHaveBeenCalled()
    expect(screen.getByText("That's not a station or Penjara code")).toBeInTheDocument()
  })

  it('the ping ripples out on the map, with no ping card on the chase screen', () => {
    render(<RunnerChase code="ABC234" view={testView({ lastRevealAt: 99_000 })} />)
    expect(mapProps.last?.ripple?.at).toBe(99_000)
    expect(screen.queryByText("You've been pinged")).toBeNull()
  })

  it('warns that check-ins will be missed when location is off', () => {
    render(<RunnerChase code="ABC234" view={testView()} locationOff />)
    expect(screen.getByText("Location is off, so you'll miss check-ins and be sent to Penjara.")).toBeInTheDocument()
    expect(screen.getByText('Turn on location for this site in your browser settings.')).toBeInTheDocument()
  })

  it('shows no location warning when location is working', () => {
    render(<RunnerChase code="ABC234" view={testView()} />)
    expect(screen.queryByText(/Location is off/)).toBeNull()
  })

  it('shows the chaser warning when chaserNearby', () => {
    render(<RunnerChase code="ABC234" view={testView({ chaserNearby: true })} />)
    expect(screen.getByText('Kejar within 100 m')).toBeInTheDocument()
  })

  it('does not warn when no chaser is near', () => {
    render(<RunnerChase code="ABC234" view={testView()} />)
    expect(screen.queryByText('Kejar within 100 m')).toBeNull()
  })

  it('the game clock stands still while paused', () => {
    vi.useFakeTimers()
    try {
      render(<RunnerChase code="ABC234" view={testView({ paused: true, endsAt: 100_000 + 90_000 })} />)
      expect(screen.getByText('1:30')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(5_000))
      expect(screen.getByText('1:30')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the early banner when the check-in push opened the page, then tidies the URL', () => {
    window.history.replaceState(null, '', '/g/ABC234?checkin=1')
    render(<RunnerChase code="ABC234" view={testView({ checkin: { state: 'early', alertAt: 130_000, revealAt: 175_000, missedInRow: 0 } })} />)
    expect(screen.getByText('Check-in opens in 0:30')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('the push only explains its own ping: the next early period is a chip again', () => {
    window.history.replaceState(null, '', '/g/ABC234?checkin=1')
    const early = (alertAt: number) => testView({ checkin: { state: 'early', alertAt, revealAt: alertAt + 45_000, missedInRow: 0 } })
    const { rerender } = render(<RunnerChase code="ABC234" view={early(130_000)} />)
    rerender(<RunnerChase code="ABC234" view={early(130_000 + 300_000)} />)
    expect(screen.queryByText(/^Check-in opens in/)).toBeNull()
    expect(screen.getByText('Check in in 5:30')).toBeInTheDocument()
  })
})
