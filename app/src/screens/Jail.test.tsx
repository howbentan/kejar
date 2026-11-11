import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
const scanned = vi.hoisted(() => ({ text: '' }))
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => null }))
const here = vi.hoisted(() => ({ coords: { lat: 3, lng: 101, accuracy_m: 5 } as Record<string, number> }))
vi.mock('../game/here', () => ({ currentCoords: async () => here.coords }))
vi.mock('../game/Scanner', () => ({
  default: ({ onResult }: { onResult: (t: string) => void }) => (
    <button type="button" onClick={() => onResult(scanned.text)}>
      fake camera
    </button>
  ),
}))
vi.mock('../game/push', () => ({
  subscribe: vi.fn(),
  pushSupport: () => 'ok',
  currentPushEnv: () => ({}),
  NotificationsDeniedError: class extends Error {},
}))
import { ARRIVAL_MS } from '../game/PenjaraArrival'
import Jail from './Jail'
import { testView } from './testView'

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const CAUGHT_LINES = ['Masuk penjara, bossku!', 'Lepak kat Penjara dulu, bro.', 'Habis la, boss.', 'Hailat bro.', 'Skill issue.']
/** testView's clock is at 100 000 ms; caught `ago` ms before it. */
const caught = (ago: number, over: Partial<ReturnType<typeof testView>['me']> = {}) => {
  const view = testView({ caughtBy: 'Ben', jailReason: 'caught' })
  return { ...view, me: { ...view.me, jailed: true, caught_by: 'c1', caught_at: new Date(100_000 - ago).toISOString(), ...over } }
}

