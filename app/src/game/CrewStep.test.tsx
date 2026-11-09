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
  it('suggests you plus 1 helper for 20 players, with the two starting rows', () => {
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    expect(screen.getByRole('heading', { name: 'Your crew.' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Step 4 of 5' })).toBeInTheDocument()
    expect(screen.getByText('You plus 1 helper for up to 20 players.')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Roaming marshal · gets every SOS')).toBeInTheDocument()
    expect(screen.getByText('READY')).toBeInTheDocument()
    expect(screen.getByText('Helper at Penjara')).toBeInTheDocument()
    expect(screen.getByText('Marshal · plays Pak Pulis')).toBeInTheDocument()
    expect(screen.getByText('INVITE')).toBeInTheDocument()
  })

  it('suggests more helpers for a bigger crowd', () => {
    render(<CrewStep code="ABC234" view={view(40)} organiserToken="h1" />)
    expect(screen.getByText('You plus 3 helpers for up to 40 players.')).toBeInTheDocument()
  })

  it('+ Add a marshal adds a row', () => {
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    fireEvent.click(screen.getByText('+ Add a marshal'))
    expect(screen.getAllByText('INVITE')).toHaveLength(2)
  })

  it('Send invite links makes an invite per row, then shares each personal link', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    fireEvent.click(screen.getByText('+ Add a marshal'))
    fireEvent.click(screen.getByRole('button', { name: 'Send invite links' }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2))
    expect(call).toHaveBeenCalledWith('createMarshalInvite', { code: 'ABC234', organiserToken: 'h1' })
    expect(call.mock.calls.filter(([a]) => a === 'createMarshalInvite')).toHaveLength(2)
    expect(share).toHaveBeenNthCalledWith(1, { text: 'Join my Kejar crew as a marshal: https://kejar.test/m/ABC234/tok1' })
    expect(share).toHaveBeenNthCalledWith(2, { text: 'Join my Kejar crew as a marshal: https://kejar.test/m/ABC234/tok2' })
  })

  it('without a share sheet it copies the links and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<CrewStep code="ABC234" view={view()} organiserToken="h1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Send invite links' }))
    expect(await screen.findByText('Links copied.')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('https://kejar.test/m/ABC234/tok1')
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
