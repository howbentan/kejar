import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
const encoded = vi.hoisted(() => [] as string[])
vi.mock('../game/qr', () => ({ qrDataUrl: async (t: string) => (encoded.push(t), `data:${t}`) }))

import PrintSlips from './PrintSlips'

type Slip = { side: 'dikejar' | 'kejar'; number: number; token: string; state: 'unused' | 'bound' | 'used' }
const sheet = (): Slip[] =>
  (['dikejar', 'kejar'] as const).flatMap((side) =>
    Array.from({ length: 10 }, (_, i) => ({ side, number: i + 1, token: `${side}${i + 1}`, state: 'unused' as const })),
  )

beforeEach(() => {
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'ot1', name: 'Owner' }))
  call.mockReset()
  call.mockImplementation(async () => sheet())
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  encoded.length = 0
})

describe('PrintSlips', () => {
  it('prints all 20 slips with two-digit labels, a QR each, and the footer', async () => {
    render(<PrintSlips />)
    expect(await screen.findByText('Dikejar #04')).toBeInTheDocument()
    expect(screen.getAllByText(/^(Dikejar|Kejar) #\d\d$/)).toHaveLength(20)
    expect(screen.getByText('Kejar #10')).toBeInTheDocument()
    expect(screen.getByText('Any unused slip of the right side works.')).toBeInTheDocument()
    await waitFor(() => expect(encoded).toHaveLength(20))
    expect(encoded).toContain('KEJAR:SLIP:dikejar4')
    expect(call).toHaveBeenCalledWith('listSlips', { organiserToken: 'ot1' })
  })

  it('leaves out bound and used slips', async () => {
    call.mockImplementation(async () => sheet().map((s) => (s.side === 'dikejar' && s.number <= 2 ? { ...s, state: s.number === 1 ? 'used' : 'bound' } : s)))
    render(<PrintSlips />)
    expect(await screen.findByText('Dikejar #03')).toBeInTheDocument()
    expect(screen.queryByText('Dikejar #01')).toBeNull()
    expect(screen.queryByText('Dikejar #02')).toBeNull()
    expect(screen.getAllByText(/^(Dikejar|Kejar) #\d\d$/)).toHaveLength(18)
    await waitFor(() => expect(encoded).toHaveLength(18))
    expect(encoded).not.toContain('KEJAR:SLIP:dikejar1')
  })

  it('says so instead of printing a blank sheet when no slip is unused', async () => {
    call.mockImplementation(async () => sheet().map((s) => ({ ...s, state: 'used' })))
    render(<PrintSlips />)
    expect(await screen.findByText('No unused slips. Make a new sheet in Your Kit.')).toBeInTheDocument()
    expect(screen.queryAllByText(/^(Dikejar|Kejar) #\d\d$/)).toHaveLength(0)
  })

  it('asks for an organiser phone with no session', () => {
    localStorage.clear()
    render(<PrintSlips />)
    expect(screen.getByText(/organiser/i)).toBeInTheDocument()
    expect(call).not.toHaveBeenCalled()
  })

  it('shows the error when the slips can not be fetched', async () => {
    call.mockRejectedValue(new Error('No connection'))
    render(<PrintSlips />)
    expect(await screen.findByText('No connection')).toBeInTheDocument()
  })
})
