import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

import YourKit from './YourKit'

type Card = { legendary: 'dato' | 'bomoh'; letter: string; state: string; foundAt: string | null; inGame: boolean }
const set = (over: Record<string, Partial<Card>> = {}): Card[] =>
  ['dato', 'bomoh'].flatMap((legendary) =>
    ['A', 'B', 'C'].map((letter) => ({
      legendary: legendary as 'dato' | 'bomoh',
      letter,
      state: 'ready',
      foundAt: null,
      inGame: false,
      ...over[`${legendary}${letter}`],
    })),
  )

let cards: Card[]
let open: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'ot1', name: 'Owner' }))
  cards = set()
  call.mockReset()
  call.mockImplementation(async (action: string) => {
    if (action === 'listSecretCards') return cards
    if (action === 'secretCardCode') return { code: 'CODE123' }
    return { ok: true }
  })
  open = vi.spyOn(window, 'open').mockImplementation(() => null)
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  open.mockRestore()
})

const row = (name: string) => screen.getByText(name).closest('[data-testid="card-row"]') as HTMLElement

describe('YourKit', () => {
  it('asks for an invite link with no organiser session', () => {
    localStorage.clear()
    render(<YourKit />)
    expect(screen.getByText(/need an invite link/i)).toBeTruthy()
    expect(call).not.toHaveBeenCalled()
  })

  it('shows the heading and the every-game group, each printing the sheet', () => {
    render(<YourKit />)
    expect(screen.getByRole('heading', { name: 'Print once.' })).toBeTruthy()
    expect(screen.getByText('Laminate it and reuse it every game.')).toBeTruthy()
    expect(screen.getByText('EVERY GAME')).toBeTruthy()
    for (const label of ['Armbands #01–#40', 'Station cards 1–8', 'Penjara card']) {
      const r = screen.getByText(label).closest('[data-testid="kit-row"]') as HTMLElement
      fireEvent.click(within(r).getByRole('button', { name: 'PRINT' }))
    }
    expect(open).toHaveBeenCalledTimes(3)
    expect(open).toHaveBeenCalledWith('/print/tags', '_blank')
  })

  it('lists the six secret cards', async () => {
    render(<YourKit />)
    expect(await screen.findByText('Yellow A')).toBeTruthy()
    expect(screen.getByText('SECRET CARDS · FULL MODE')).toBeTruthy()
    for (const n of ['Yellow B', 'Yellow C', 'Purple A', 'Purple B', 'Purple C']) expect(screen.getByText(n)).toBeTruthy()
    expect(call).toHaveBeenCalledWith('listSecretCards', { organiserToken: 'ot1' })
  })

  it('a ready card prints through its code, and can be retired', async () => {
    render(<YourKit />)
    await screen.findByText('Yellow A')
    const r = row('Yellow A')
    expect(within(r).getByText(/^Ready/)).toBeTruthy()
    fireEvent.click(within(r).getByRole('button', { name: 'PRINT' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('/print/card#CODE123', '_blank'))
    expect(call).toHaveBeenCalledWith('secretCardCode', { organiserToken: 'ot1', legendary: 'dato', letter: 'A' })
    fireEvent.click(within(r).getByRole('button', { name: 'Retire' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('retireSecretCard', { organiserToken: 'ot1', legendary: 'dato', letter: 'A' }))
  })

  it('says when a ready card is in the game today', async () => {
    cards = set({ datoB: { inGame: true } })
    render(<YourKit />)
    await screen.findByText('Yellow B')
    expect(within(row('Yellow B')).getByText(/In today's game/)).toBeTruthy()
  })

  it('a found card reads retired with its date, and reprint then prints', async () => {
    cards = set({ datoA: { state: 'retired', foundAt: '2026-11-02T10:00:00.000Z' }, bomohB: { state: 'retired' } })
    render(<YourKit />)
    await screen.findByText('Yellow A')
    expect(within(row('Yellow A')).getByText('Found on 2 Nov · retired')).toBeTruthy()
    expect(within(row('Purple B')).getByText('Retired')).toBeTruthy()
    fireEvent.click(within(row('Yellow A')).getByRole('button', { name: 'REPRINT' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('/print/card#CODE123', '_blank'))
    const names = call.mock.calls.map((c) => c[0])
    expect(names.indexOf('reprintSecretCard')).toBeLessThan(names.indexOf('secretCardCode'))
  })

  it('a printing card waits for the organiser to confirm', async () => {
    cards = set({ datoC: { state: 'printing' } })
    render(<YourKit />)
    await screen.findByText('Yellow C')
    const r = row('Yellow C')
    expect(within(r).getByText('New code · print it, then confirm')).toBeTruthy()
    fireEvent.click(within(r).getByRole('button', { name: "I'VE PRINTED IT" }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('confirmSecretCardPrinted', { organiserToken: 'ot1', legendary: 'dato', letter: 'C' }))
  })

  it('shows a 409 in plain text on the row', async () => {
    call.mockImplementation(async (action: string) => {
      if (action === 'listSecretCards') return cards
      throw new Error('That card is in a game right now.')
    })
    render(<YourKit />)
    await screen.findByText('Yellow A')
    fireEvent.click(within(row('Yellow A')).getByRole('button', { name: 'Retire' }))
    await waitFor(() => expect(within(row('Yellow A')).getByText('That card is in a game right now.')).toBeTruthy())
    expect(within(row('Yellow B')).queryByText('That card is in a game right now.')).toBeNull()
  })
})
