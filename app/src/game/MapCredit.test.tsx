import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import MapCredit from './MapCredit'

afterEach(cleanup)

describe('MapCredit', () => {
  it('shows the required credit text', () => {
    const { container } = render(<MapCredit />)
    expect(container.querySelector('.map-credit')!.textContent).toBe('OpenFreeMap © OpenMapTiles Data from OpenStreetMap')
  })

  it('links the three providers in a new tab', () => {
    render(<MapCredit />)
    const hrefs = {
      OpenFreeMap: 'https://openfreemap.org',
      OpenMapTiles: 'https://www.openmaptiles.org/',
      OpenStreetMap: 'https://www.openstreetmap.org/copyright',
    }
    for (const [name, href] of Object.entries(hrefs)) {
      const a = screen.getByRole('link', { name })
      expect(a).toHaveAttribute('href', href)
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noreferrer')
    }
  })

  it('on our own map file, credits only OpenStreetMap', () => {
    const { container } = render(<MapCredit tiles="own" />)
    expect(container.querySelector('.map-credit')!.textContent).toBe('© OpenStreetMap')
    expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })
})
