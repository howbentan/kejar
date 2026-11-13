import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

import YourKit from './YourKit'

type Kind = 'dato' | 'ring' | 'bomoh' | 'hijau'
type Card = { legendary: Kind; letter: string; state: string; foundAt: string | null; inGame: boolean }
const set = (over: Record<string, Partial<Card>> = {}): Card[] =>
  ['dato', 'ring', 'bomoh', 'hijau'].flatMap((legendary) =>
    ['A', 'B', 'C'].map((letter) => ({
      legendary: legendary as Kind,
      letter,
      state: 'ready',
      foundAt: null,
      inGame: false,
      ...over[`${legendary}${letter}`],
    })),
  )

let cards: Card[]
let open: ReturnType<typeof vi.spyOn>
let tab: { location: { href: string }; close: ReturnType<typeof vi.fn> }

beforeEach(() => {
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'ot1', name: 'Owner' }))
  cards = set()
  call.mockReset()
  call.mockImplementation(async (action: string) => {
    if (action === 'listSecretCards') return cards
    if (action === 'secretCardCode') return { code: 'CODE123' }
    return { ok: true }
  })
  tab = { location: { href: '' }, close: vi.fn() }
  open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window)
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

  it('lists the four secret sets: yellow, orange, purple and green, A to C each, in that order', async () => {
    render(<YourKit />)
    expect(await screen.findByText('Yellow A')).toBeTruthy()
    expect(screen.getByText('SECRET CARDS · FULL MODE')).toBeTruthy()
    const names = screen.getAllByTestId('card-row').map((r) => r.querySelector('b')!.textContent)
    expect(names).toEqual(['Yellow', 'Orange', 'Purple', 'Green'].flatMap((c) => ['A', 'B', 'C'].map((l) => `${c} ${l}`)))
    expect(call).toHaveBeenCalledWith('listSecretCards', { organiserToken: 'ot1' })
  })

  it.each([
    ['Orange B', 'ring', 'var(--ring-2)'],
    ['Green C', 'hijau', 'var(--hijau-2)'],
  ])('%s prints through its own print link, in its own colour', async (name, legendary, colour) => {
    render(<YourKit />)
    await screen.findByText(name)
    expect((screen.getByText(name) as HTMLElement).style.color).toBe(colour)
    fireEvent.click(within(row(name)).getByRole('button', { name: 'PRINT' }))
    await waitFor(() => expect(tab.location.href).toBe(`/print/card#${legendary}/CODE123`))
    expect(call).toHaveBeenCalledWith('secretCardCode', { organiserToken: 'ot1', legendary, letter: name.slice(-1) })
  })

  it('a ready card prints through its code, and can be retired', async () => {
    render(<YourKit />)
    await screen.findByText('Yellow A')
    const r = row('Yellow A')
    expect(within(r).getByText(/^Ready/)).toBeTruthy()
    fireEvent.click(within(r).getByRole('button', { name: 'PRINT' }))
    // The tab opens blank inside the tap, then points at the card once the code arrives.
    expect(open).toHaveBeenCalledWith('', '_blank')
    await waitFor(() => expect(tab.location.href).toBe('/print/card#CODE123'))
    expect(call).toHaveBeenCalledWith('secretCardCode', { organiserToken: 'ot1', legendary: 'dato', letter: 'A' })
    fireEvent.click(within(r).getByRole('button', { name: 'Retire' }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('retireSecretCard', { organiserToken: 'ot1', legendary: 'dato', letter: 'A' }))
  })

  it('a purple card prints through the Bomoh print link', async () => {
    render(<YourKit />)
    await screen.findByText('Purple A')
    fireEvent.click(within(row('Purple A')).getByRole('button', { name: 'PRINT' }))
    await waitFor(() => expect(tab.location.href).toBe('/print/card#bomoh/CODE123'))
    expect(call).toHaveBeenCalledWith('secretCardCode', { organiserToken: 'ot1', legendary: 'bomoh', letter: 'A' })
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
    expect(open).toHaveBeenCalledWith('', '_blank')
    await waitFor(() => expect(tab.location.href).toBe('/print/card#CODE123'))
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

  it("hides Retire on a card in today's game", async () => {
    cards = set({ datoB: { inGame: true } })
    render(<YourKit />)
    await screen.findByText('Yellow B')
    expect(within(row('Yellow B')).queryByRole('button', { name: 'Retire' })).toBeNull()
    expect(within(row('Yellow A')).getByRole('button', { name: 'Retire' })).toBeTruthy()
  })

  it('closes the blank tab and shows the error when the code can not be fetched', async () => {
    call.mockImplementation(async (action: string) => {
      if (action === 'listSecretCards') return cards
      throw new Error('No connection')
    })
    render(<YourKit />)
    await screen.findByText('Yellow A')
    fireEvent.click(within(row('Yellow A')).getByRole('button', { name: 'PRINT' }))
    await waitFor(() => expect(within(row('Yellow A')).getByText('No connection')).toBeTruthy())
    expect(tab.close).toHaveBeenCalled()
  })

  it('prints in the same tab when the browser blocks the new one', async () => {
    open.mockImplementation(() => null)
    const assign = vi.fn()
    const loc = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...loc, assign } })
    render(<YourKit />)
    await screen.findByText('Yellow A')
    fireEvent.click(within(row('Yellow A')).getByRole('button', { name: 'PRINT' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/print/card#CODE123'))
    Object.defineProperty(window, 'location', { configurable: true, value: loc })
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