describe('Settle at Penjara (jail design §4b, §4d)', () => {
  const settle = {
    canFreeSelf: true,
    options: [
      { id: 'r2', name: 'Hafiz', eligible: true },
      { id: 'r3', name: 'Wei', eligible: true },
      { id: 'r4', name: 'Siti', eligible: true },
      { id: 'r5', name: 'Amir', eligible: false },
    ],
  }
  const holder = (over: Partial<NonNullable<ReturnType<typeof testView>['settle']>> = {}) => ({ ...caught(60_000), settle: { ...settle, ...over } })
  beforeEach(() => {
    call.mockReset()
    here.coords = { lat: 3, lng: 101, accuracy_m: 5 }
    localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
  })
  afterEach(() => localStorage.clear())
  const scan = async (text: string) => {
    scanned.text = text
    fireEvent.click(screen.getByRole('button', { name: 'Scan Penjara to settle' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'fake camera' })))
  }

  it('is only there for a jailed holder', () => {
    render(<Jail code="ABC234" view={caught(60_000)} />)
    expect(screen.queryByRole('heading', { name: 'Settle' })).toBeNull()
  })

  it('lists the others in Penjara: eligible ones tappable, the rest greyed with why, up to 2 picks', () => {
    render(<Jail code="ABC234" view={holder()} />)
    expect(screen.getByRole('heading', { name: 'Settle' })).toBeInTheDocument()
    const amir = screen.getByRole('checkbox', { name: /Amir/ })
    expect(amir).toBeDisabled()
    expect(screen.getByText('Already escaped once')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hafiz' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wei' }))
    expect(screen.getByRole('checkbox', { name: 'Siti' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wei' }))
    expect(screen.getByRole('checkbox', { name: 'Siti' })).not.toBeDisabled()
  })

  it('scanning the Penjara code settles with the picks and the location, then names who is free', async () => {
    call.mockResolvedValue({ ok: true, freedIds: ['r1', 'r2', 'r3'] })
    render(<Jail code="ABC234" view={holder()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hafiz' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wei' }))
    await scan('KEJAR:JAIL')
    expect(call).toHaveBeenCalledWith('settle', {
      code: 'ABC234',
      token: 't1',
      qr: 'KEJAR:JAIL',
      targetIds: ['r2', 'r3'],
      lat: 3,
      lng: 101,
      accuracy_m: 5,
    })
    expect(screen.getByText('Settled! You, Hafiz and Wei are free.')).toBeInTheDocument()
    // Done: no second scan can overwrite it.
    expect(screen.queryByRole('button', { name: 'Scan Penjara to settle' })).toBeNull()
    expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).disabled)).toBe(true)
  })

  it('"You" is only ever the holder; an unknown freed id is never called You', async () => {
    call.mockResolvedValue({ ok: true, freedIds: ['r2', 'zz'] })
    render(<Jail code="ABC234" view={holder({ canFreeSelf: false })} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hafiz' }))
    await scan('KEJAR:JAIL')
    expect(screen.getByText('Settled! Hafiz and 1 more are free.')).toBeInTheDocument()
  })

  it('with no location fix, sends nothing and says to turn location on', async () => {
    here.coords = {}
    render(<Jail code="ABC234" view={holder()} />)
    await scan('KEJAR:JAIL')
    expect(call).not.toHaveBeenCalled()
    expect(screen.getByText('Turn on location, then scan the Penjara code again')).toBeInTheDocument()
  })

  it("scanning anything else isn't a settle", async () => {
    render(<Jail code="ABC234" view={holder()} />)
    await scan('KEJAR:STATION:1')
    expect(call).not.toHaveBeenCalled()
    expect(screen.getByText("That's not the Penjara code")).toBeInTheDocument()
  })

  it('a holder already freed once is told, and needs to pick someone', () => {
    render(<Jail code="ABC234" view={holder({ canFreeSelf: false })} />)
    expect(screen.getByText("You've already escaped once. Settle can still free others.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan Penjara to settle' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hafiz' }))
    expect(screen.getByRole('button', { name: 'Scan Penjara to settle' })).not.toBeDisabled()
  })

  it('a refusal is plain words', async () => {
    call.mockResolvedValue({ ok: false, reason: 'too-far-from-jail' })
    render(<Jail code="ABC234" view={holder()} />)
    await scan('KEJAR:JAIL')
    expect(screen.getByText('Get within 30 m of Penjara')).toBeInTheDocument()
  })
})

describe('Jail', () => {
  it('a fresh catch lands the bars and the stamp, then says who got you', () => {
    vi.useFakeTimers()
    render(<Jail code="ABC234" view={caught(3_000)} />)
    expect(screen.getByText('dikejar!')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(ARRIVAL_MS))
    expect(screen.queryByText('dikejar!')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ben got you.' })).toBeInTheDocument()
    expect(CAUGHT_LINES.some((l) => screen.queryByText(l))).toBe(true)
  })

  it('the moment plays once: reopening the page goes straight to Penjara', () => {
    vi.useFakeTimers()
    const { unmount } = render(<Jail code="ABC234" view={caught(3_000)} />)
    act(() => vi.advanceTimersByTime(ARRIVAL_MS))
    unmount()
    render(<Jail code="ABC234" view={caught(3_000)} />)
    expect(screen.queryByText('dikejar!')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Ben got you.' })).toBeInTheDocument()
  })

  it('an old catch shows no moment', () => {
    render(<Jail code="ABC234" view={caught(60_000)} />)
    expect(screen.queryByText('dikejar!')).toBeNull()
    expect(screen.getByText('PENJARA', { selector: 'p.eyebrow' })).toBeInTheDocument()
  })

  it('with no location, points at the pin and keeps the spectator view', () => {
    const view = caught(60_000)
    render(<Jail code="ABC234" view={{ ...view, settings: { ...view.settings, spectatorDelayMin: 3 } }} />)
    expect(screen.getByText('Walk to the PENJARA pin on the map.')).toBeInTheDocument()
    expect(screen.getByText('Spectator view · 3 min delayed')).toBeInTheDocument()
  })

  it('auto-jailed: says why, gives a line, and points to a marshal', () => {
    const view = testView({ caughtBy: null, jailReason: 'missed-checkins' })
    render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true } }} />)
    expect(screen.getByText('PENJARA · AUTO')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Missed two check-ins.' })).toBeInTheDocument()
    const lines = ['Your phone went ponteng, bro.', 'Signal hilang, bossku?', 'Kena check in lah, boss.', 'Phone in your pocket too deep.']
    expect(lines.some((l) => screen.queryByText(l))).toBe(true)
    expect(screen.getByRole('button', { name: 'Phone died or no buzz? Tell a marshal →' })).toBeInTheDocument()
  })

  it('a fresh auto-jail drops the bars with 2× MISSED', () => {
    vi.useFakeTimers()
    const view = testView({ caughtBy: null, jailReason: 'missed-checkins' })
    render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true, caught_at: new Date(97_000).toISOString() } }} />)
    expect(screen.getByText('2× MISSED')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(ARRIVAL_MS))
    expect(screen.queryByText('2× MISSED')).toBeNull()
    expect(screen.getByText('PENJARA · AUTO')).toBeInTheDocument()
  })

  it('shows the check-ins it was judged on, and the misses get crossed out', () => {
    const t = (h: number, m: number) => new Date(2026, 10, 1, h, m).getTime()
    const view = testView({
      caughtBy: null,
      jailReason: 'missed-checkins',
      jailCheckins: [
        { at: t(15, 25), ok: true },
        { at: t(15, 30), ok: false },
        { at: t(15, 35), ok: false },
      ],
    })
    const { container } = render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true } }} />)
    expect(screen.getByText('3:25 ✓')).toBeInTheDocument()
    expect(screen.getByText('3:30')).toBeInTheDocument()
    expect(screen.getByText('3:35')).toBeInTheDocument()
    expect(container.querySelector('.marker')).not.toBeNull()
  })

  it('Tell a marshal opens the SOS sheet with Something else picked', () => {
    const heard = vi.fn()
    window.addEventListener('kejar:sos', heard)
    const view = testView({ caughtBy: null, jailReason: 'missed-checkins' })
    render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Phone died or no buzz? Tell a marshal →' }))
    window.removeEventListener('kejar:sos', heard)
    expect(heard).toHaveBeenCalledTimes(1)
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ reason: 'other' })
  })

  it('auto-jailed after already being freed once: out for good', () => {
    const view = testView({ caughtBy: null, jailReason: 'missed-checkins' })
    render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true, freed_once: true } }} />)
    expect(screen.getByText(/That's the game for you\./)).toBeInTheDocument()
    expect(screen.getByText('You were already freed once, so you stay in Penjara until the end. Watch the chase from here.')).toBeInTheDocument()
  })

  it('with location denied, points at the pin and still gives the spectator view', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition: (_ok: unknown, err: (e: unknown) => void) => (err({ code: 1 }), 1), clearWatch: () => {} },
    })
    try {
      render(<Jail code="ABC234" view={caught(60_000)} />)
      expect(screen.getByText('Walk to the PENJARA pin on the map.')).toBeInTheDocument()
      expect(screen.getByText(/Spectator view/)).toBeInTheDocument()
    } finally {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
    }
  })

  it('the reel shows only once the runner has arrived at Penjara', () => {
    let arrive: (p: unknown) => void = () => {}
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition: (ok: (p: unknown) => void) => ((arrive = ok), 1), clearWatch: () => {} },
    })
    try {
      render(<Jail code="ABC234" view={{ ...caught(60_000), reel: { pulled: false, result: null } }} />)
      expect(screen.queryByText('Your pull.')).toBeNull()
      act(() => arrive({ coords: { latitude: 3.01, longitude: 101 } })) // ~1.1 km away
      expect(screen.queryByText('Your pull.')).toBeNull()
      act(() => arrive({ coords: { latitude: 3, longitude: 101 } }))
      expect(screen.getByText('Your pull.')).toBeInTheDocument()
    } finally {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
    }
  })

  it('no reel without a view of one (not jailed this stay)', () => {
    render(<Jail code="ABC234" view={caught(60_000)} />)
    expect(screen.queryByText('Your pull.')).toBeNull()
  })

  it('already broken out once: says they stay this time', () => {
    render(<Jail code="ABC234" view={caught(60_000, { freed_once: true })} />)
    expect(screen.getByText('You’ve already been broken out once, so you stay in Penjara this time.')).toBeInTheDocument()
  })
})

