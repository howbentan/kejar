import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PowerCard from './PowerCard'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

afterEach(() => {
  cleanup()
  reduce.on = false
})

describe('PowerCard', () => {
  it('face up: eyebrow, sticker, name and effect', () => {
    render(<PowerCard kind="cloak" />)
    expect(screen.getByText('POWER-UP')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ponteng' })).toBeInTheDocument()
    expect(screen.getByText('Ponteng')).toBeInTheDocument()
    expect(screen.getByText('You skip the next ping')).toBeInTheDocument()
  })

  it('big is a larger card with a larger sticker', () => {
    const { container } = render(<PowerCard kind="shield" big />)
    expect(container.querySelector('.power-card')).toHaveClass('big')
    expect(screen.getByRole('img', { name: 'Durian' })).toHaveAttribute('width', '104')
  })

  it('face down shows nothing of the power-up', () => {
    render(<PowerCard kind="cloak" faceDown />)
    expect(screen.getByLabelText('Face-down card')).toBeInTheDocument()
    expect(screen.queryByText('Ponteng')).toBeNull()
    expect(screen.queryByRole('img', { name: 'Ponteng' })).toBeNull()
  })

  it('Dato Seri has the legendary face with a foil layer; no other card ever does', () => {
    const { container } = render(<PowerCard kind="dato" />)
    expect(screen.getByTestId('foil')).toBeInTheDocument()
    expect(container.querySelector('.power-card')).toHaveClass('legendary')
    expect(screen.getByText('★ LEGENDARY · ONE PER GAME')).toBeInTheDocument()
    expect(screen.queryByText('POWER-UP')).toBeNull()
    cleanup()
    for (const kind of ['shield', 'cloak', 'flare', 'toyol', 'along', 'grab'] as const) {
      const r = render(<PowerCard kind={kind} />)
      expect(screen.queryByTestId('foil')).toBeNull()
      expect(r.container.querySelector('.power-card')).not.toHaveClass('legendary')
      cleanup()
    }
    render(<PowerCard kind="shield" faceDown />)
    expect(screen.queryByTestId('foil')).toBeNull()
  })

  it('the foil highlight follows device tilt, and stays still under reduced motion', async () => {
    render(<PowerCard kind="dato" />)
    const foil = screen.getByTestId('foil')
    act(() => {
      window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma: 30, beta: 45 }))
    })
    await waitFor(() => expect(foil.style.getPropertyValue('--foil-x')).toBe('83%'))
    cleanup()
    reduce.on = true
    render(<PowerCard kind="dato" />)
    const still = screen.getByTestId('foil')
    act(() => {
      window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma: 30, beta: 45 }))
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(still.style.getPropertyValue('--foil-x')).toBe('')
    expect(still).toHaveAttribute('data-still', 'true')
  })
})
