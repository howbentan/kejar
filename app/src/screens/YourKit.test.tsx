import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

import YourKit from './YourKit'

type Slip = { side: 'dikejar' | 'kejar'; number: number; token: string; state: 'unused' | 'bound' | 'used' }
const sheet = (over: Record<string, Slip['state']> = {}): Slip[] =>
  (['dikejar', 'kejar'] as const).flatMap((side) =>
    Array.from({ length: 10 }, (_, i) => ({ side, number: i + 1, token: `${side}${i + 1}`, state: over[`${side}${i + 1}`] ?? 'unused' })),
  )

let slips: Slip[]
let open: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'ot1', name: 'Owner' }))
  slips = sheet()
  call.mockReset()
  call.mockImplementation(async (action: string) => (action === 'listSlips' ? slips : { ok: true }))
  open = vi.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  open.mockRestore()
})

describe('YourKit', () => {
  it('asks for an invite link with no organiser session', () => {
    localStorage.clear()
    render(<YourKit />)
    expect(screen.getByText(/need an invite link/i)).toBeTruthy()
    expect(call).not.toHaveBeenCalled()
  })

  it('shows the full-size loader until the slips arrive', async () => {
    render(<YourKit />)
    expect(screen.getByRole('status', { name: 'TUNGGU JAP, PACKING YOUR KIT' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Print once.' })).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'TUNGGU JAP, PACKING YOUR KIT' })).toBeNull()
  })

  it('shows the heading and the every-game group, each printing the sheet', async () => {
    render(<YourKit />)
    expect(await screen.findByRole('heading', { name: 'Print once.' })).toBeTruthy()
    expect(screen.getByText('Laminate it and reuse it every game.')).toBeTruthy()
    expect(screen.getByText('EVERY GAME')).toBeTruthy()
    for (const label of ['Armbands #01–#40', 'Station cards 1–8', 'Penjara card']) {
      const r = screen.getByText(label).closest('[data-testid="kit-row"]') as HTMLElement
      fireEvent.click(within(r).getByRole('button', { name: 'PRINT' }))
    }
    expect(open).toHaveBeenCalledTimes(3)
    expect(open).toHaveBeenCalledWith('/print/tags', '_blank')
  })

  it('counts the unused slips of each side and has no old card section', async () => {
    render(<YourKit />)
    expect(await screen.findByText('Dikejar: 10 unused · Kejar: 10 unused')).toBeTruthy()
    expect(screen.getByText('TUPPERWARE SLIPS')).toBeTruthy()
    expect(screen.queryByText('SECRET CARDS · FULL MODE')).toBeNull()
    expect(call).toHaveBeenCalledWith('listSlips', { organiserToken: 'ot1' })
    expect(screen.queryByText('Print a new slip sheet')).toBeNull()
  })

  it('counts only unused: bound and used slips do not count', async () => {
    slips = sheet({ dikejar1: 'bound', dikejar2: 'used', kejar1: 'used' })
    render(<YourKit />)
    expect(await screen.findByText('Dikejar: 8 unused · Kejar: 9 unused')).toBeTruthy()
  })

  it('says to print a new sheet when either side is down to 2', async () => {
    slips = sheet(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`kejar${i + 1}`, 'used' as const])))
    render(<YourKit />)
    expect(await screen.findByText('Dikejar: 10 unused · Kejar: 2 unused')).toBeTruthy()
    expect(screen.getByText('Print a new slip sheet')).toBeTruthy()
  })

  it('Print slips opens the print page', async () => {
    render(<YourKit />)
    await screen.findByText('Dikejar: 10 unused · Kejar: 10 unused')
    fireEvent.click(screen.getByRole('button', { name: 'Print slips' }))
    expect(open).toHaveBeenCalledWith('/print/slips', '_blank')
  })

  it('Make a new sheet makes it, then reloads the counts', async () => {
    render(<YourKit />)
    await screen.findByText('Dikejar: 10 unused · Kejar: 10 unused')
    call.mockImplementation(async (action: string) => {
      if (action === 'listSlips') return [...slips, ...slips.map((s) => ({ ...s, number: s.number + 10, token: `n${s.token}` }))]
      return { ok: true }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Make a new sheet' }))
    expect(await screen.findByText('Dikejar: 20 unused · Kejar: 20 unused')).toBeTruthy()
    expect(call).toHaveBeenCalledWith('makeSlipSheet', { organiserToken: 'ot1' })
    const names = call.mock.calls.map((c) => c[0])
    expect(names.indexOf('makeSlipSheet')).toBeLessThan(names.lastIndexOf('listSlips'))
  })

  it('shows a failed new sheet in plain text', async () => {
    render(<YourKit />)
    await screen.findByText('Dikejar: 10 unused · Kejar: 10 unused')
    call.mockImplementation(async (action: string) => {
      if (action === 'makeSlipSheet') throw new Error('No connection')
      return slips
    })
    fireEvent.click(screen.getByRole('button', { name: 'Make a new sheet' }))
    expect(await screen.findByText('No connection')).toBeTruthy()
  })
})
