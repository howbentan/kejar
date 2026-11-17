import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
const scanned = vi.hoisted(() => ({ text: '' }))
const useWakeLock = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
type MapProps = { ripple?: { at: number } | null; snapshot?: unknown; legendaryZone?: unknown }
const mapProps = vi.hoisted(() => ({ last: null as null | MapProps }))
vi.mock('../game/Map', () => ({
  default: (p: MapProps) => {
    mapProps.last = p
    return <div data-testid="map" />
  },
}))
const here = vi.hoisted(() => ({ coords: {} as Record<string, number>, pending: null as null | Promise<Record<string, number>>, last: null as null | Record<string, number> }))
vi.mock('../game/here', () => ({ currentCoords: () => here.pending ?? Promise.resolve(here.coords), lastCoords: () => here.last }))
vi.mock('../game/Scanner', () => ({
  default: ({ onResult, hint, numberFallback }: { onResult: (t: string) => void; hint?: string; numberFallback?: { label: string } }) => (
    <>
      <p>{hint}</p>
      {numberFallback && <p>{numberFallback.label}</p>}
      <button type="button" onClick={() => onResult(scanned.text)}>
        fake camera
      </button>
    </>
  ),
}))
vi.mock('../game/useWakeLock', () => ({ useWakeLock }))
vi.mock('../game/push', () => ({
  subscribe: vi.fn(),
  pushSupport: () => 'ok',
  currentPushEnv: () => ({}),
  NotificationsDeniedError: class extends Error {},
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

describe('RunnerChase: Mak Kau Hijau and the new hint zones (Plan E2)', () => {
  it('takes over the screen and a tap sends touchGreen with my token and where I am', async () => {
    call.mockResolvedValue({ ok: true })
    here.coords = { lat: 3.1, lng: 101.6, accuracy_m: 9 }
    render(<RunnerChase code="ABC234" view={testView({ hijau: { claimedAt: 90_000, startsAt: 90_000, deadline: 110_000, tapped: false } })} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap the green' })))
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('touchGreen', { code: 'ABC234', token: 't1', lat: 3.1, lng: 101.6, accuracy_m: 9 })
    expect(screen.getByText('You touched green. The Kejar can see where you tapped.')).toBeInTheDocument()
    here.coords = {}
  })

  it("a tap never waits on a slow GPS: it goes out within 300 ms with no fix, and the server uses the stored one", async () => {
    vi.useFakeTimers({ now: 5_000_000 })
    try {
      call.mockResolvedValue({ ok: true })
      here.pending = new Promise(() => {}) // the phone never answers
      render(<RunnerChase code="ABC234" view={testView({ hijau: { claimedAt: 90_000, startsAt: 90_000, deadline: 110_000, tapped: false } })} />)
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tap the green' })))
      await act(async () => vi.advanceTimersByTime(299))
      expect(call).not.toHaveBeenCalled()
      await act(async () => vi.advanceTimersByTime(1))
      expect(call).toHaveBeenCalledTimes(1)
      expect(call).toHaveBeenCalledWith('touchGreen', { code: 'ABC234', token: 't1' })
    } finally {
      here.pending = null
      vi.useRealTimers()
    }
  })

  it('passes no hint zones to the map (the Tupperware side quest replaced them)', () => {
    render(<RunnerChase code="ABC234" view={testView()} />)
    for (const zone of ['legendaryZone', 'bomohZone', 'ringZone', 'hijauZone']) expect(mapProps.last).not.toHaveProperty(zone)
  })
})

describe('RunnerChase', () => {
  it('never asks for a wake lock', () => {
    render(<RunnerChase code="ABC234" view={testView()} locationOff={false} />)
    expect(useWakeLock).not.toHaveBeenCalled()
  })

  it('is one screen: top bar, chip, map, slot, Scan and the ticker, with no separate break-out button', () => {
    const view = testView({
      counts: { runnersFree: 9, runnersJailed: 2, runnersLuarGarisan: 0, chasers: 2 },
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

  it('shows the Luar Garisan warning banner while warned, and not otherwise', () => {
    render(<RunnerChase code="ABC234" view={testView({ outWarned: true })} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Eh, you're outside the play area! Balik within 30 seconds or you're out.")
    cleanup()
    render(<RunnerChase code="ABC234" view={testView()} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the banner instead of the chip once the window opens', () => {
    render(<RunnerChase code="ABC234" view={testView({ checkin: { state: 'open', alertAt: 100_000, revealAt: 120_000, missedInRow: 0 } })} />)
    expect(screen.getByText('Check in now')).toBeInTheDocument()
    expect(screen.getByText('Kejar see you in 0:20')).toBeInTheDocument()
    expect(screen.queryByText(/^Check in in/)).toBeNull()
  })

  it('scanning the Penjara code claims the rescue and opens the HOLD screen straight away, before the next poll', async () => {
    call.mockResolvedValue({ ok: true, rescue: 'started' })
    render(<RunnerChase code="ABC234" view={testView({ counts: { runnersFree: 3, runnersJailed: 2, runnersLuarGarisan: 0, chasers: 1 } })} />)
    await scan('KEJAR:JAIL')
    expect(call).toHaveBeenCalledWith('jailbreak', { code: 'ABC234', token: 't1', qr: 'KEJAR:JAIL' })
    expect(screen.getByRole('button', { name: 'HOLD' })).toBeInTheDocument()
    expect(screen.getByText('Press and hold for 20 s. Let go and it waits 5 s, then resets.')).toBeInTheDocument()
  })

  it("the rescuer's own re-scan resumes: back on the rescue screen", async () => {
    call.mockResolvedValue({ ok: true, rescue: 'resumed' })
    render(<RunnerChase code="ABC234" view={testView()} />)
    await scan('KEJAR:JAIL')
    expect(screen.getByRole('button', { name: 'HOLD' })).toBeInTheDocument()
  })

  it('a second runner is told who already has the rescue, and gets no HOLD button', async () => {
    call.mockResolvedValue({ ok: false, reason: 'rescue-taken', byName: 'Hafiz' })
    render(<RunnerChase code="ABC234" view={testView()} />)
    await scan('KEJAR:JAIL')
    expect(screen.getByText('Hafiz is already breaking them out.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'HOLD' })).toBeNull()
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
    // While the claim is checked, the Scan button runs the small j beside "Checking".
    const checking = screen.getByRole('button', { name: 'Checking' })
    expect(checking).toBeDisabled()
    expect(checking).toContainElement(screen.getByTestId('mini-runner'))
    fireEvent.click(checking)
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

  it("draws the chasers' frozen snapshot on the map", () => {
    const chaserSnapshot = { positions: [{ name: 'Ben', lat: 3.001, lng: 101.001, stale: false }] }
    render(<RunnerChase code="ABC234" view={testView({ chaserSnapshot })} />)
    expect(mapProps.last?.snapshot).toEqual(chaserSnapshot)
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

describe('RunnerChase: hold the key (rules §9a)', () => {
  const rescue = (over: Partial<NonNullable<ReturnType<typeof testView>['rescue']>> = {}, by = 'r1') =>
    testView({ rescue: { by, byName: by === 'r1' ? 'Aina' : 'Hafiz', heldMs: 0, holdSince: null, resetAt: 105_000, ...over } })
  const holdCalls = () => call.mock.calls.filter((c) => c[0] === 'rescueHold').map((c) => c[1])
  const locationCalls = () => call.mock.calls.filter((c) => c[0] === 'location')
  beforeEach(() => {
    here.coords = { lat: 3, lng: 101, accuracy_m: 5 }
    call.mockImplementation(async (action: string) => (action === 'rescueHold' ? { ok: true, heldMs: 0, holding: true } : { ok: true }))
  })
  afterEach(() => {
    vi.useRealTimers()
    here.pending = null
    here.last = null
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('covers the chase with the HOLD button and the idle line for the rescuer', () => {
    render(<RunnerChase code="ABC234" view={rescue()} />)
    expect(screen.getByRole('button', { name: 'HOLD' })).toBeInTheDocument()
    expect(screen.getByText('RESCUE ON')).toBeInTheDocument()
    expect(screen.getByText('Press and hold for 20 s. Let go and it waits 5 s, then resets.')).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Seconds left to hold' })).toHaveTextContent('20')
  })

  it('shows nothing to a runner whose rescue it is not', () => {
    render(<RunnerChase code="ABC234" view={rescue({}, 'r3')} />)
    expect(screen.queryByRole('button', { name: 'HOLD' })).toBeNull()
  })

  it('counts the seconds left from the held time, ticking from holdSince', () => {
    render(<RunnerChase code="ABC234" view={rescue({ heldMs: 13_000, holdSince: 100_000, resetAt: null })} />)
    expect(screen.getByRole('timer', { name: 'Seconds left to hold' })).toHaveTextContent('7')
  })

  it('pointerdown sends rescueHold down: true and pointerup down: false, in that order', async () => {
    render(<RunnerChase code="ABC234" view={rescue()} />)
    const btn = screen.getByRole('button', { name: 'HOLD' })
    await act(async () => fireEvent.pointerDown(btn))
    expect(screen.getByRole('button', { name: 'HOLDING' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Keep holding. Stay within 30 m of Penjara.')).toBeInTheDocument()
    await act(async () => fireEvent.pointerUp(btn))
    expect(holdCalls()).toEqual([
      { code: 'ABC234', token: 't1', down: true },
      { code: 'ABC234', token: 't1', down: false },
    ])
  })

  it('a cancelled pointer lets go too, and a second up sends nothing more', async () => {
    render(<RunnerChase code="ABC234" view={rescue()} />)
    const btn = screen.getByRole('button', { name: 'HOLD' })
    await act(async () => fireEvent.pointerDown(btn))
    await act(async () => fireEvent.pointerCancel(btn))
    await act(async () => fireEvent.pointerUp(btn))
    expect(holdCalls().map((b) => b.down)).toEqual([true, false])
  })

  it('the screen going to the background lets go', async () => {
    render(<RunnerChase code="ABC234" view={rescue()} />)
    await act(async () => fireEvent.pointerDown(screen.getByRole('button', { name: 'HOLD' })))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(holdCalls().map((b) => b.down)).toEqual([true, false])
  })

  it('the window losing focus lets go', async () => {
    render(<RunnerChase code="ABC234" view={rescue()} />)
    await act(async () => fireEvent.pointerDown(screen.getByRole('button', { name: 'HOLD' })))
    await act(async () => window.dispatchEvent(new Event('blur')))
    expect(holdCalls().map((b) => b.down)).toEqual([true, false])
  })

  it('Space holds and lets go as well', async () => {
    render(<RunnerChase code="ABC234" view={rescue()} />)
    const btn = screen.getByRole('button', { name: 'HOLD' })
    await act(async () => fireEvent.keyDown(btn, { key: ' ' }))
    await act(async () => fireEvent.keyDown(btn, { key: ' ', repeat: true }))
    await act(async () => fireEvent.keyUp(btn, { key: ' ' }))
    expect(holdCalls().map((b) => b.down)).toEqual([true, false])
  })

  it('let go: LET GO, the count dims, and Resets in 3. Hold again to keep it.', () => {
    render(<RunnerChase code="ABC234" view={rescue({ heldMs: 7_000, holdSince: null, resetAt: 103_000 })} />)
    expect(screen.getByText('LET GO')).toBeInTheDocument()
    expect(screen.getByText('Resets in 3. Hold again to keep it.')).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Seconds left to hold' })).toHaveClass('dim')
    expect(screen.getByRole('timer', { name: 'Seconds left to hold' })).toHaveTextContent('13')
  })

  it('sends a fix about every 1.5 s, saying holding: true only while the thumb is down', async () => {
    vi.useFakeTimers()
    render(<RunnerChase code="ABC234" view={rescue()} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600)
    })
    expect(locationCalls()).toHaveLength(1)
    expect(locationCalls()[0][1]).toEqual({ code: 'ABC234', token: 't1', lat: 3, lng: 101, accuracy_m: 5 })
    await act(async () => fireEvent.pointerDown(screen.getByRole('button', { name: 'HOLD' })))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(locationCalls()[1][1]).toEqual({ code: 'ABC234', token: 't1', lat: 3, lng: 101, accuracy_m: 5, holding: true })
    await act(async () => fireEvent.pointerUp(screen.getByRole('button', { name: 'HOLDING' })))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(locationCalls()[2][1]).not.toHaveProperty('holding')
  })

  it('the press is the first beat, and the beat timer starts again from it', async () => {
    vi.useFakeTimers()
    render(<RunnerChase code="ABC234" view={rescue()} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    await act(async () => fireEvent.pointerDown(screen.getByRole('button', { name: 'HOLD' }), { pointerId: 1 }))
    expect(holdCalls()).toEqual([{ code: 'ABC234', token: 't1', down: true }])
    // The free-running timer would have beaten at 1.5 s; re-phased, the next beat is 1.5 s after the press.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(locationCalls()).toHaveLength(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(locationCalls()).toHaveLength(1)
    expect(locationCalls()[0][1]).toMatchObject({ holding: true })
  })

  it('a beat never waits on GPS: with no fresh fix within 300 ms it goes with the latest known one', async () => {
    vi.useFakeTimers()
    here.pending = new Promise(() => {}) // the phone never answers
    here.last = { lat: 3.2, lng: 101.2, accuracy_m: 7 }
    render(<RunnerChase code="ABC234" view={rescue()} />)
    await act(async () => fireEvent.pointerDown(screen.getByRole('button', { name: 'HOLD' }), { pointerId: 1 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500 + 299)
    })
    expect(locationCalls()).toHaveLength(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(locationCalls()[0][1]).toEqual({ code: 'ABC234', token: 't1', lat: 3.2, lng: 101.2, accuracy_m: 7, holding: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(locationCalls()).toHaveLength(2)
  })

  it('with no coordinates at all, the key itself beats: rescueHold down: true every 1.5 s while held, none once let go', async () => {
    vi.useFakeTimers()
    here.pending = new Promise(() => {})
    render(<RunnerChase code="ABC234" view={rescue()} />)
    const btn = screen.getByRole('button', { name: 'HOLD' })
    await act(async () => fireEvent.pointerDown(btn, { pointerId: 1 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(holdCalls().map((b) => b.down)).toEqual([true, true, true])
    expect(locationCalls()).toHaveLength(0)
    await act(async () => fireEvent.pointerUp(btn, { pointerId: 1 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(holdCalls().map((b) => b.down)).toEqual([true, true, true, false])
  })

  it('only the pointer that pressed lets go: a second finger lifting elsewhere does nothing', async () => {
    render(<RunnerChase code="ABC234" view={rescue()} />)
    await act(async () => fireEvent.pointerDown(screen.getByRole('button', { name: 'HOLD' }), { pointerId: 1 }))
    await act(async () => fireEvent.pointerUp(window, { pointerId: 2 }))
    await act(async () => fireEvent.pointerCancel(window, { pointerId: 2 }))
    expect(screen.getByRole('button', { name: 'HOLDING' })).toBeInTheDocument()
    expect(holdCalls().map((b) => b.down)).toEqual([true])
    await act(async () => fireEvent.pointerUp(window, { pointerId: 1 }))
    expect(holdCalls().map((b) => b.down)).toEqual([true, false])
  })

  it('a runner with no rescue of their own sends no extra fixes', async () => {
    vi.useFakeTimers()
    render(<RunnerChase code="ABC234" view={rescue({}, 'r3')} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_600)
    })
    cleanup()
    render(<RunnerChase code="ABC234" view={testView()} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_600)
    })
    expect(locationCalls()).toHaveLength(0)
  })
})

describe('RunnerChase: alerts after New phone', () => {
  const withMode = (checkinMode: 'push' | 'schedule', push: unknown) => {
    const base = testView()
    return testView({ settings: { ...base.settings, checkinMode } as typeof base.settings, me: { ...base.me, push: push as never } })
  }
  it('offers Turn on alerts in push mode when the runner has no subscription', () => {
    render(<RunnerChase code="ABC234" view={withMode('push', null)} />)
    expect(screen.getByRole('button', { name: 'Turn on alerts' })).toBeInTheDocument()
  })
  it('does not when they are subscribed', () => {
    render(<RunnerChase code="ABC234" view={withMode('push', { endpoint: 'x' })} />)
    expect(screen.queryByRole('button', { name: 'Turn on alerts' })).toBeNull()
  })
  it('does not in schedule mode', () => {
    render(<RunnerChase code="ABC234" view={withMode('schedule', null)} />)
    expect(screen.queryByRole('button', { name: 'Turn on alerts' })).toBeNull()
  })

  describe('side quest', () => {
    const quest = () => testView({ sideQuest: true })
    it('shows the card; closing hides it and leaves a chip that reopens it, and the close is remembered', () => {
      render(<RunnerChase code="ABC234" view={quest()} />)
      expect(screen.getByRole('dialog', { name: 'Side quest' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(localStorage.getItem('sidequest-closed:ABC234')).toBe('1')
      fireEvent.click(screen.getByRole('button', { name: 'Side quest' }))
      expect(screen.getByRole('dialog', { name: 'Side quest' })).toBeInTheDocument()
    })
    it('stays closed after a reload', () => {
      localStorage.setItem('sidequest-closed:ABC234', '1')
      render(<RunnerChase code="ABC234" view={quest()} />)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByRole('button', { name: 'Side quest' })).toBeInTheDocument()
    })
    it('Found hides the card for now but does not remember it: a remount shows it again', () => {
      const { unmount } = render(<RunnerChase code="ABC234" view={quest()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Found' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(localStorage.getItem('sidequest-closed:ABC234')).toBeNull()
      unmount()
      render(<RunnerChase code="ABC234" view={quest()} />)
      expect(screen.getByRole('dialog', { name: 'Side quest' })).toBeInTheDocument()
    })
    it('is absent when the view has no side quest', () => {
      render(<RunnerChase code="ABC234" view={testView()} />)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Side quest' })).toBeNull()
    })
    it('the slip scanner has no station-number fallback, the usual scanner does', () => {
      render(<RunnerChase code="ABC234" view={quest()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Found' }))
      expect(screen.getByText('Scan the slip inside')).toBeInTheDocument()
      expect(screen.queryByText('Or type the station number')).toBeNull()
    })
    it('the usual scan button keeps the station-number fallback', () => {
      render(<RunnerChase code="ABC234" view={testView()} />)
      fireEvent.click(screen.getByRole('button', { name: /scan/i }))
      expect(screen.getByText('Or type the station number')).toBeInTheDocument()
    })
    it('Found opens the scanner with the slip hint, and a wrong slip answers in plain words', async () => {
      call.mockResolvedValue({ ok: false, reason: 'wrong' })
      scanned.text = 'KEJAR:SLIP:tok'
      render(<RunnerChase code="ABC234" view={quest()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Found' }))
      expect(screen.getByText('Scan the slip inside')).toBeInTheDocument()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'fake camera' }))
      })
      expect(call).toHaveBeenCalledWith('claim', expect.objectContaining({ qr: 'KEJAR:SLIP:tok' }))
      expect(screen.getByText('Bukan ini. That was your try.')).toBeInTheDocument()
    })
  })
})
