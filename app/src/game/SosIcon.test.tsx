import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testView } from '../screens/testView'

const call = vi.hoisted(() => vi.fn())
const coords = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('./here', () => ({ currentCoords: coords }))

import SosIcon from './SosIcon'

const view = testView({
  reportable: [
    { id: 'c1', name: 'Ben' },
    { id: 'r2', name: 'Hafiz' },
  ],
})
const HERE = { lat: 3.1, lng: 101.2, accuracy_m: 9 }

beforeEach(() => {
  vi.useFakeTimers()
  call.mockReset()
  call.mockImplementation(async (action: string) => (action === 'sos' ? { ok: true, notified: 2, sosId: 'e9' } : { ok: true }))
  coords.mockReset()
  coords.mockResolvedValue(HERE)
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
const bar = () => screen.getByRole('button', { name: /hold for 1 second to send sos/i })

async function openSheet() {
  render(<SosIcon code="ABC234" view={view} />)
  fireEvent.click(screen.getByRole('button', { name: 'Help and SOS' }))
}

async function holdBar(ms: number) {
  fireEvent.pointerDown(bar())
  await wait(ms)
  fireEvent.pointerUp(bar())
}

async function sent() {
  await openSheet()
  fireEvent.pointerDown(bar())
  await wait(1_000)
}

describe('SosIcon', () => {
  it('is a button named Help and SOS', () => {
    render(<SosIcon code="ABC234" view={view} />)
    expect(screen.getByRole('button', { name: 'Help and SOS' })).toBeInTheDocument()
  })

  it('a tap opens the sheet and sends nothing', async () => {
    await openSheet()
    expect(screen.getByText('Need help?')).toBeInTheDocument()
    expect(screen.getByText('HOLD 1 S · MARSHALS COME TO YOU')).toBeInTheDocument()
    expect(call).not.toHaveBeenCalled()
  })

  it('letting go at 600 ms sends nothing and says it was too early', async () => {
    await openSheet()
    await holdBar(600)
    expect(screen.getByText('LET GO TOO EARLY · HOLD 1 S')).toBeInTheDocument()
    await wait(2_000)
    expect(call).not.toHaveBeenCalled()
  })

  it('a quick tap of the bar says to hold for a second', async () => {
    await openSheet()
    await holdBar(100)
    expect(screen.getByText('HOLD FOR 1 SECOND TO SEND SOS')).toBeInTheDocument()
    expect(call).not.toHaveBeenCalled()
  })

  it('a 1 s hold sends sos once, with the coordinates, and shows sos sent', async () => {
    await sent()
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('sos', { code: 'ABC234', token: 't1', ...HERE })
    expect(screen.getByText('sos sent')).toBeInTheDocument()
    expect(screen.getByText(/Marshals alerted\./)).toBeInTheDocument()
  })

  it('holding Space on the bar for 1 s sends too', async () => {
    await openSheet()
    fireEvent.keyDown(bar(), { key: ' ' })
    await wait(1_000)
    expect(call).toHaveBeenCalledWith('sos', expect.objectContaining({ code: 'ABC234' }))
    expect(screen.getByText('sos sent')).toBeInTheDocument()
  })

  it('Catch dispute asks who with, and a player chip sends the details', async () => {
    await sent()
    fireEvent.click(screen.getByRole('button', { name: 'Catch dispute' }))
    expect(call).toHaveBeenLastCalledWith('sosDetails', { code: 'ABC234', token: 't1', sosId: 'e9', reason: 'dispute' })
    expect(screen.getByText('With who?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ben' }))
    await wait(0)
    expect(call).toHaveBeenLastCalledWith('sosDetails', { code: 'ABC234', token: 't1', sosId: 'e9', reason: 'dispute', withId: 'c1' })
  })

  it('Hurt sends the details with no one to pick', async () => {
    await sent()
    fireEvent.click(screen.getByRole('button', { name: 'Hurt' }))
    expect(call).toHaveBeenLastCalledWith('sosDetails', { code: 'ABC234', token: 't1', sosId: 'e9', reason: 'hurt' })
    expect(screen.queryByText('With who?')).toBeNull()
  })

  it('closes itself 20 s after sending', async () => {
    await sent()
    await wait(19_000)
    expect(screen.getByText('sos sent')).toBeInTheDocument()
    await wait(1_500)
    expect(screen.queryByText('sos sent')).toBeNull()
  })

  it('says so when no marshal has alerts on', async () => {
    call.mockImplementation(async () => ({ ok: true, notified: 0, sosId: 'e9' }))
    await sent()
    expect(screen.getByText(/SOS saved, but no marshal has alerts on\. Find a marshal or call for help\./)).toBeInTheDocument()
    expect(screen.queryByText(/Marshals alerted\./)).toBeNull()
  })

  it('Report a player still sends a report from inside the sheet', async () => {
    await openSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Report a player' }))
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'c1' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Reason: Catch dispute' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await wait(0)
    expect(call).toHaveBeenCalledWith('report', { code: 'ABC234', token: 't1', targetId: 'c1', reason: 'dispute', note: '', ...HERE })
    expect(screen.getByText('Report sent')).toBeInTheDocument()
  })
})
