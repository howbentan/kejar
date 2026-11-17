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

  it('prints each station and Penjara as its own A4 poster, so it can be taped up and scanned from a step away', () => {
    render(<PrintTags />)
    const posters = [...document.querySelectorAll('.a4-poster')]
    expect(posters.map((p) => p.querySelector('h2')?.textContent)).toEqual([...Array.from({ length: 8 }, (_, i) => `STATION ${i + 1}`), 'PENJARA'])
  })

  it('prints 40 armbands, #01 to #40, one QR code each', async () => {
    render(<PrintTags />)
    await waitFor(() => expect(encoded).toContain('KEJAR:JAIL'))
    expect(encoded.filter((t) => t.startsWith('KEJAR:TAG'))).toHaveLength(40)
    expect(screen.getByText('#40')).toBeInTheDocument()
    expect(screen.queryByText('#41')).toBeNull()
  })

  it('the public sheet never prints a hidden-stash card: each game prints its own from the organiser tools (ruling R15)', async () => {
    render(<PrintTags />)
    await waitFor(() => expect(encoded).toContain('KEJAR:JAIL'))
    expect(encoded.filter((t) => t.startsWith('KEJAR:DATO'))).toEqual([])
    expect(screen.queryByTestId('stash-card')).toBeNull()
    expect(document.body.textContent).not.toMatch(/★|dato|seri|hidden/i)
  })
})
