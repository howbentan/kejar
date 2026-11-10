import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
const scanned = vi.hoisted(() => ({ text: '' }))
const useWakeLock = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
const mapProps = vi.hoisted(() => ({ last: null as null | { legendaryZone?: unknown } }))
vi.mock('../game/Map', () => ({
  default: (p: { legendaryZone?: unknown }) => {
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
vi.mock('../game/useWakeLock', () => ({ useWakeLock }))
import ChaserChase, { catchMessage } from './ChaserChase'
import { testView } from './testView'

const chaser = () => {
  const base = testView()
  return testView({
    me: { ...base.me, id: 'c1', name: 'Ben', role: 'chaser', tag_id: null },
    nextRevealAt: 100_000 + 102_000,
    lastRevealAt: 100_000 - 198_000,
  })
}

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
  fireEvent.click(screen.getByRole('button', { name: 'Scan tag' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'fake camera' })))
}

describe('ChaserChase', () => {
  it('keeps the screen awake during the chase', () => {
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    expect(useWakeLock).toHaveBeenCalledWith(true)
  })

  it('is one screen: who, the ping chip, the map, Scan tag and the ticker', () => {
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    expect(screen.getByText('KEJAR · BEN')).toBeInTheDocument()
    expect(screen.getByText('Next ping 1:42 · last 3:18 ago')).toBeInTheDocument()
    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /feed/i })).toBeInTheDocument()
  })

  it('Scan tag with a tag catches, with the stamp', async () => {
    call.mockResolvedValue({ ok: true, flagged: false, runnerId: 'r1', label: '#07 Aina' })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:TAG:07')
    expect(call).toHaveBeenCalledWith('catch', { code: 'ABC234', token: 't1', tagQr: 'KEJAR:TAG:07' })
    expect(screen.getByText('Caught #07 ✓')).toBeInTheDocument()
    expect(screen.getByText('dikejar!')).toBeInTheDocument()
    expect(screen.getByText('#07 Aina → Penjara')).toBeInTheDocument()
  })

  it('a refused catch is a plain message, with no stamp', async () => {
    call.mockResolvedValue({ ok: false, reason: 'too-far' })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:TAG:07')
    expect(screen.getByText('Too far — get within 50 m')).toBeInTheDocument()
    expect(screen.queryByText('dikejar!')).toBeNull()
  })

  it('Scan tag with a station code claims', async () => {
    call.mockResolvedValue({ ok: true, kind: 'flare' })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:STATION:1')
    expect(call).toHaveBeenCalledWith('claim', { code: 'ABC234', token: 't1', qr: 'KEJAR:STATION:1' })
    expect(screen.getByText('Got Mat Rempit ✓')).toBeInTheDocument()
  })

  it('shows SNAPSHOT TAKEN while snapshotted, promising nothing about how long', () => {
    const { rerender } = render(<ChaserChase code="ABC234" view={{ ...chaser(), snapshotted: true }} refresh={() => {}} />)
    const pill = screen.getByText('SNAPSHOT TAKEN')
    expect(pill).toHaveClass('chip', 'snap')
    expect(document.body.textContent).not.toMatch(/until|next alert/i)
    rerender(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    expect(screen.queryByText('SNAPSHOT TAKEN')).toBeNull()
  })

  it('a chaser scanning the hidden stash card gets a plain refusal, no reveal', async () => {
    call.mockResolvedValue({ ok: false, reason: 'cannot-claim' })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:DATO')
    expect(call).toHaveBeenCalledWith('claim', expect.objectContaining({ qr: 'KEJAR:DATO' }))
    expect(screen.getByText('Nothing here.')).toBeInTheDocument()
  })

  it.each(['KEJAR:BOMOH:Pq7-abc', 'KEJAR:DATO:Pq7-abc'])('claiming Bomoh (%s) says what it does, with no Dato Seri reveal', async (qr) => {
    call.mockResolvedValue({ ok: true, kind: 'bomoh' })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan(qr)
    expect(call).toHaveBeenCalledWith('claim', expect.objectContaining({ qr }))
    expect(screen.getByText('Bomoh found! Every Dikejar shows up for Kejar at the next 2 pings.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dato Seri.' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/—|Error/)
  })

  it.each([
    ['too-far', 'Get closer.'],
    ['no-stash', 'Nothing here.'],
    ['not-chasing', 'Nothing here.'],
  ])('a refused Bomoh scan (%s) never names a station', async (reason, text) => {
    call.mockResolvedValue({ ok: false, reason })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:BOMOH:Pq7-abc')
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Station \d|the station|within 30 m/i)
  })

  it('the ? zone shows on the chaser map too', () => {
    const legendaryZone = { lat: 3, lng: 101, radiusM: 150 }
    render(<ChaserChase code="ABC234" view={{ ...chaser(), legendaryZone }} refresh={() => {}} />)
    expect(mapProps.last?.legendaryZone).toEqual(legendaryZone)
  })

  it('Scan tag with the Penjara code says so and calls nothing', async () => {
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:JAIL')
    expect(call).not.toHaveBeenCalled()
    expect(screen.getByText("That's not a tag or station code")).toBeInTheDocument()
  })
})

describe('catchMessage', () => {
  it('asks the chaser to turn on location when they have no fix', () => {
    expect(catchMessage('KEJAR:TAG:07', { ok: false, reason: 'no-location' })).toBe('Turn on location to catch')
  })
  it('names the tag on success', () => {
    expect(catchMessage('KEJAR:TAG:07', { ok: true, flagged: false, runnerId: 'r1' })).toBe('Caught #07 ✓')
  })
  it('refuses an implausible catch with the exact copy', () => {
    expect(catchMessage('KEJAR:TAG:07', { ok: false, reason: 'implausible' })).toBe("Can't confirm that one. Get closer and try again.")
  })
  it('explains a shielded catch', () => {
    expect(catchMessage('KEJAR:TAG:07', { ok: false, reason: 'shielded' })).toBe("Durian! That catch doesn't count. Hand the tag back.")
  })
})

describe('ChaserChase Luar Garisan', () => {
  it('a disqualified chaser sees a banner', () => {
    const v = chaser()
    render(<ChaserChase code="ABC234" view={{ ...v, me: { ...v.me, disqualified_at: '2026-10-25T09:10:00.000Z' } }} refresh={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Luar Garisan: your catches don't count this round, boss.")
  })

  it('a warned chaser sees the warning banner', () => {
    render(<ChaserChase code="ABC234" view={{ ...chaser(), outWarned: true }} refresh={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Eh, you're outside the play area! Balik within 30 seconds or you're out.")
  })

  it('a free chaser sees no banner', () => {
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['disqualified', "You're Luar Garisan lah, so that catch doesn't count."],
    ['already-out', 'Aiyo, that runner is already out of this round.'],
  ])('a catch refused with %s says so', async (reason, line) => {
    call.mockResolvedValue({ ok: false, reason })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:TAG:07')
    expect(screen.getByText(line)).toBeInTheDocument()
  })

  it('a claim refused with disqualified says no power-ups', async () => {
    call.mockResolvedValue({ ok: false, reason: 'disqualified' })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:STATION:1')
    expect(screen.getByText("You're Luar Garisan, so no power-ups this round.")).toBeInTheDocument()
  })
})
