import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { testView } from '../screens/testView'
import FloodBanner from './FloodBanner'

afterEach(cleanup)

describe('FloodBanner', () => {
  it('says how long a runner in the water has left', () => {
    const v = testView({ wetUntil: 100_000 + 27_000, paused: true })
    render(<FloodBanner view={v} />)
    expect(screen.getByRole('alert', { name: 'In the water' })).toHaveTextContent('Banjir! Get to dry land · 27 s')
  })

  it('shows nothing on dry land', () => {
    render(<FloodBanner view={testView({ wetUntil: null })} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
