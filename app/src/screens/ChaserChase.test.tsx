import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
const scanned = vi.hoisted(() => ({ text: '' }))
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('../game/Map', () => ({ default: () => <div data-testid="map" /> }))
vi.mock('../game/here', () => ({ currentCoords: async () => ({}) }))
vi.mock('../game/Scanner', () => ({
  default: ({ onResult }: { onResult: (t: string) => void }) => (
    <button type="button" onClick={() => onResult(scanned.text)}>
      fake camera
    </button>
  ),
}))
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
  it('is one screen: who, the ping chip, the map, Scan tag and the ticker', () => {
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    expect(screen.getByText('KEJAR · BEN')).toBeInTheDocument()
    expect(screen.getByText('Next ping 1:42 · last 3:18 ago')).toBeInTheDocument()
    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /feed/i })).toBeInTheDocument()
  })

  it('Scan tag with a tag catches', async () => {
    call.mockResolvedValue({ ok: true, flagged: false, runnerId: 'r1' })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:TAG:07')
    expect(call).toHaveBeenCalledWith('catch', { code: 'ABC234', token: 't1', tagQr: 'KEJAR:TAG:07' })
    expect(screen.getByText('Caught #07 ✓')).toBeInTheDocument()
  })

  it('Scan tag with a station code claims', async () => {
    call.mockResolvedValue({ ok: true, kind: 'flare' })
    render(<ChaserChase code="ABC234" view={chaser()} refresh={() => {}} />)
    await scan('KEJAR:STATION:1')
    expect(call).toHaveBeenCalledWith('claim', { code: 'ABC234', token: 't1', qr: 'KEJAR:STATION:1' })
    expect(screen.getByText('Got Mat Rempit ✓')).toBeInTheDocument()
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
  it('explains a shielded catch', () => {
    expect(catchMessage('KEJAR:TAG:07', { ok: false, reason: 'shielded' })).toBe("Durian! That catch doesn't count. Hand the tag back.")
  })
})
