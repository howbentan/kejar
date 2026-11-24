import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { testView } from '../screens/testView'
import { floodPanel, frozenPanel, powerPanels } from './statePanels'

afterEach(cleanup)

describe('state panels (design 2026-11-24 §3)', () => {
  it('tells a runner in the water how long they have left', () => {
    const v = testView({ wetUntil: 100_000 + 27_000 })
    render(<>{floodPanel(v, 100_000)}</>)
    expect(screen.getByRole('alert', { name: 'In the water' })).toHaveTextContent('In the water!Dry land in 27 s')
  })

  it('shows nothing on dry land', () => {
    expect(floodPanel(testView({ wetUntil: null }), 100_000)).toBeNull()
  })

  it('counts down a frozen slot, and goes when it thaws', () => {
    render(<>{frozenPanel(testView({ frozenUntil: 100_000 + 161_000 }), 100_000)}</>)
    expect(screen.getByRole('status', { name: 'Your power-up is frozen' })).toHaveTextContent('Slot frozen 2:41')
    expect(frozenPanel(testView({ frozenUntil: 90_000 }), 100_000)).toBeNull()
  })

  it('gives each running power-up its own panel', () => {
    render(<>{powerPanels(['shield', 'cloak'])}</>)
    expect(screen.getAllByRole('status').map((p) => p.textContent)).toEqual([
      expect.stringContaining('Durian'),
      expect.stringContaining('Ponteng'),
    ])
  })
})
