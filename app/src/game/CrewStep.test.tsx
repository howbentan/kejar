import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/types.js'
import type { View } from '../../shared/views.js'

const call = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ call }))

import CrewStep from './CrewStep'

const view = (band: 20 | 30 | 40 = 20) =>
  ({ me: { id: 'host', name: 'Bentan', role: 'marshal' }, settings: { ...DEFAULT_SETTINGS, playersBand: band } }) as unknown as View

const assign = vi.fn()
let tokens = 0

beforeEach(() => {
  assign.mockReset()
  tokens = 0
  sessionStorage.clear()
  call.mockReset()
  call.mockImplementation(async (action: string) => (action === 'createMarshalInvite' ? { inviteToken: `tok${++tokens}` } : {}))
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, origin: 'https://kejar.test', search: '', assign },
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('CrewStep', () => {
  it('suggests you plus 1 helper for 20 players, with the two starting rows', async () => {
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    expect(screen.getByRole('heading', { name: 'Your crew.' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Step 4 of 5' })).toBeInTheDocument()
    expect(screen.getByText('You plus 1 helper for up to 20 players.')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Roaming marshal · gets every SOS')).toBeInTheDocument()
    expect(screen.getByText('READY')).toBeInTheDocument()
    expect(screen.getByText('Helper at Penjara')).toBeInTheDocument()
    expect(screen.getByText('Marshal · plays Pak Pulis')).toBeInTheDocument()
    expect(await screen.findByText('INVITE')).toBeInTheDocument()
  })

  it('suggests more helpers for a bigger crowd', () => {
    render(<CrewStep code="ABC234" view={view(40)} organiserToken="h1" />)
    expect(screen.getByText('You plus 3 helpers for up to 40 players.')).toBeInTheDocument()
  })

  it('makes each row\'s invite up front, showing Creating... until it is ready', async () => {
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    expect(screen.getByText('Creating…')).toBeInTheDocument()
    expect(await screen.findByText('INVITE')).toBeInTheDocument()
    expect(call).toHaveBeenCalledWith('createMarshalInvite', { code: 'ABC234', organiserToken: 'h1' })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('+ Add a marshal adds a row and makes its invite at once', async () => {
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    await screen.findByText('INVITE')
    fireEvent.click(screen.getByText('+ Add a marshal'))
    expect(screen.getByText('Roams a side of the park')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('INVITE')).toHaveLength(2))
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('keeps the invites for the game, so coming back makes no new ones', async () => {
    const first = render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    await screen.findByText('INVITE')
    first.unmount()
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    expect(screen.getByText('INVITE')).toBeInTheDocument()
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('Send invite links shares in the same tick as the tap, one personal link per tap', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    fireEvent.click(screen.getByText('+ Add a marshal'))
    await waitFor(() => expect(screen.getAllByText('INVITE')).toHaveLength(2))
    const send = screen.getByRole('button', { name: 'Send invite links' })
    fireEvent.click(send)
    // Nothing awaited: the share is already called when the click returns.
    expect(share).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenLastCalledWith({ text: 'Join my Kejar crew as a marshal: https://kejar.test/m/ABC234/tok1' })
    await waitFor(() => expect(screen.getAllByText('SENT')).toHaveLength(1))
    fireEvent.click(send)
    expect(share).toHaveBeenCalledTimes(2)
    expect(share).toHaveBeenLastCalledWith({ text: 'Join my Kejar crew as a marshal: https://kejar.test/m/ABC234/tok2' })
    await waitFor(() => expect(screen.getAllByText('SENT')).toHaveLength(2))
    expect(send).toBeDisabled()
  })

  it('is disabled until a link is ready', async () => {
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    expect(screen.getByRole('button', { name: 'Send invite links' })).toBeDisabled()
    await screen.findByText('INVITE')
    expect(screen.getByRole('button', { name: 'Send invite links' })).toBeEnabled()
  })

  it('a row\'s INVITE pill shares that row, ignores a closed sheet and shows other errors on the row', async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('closed', 'AbortError'))
      .mockRejectedValueOnce(new Error('No apps to share with'))
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    const pill = await screen.findByText('INVITE')
    fireEvent.click(pill)
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('No apps to share with')).toBeNull()
    expect(screen.getByText('INVITE')).toBeInTheDocument()
    fireEvent.click(screen.getByText('INVITE'))
    expect(await screen.findByText('No apps to share with')).toBeInTheDocument()
  })

  it('a fast double tap shares once', async () => {
    const share = vi.fn().mockReturnValue(new Promise(() => {}))
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    const pill = await screen.findByText('INVITE')
    fireEvent.click(pill)
    fireEvent.click(pill)
    expect(share).toHaveBeenCalledTimes(1)
  })

  it('without a share sheet it copies the ready links and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    await screen.findByText('INVITE')
    fireEvent.click(screen.getByRole('button', { name: 'Send invite links' }))
    expect(writeText).toHaveBeenCalledWith('https://kejar.test/m/ABC234/tok1')
    expect(screen.getByText('Links copied.')).toBeInTheDocument()
  })

  it('Next goes to the pack step, keeping a yellow card notice', () => {
    const { unmount } = render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(assign).toHaveBeenCalledWith('/host/ABC234?setup=pack')
    unmount()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, search: '?setup=crew&notice=dato', assign } })
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(assign).toHaveBeenLastCalledWith('/host/ABC234?setup=pack&notice=dato')
  })
})
