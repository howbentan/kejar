import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const encoded = vi.hoisted(() => [] as string[])
vi.mock('../game/qr', () => ({ qrDataUrl: async (t: string) => (encoded.push(t), `data:${t}`) }))

import PrintCard from './PrintCard'

afterEach(() => {
  cleanup()
  encoded.length = 0
})

describe('PrintCard: one game’s hidden ★ card (ruling R15)', () => {
  it("prints this game's own code, showing only a star and kejar.", async () => {
    render(<PrintCard cardCode="Zx9_q-4abcDEF123456789" />)
    await waitFor(() => expect(screen.getByAltText('★')).toHaveAttribute('src', 'data:KEJAR:DATO:Zx9_q-4abcDEF123456789'))
    const card = screen.getByTestId('stash-card')
    expect(card.textContent).toBe('★kejar.')
    // The printed card itself never says what it is (rules doc §9b).
    expect(card.outerHTML.replace(/data:KEJAR:DATO:[^"]*/, '')).not.toMatch(/dato|seri|legend|power|scan/i)
    // Nor does the on-screen note: the page can be seen over the organiser's shoulder.
    expect(document.body.textContent).not.toMatch(/dato|seri/i)
    expect(encoded).toEqual(['KEJAR:DATO:Zx9_q-4abcDEF123456789'])
  })

  it('without a code (opened by hand, not from the organiser tools), prints nothing', async () => {
    render(<PrintCard cardCode="" />)
    expect(screen.queryByTestId('stash-card')).toBeNull()
    expect(screen.getByText(/Open this from Organiser tools in the game lobby/)).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 0))
    expect(encoded).toEqual([])
  })
})
