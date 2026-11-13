import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testView } from '../screens/testView'
import type { View } from '../../shared/views.js'
import EndgameChip, { EndgameStatus } from './EndgameChip'

afterEach(cleanup)

const bomba = () => testView({ endgame: { kind: 'bomba', revealedAt: 90_000, wanted: null, bountyCaught: false } })
const hebat = (meId: string) => {
  const base = testView()
  const v: View = testView({
    endgame: { kind: 'hebat', revealedAt: 90_000, wanted: { id: 'r1', label: '#07', name: 'Aina' }, bountyCaught: false },
    me: { ...base.me, id: meId },
  })
  return v
}

describe('EndgameChip (endgame design §6.4)', () => {
  it('nothing before the reveal', () => {
    const { container } = render(<EndgameChip view={testView()} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the endgame with its logo, and tapping it opens', () => {
    const onOpen = vi.fn()
    render(<EndgameChip view={bomba()} onOpen={onOpen} />)
    const chip = screen.getByRole('button', { name: /Bomba/ })
    expect(screen.getByRole('img', { name: 'Bomba' })).toBeInTheDocument()
    fireEvent.click(chip)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('Hang Hebat shows who is wanted, and "You" to the wanted runner', () => {
    const { unmount } = render(<EndgameChip view={hebat('c1')} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Wanted: #07 Aina/ })).toBeInTheDocument()
    unmount()
    render(<EndgameChip view={hebat('r1')} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Wanted: You/ })).toBeInTheDocument()
  })
})

describe('EndgameStatus: the chip and what it opens', () => {
  it('Bomba reopens the rule card', () => {
    render(<EndgameStatus view={bomba()} />)
    fireEvent.click(screen.getByRole('button', { name: /Bomba/ }))
    const card = screen.getByRole('dialog', { name: 'bomba!' })
    expect(card).toHaveTextContent('Pings every 2 minutes now, then every minute from 5 minutes left.')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Hang Hebat opens the wanted poster', () => {
    render(<EndgameStatus view={hebat('c1')} />)
    fireEvent.click(screen.getByRole('button', { name: /Hang Hebat/ }))
    const poster = screen.getByRole('dialog', { name: 'Wanted' })
    expect(poster).toHaveTextContent('DIKEHENDAKI · HANG HEBAT')
    expect(poster).toHaveTextContent('#07 Aina')
    expect(within(poster).getByRole('img', { name: 'Hang Hebat' })).toBeInTheDocument()
  })
})
