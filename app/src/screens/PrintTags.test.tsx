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

  it('the public sheet never prints a hidden-stash card: each game prints its own from the organiser tools (ruling R15)', async () => {
    render(<PrintTags />)
    await waitFor(() => expect(encoded).toContain('KEJAR:JAIL'))
    expect(encoded.filter((t) => t.startsWith('KEJAR:DATO'))).toEqual([])
    expect(screen.queryByTestId('stash-card')).toBeNull()
    expect(document.body.textContent).not.toMatch(/★|dato|seri|hidden/i)
  })
})
