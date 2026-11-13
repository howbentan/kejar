import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { testView } from '../screens/testView'
import WantedPoster from './WantedPoster'

afterEach(cleanup)

const wanted = (bountyCaught = false) =>
  testView({ endgame: { kind: 'hebat', revealedAt: 90_000, wanted: { id: 'r1', label: '#07', name: 'Aina' }, bountyCaught } })

describe('WantedPoster (endgame design §8.3)', () => {
  it('shows the armband number and name, DIKEHENDAKI · HANG HEBAT and the keris', () => {
    render(<WantedPoster view={wanted()} />)
    expect(screen.getByText('WANTED')).toBeInTheDocument()
    expect(screen.getByText('DIKEHENDAKI · HANG HEBAT')).toBeInTheDocument()
    expect(screen.getByText('#07 Aina')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Hang Hebat' })).toBeInTheDocument()
  })

  it('caught: the poster is stamped, and only then', () => {
    const { unmount } = render(<WantedPoster view={wanted()} />)
    expect(screen.queryByText('caught!')).toBeNull()
    unmount()
    render(<WantedPoster view={wanted(true)} />)
    expect(screen.getByText('caught!')).toBeInTheDocument()
  })

  it('nothing without a wanted runner', () => {
    const { container } = render(<WantedPoster view={testView()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
