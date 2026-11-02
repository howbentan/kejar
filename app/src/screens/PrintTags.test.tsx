import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const encoded = vi.hoisted(() => [] as string[])
vi.mock('../game/qr', () => ({ qrDataUrl: async (t: string) => (encoded.push(t), `data:${t}`) }))

import PrintTags from './PrintTags'

afterEach(() => {
  cleanup()
  encoded.length = 0
})

describe('PrintTags', () => {
  it('prints Station 1 to Station 8 alongside the runner tags', () => {
    render(<PrintTags />)
    for (let n = 1; n <= 8; n++) expect(screen.getByText(`STATION ${n}`)).toBeInTheDocument()
    expect(screen.getByText('#01')).toBeInTheDocument()
  })

  it('Core prints no hidden-stash card', async () => {
    render(<PrintTags />)
    await waitFor(() => expect(encoded).toContain('KEJAR:JAIL'))
    expect(encoded).not.toContain('KEJAR:DATO')
    expect(screen.queryByTestId('stash-card')).toBeNull()
  })

  it('Full prints the hidden-stash card, showing only a star and kejar.', async () => {
    render(<PrintTags full />)
    await waitFor(() => expect(screen.getByAltText('★')).toHaveAttribute('src', 'data:KEJAR:DATO'))
    const card = screen.getByTestId('stash-card')
    expect(card.textContent).toBe('★kejar.')
    // The printed card itself never says what it is (rules doc §9b).
    expect(card.outerHTML.replace('data:KEJAR:DATO', '')).not.toMatch(/dato|seri|legend|power|scan/i)
    // Nor does the on-screen note for the organiser: the page can be seen over their shoulder.
    expect(document.body.textContent).not.toMatch(/dato|seri/i)
    expect(screen.getByText(/Organiser only · show hidden card/)).toBeInTheDocument()
  })
})