describe('Jail: alerts after New phone', () => {
  it('a jailed runner in push mode with no subscription can turn alerts back on', () => {
    render(<Jail code="ABC234" view={caught(60_000)} />)
    expect(screen.getByRole('button', { name: 'Turn on alerts' })).toBeInTheDocument()
  })
})

describe('a rescue at Penjara (rules §9a)', () => {
  const rescue = { by: 'r3', byName: 'Hafiz', endsAt: 107_000, joiners: [] }
  it('tells a jailed runner who is breaking them out, counting down', () => {
    render(<Jail code="ABC234" view={{ ...caught(60_000), rescue }} />)
    expect(screen.getByRole('status', { name: 'Rescue' })).toHaveTextContent('Hafiz is breaking you out · 7 s')
  })
  it('tells an auto-jailed runner too', () => {
    const view = testView({ jailReason: 'missed-checkins', jailCheckins: [], rescue })
    render(<Jail code="ABC234" view={{ ...view, me: { ...view.me, jailed: true, caught_at: new Date(40_000).toISOString() } }} />)
    expect(screen.getByText('Hafiz is breaking you out · 7 s')).toBeInTheDocument()
  })
  it('says nothing to a runner who already used their one escape, or with no rescue going', () => {
    render(<Jail code="ABC234" view={{ ...caught(60_000, { freed_once: true }), rescue }} />)
    expect(screen.queryByText(/breaking you out/)).toBeNull()
    cleanup()
    render(<Jail code="ABC234" view={caught(60_000)} />)
    expect(screen.queryByText(/breaking you out/)).toBeNull()
  })
})
