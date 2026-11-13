import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testView } from '../screens/testView'
import type { View } from '../../shared/views.js'
import EndgameTakeover from './EndgameTakeover'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

const withEndgame = (endgame: View['endgame'], over: Partial<View> = {}) => testView({ endgame, ...over })
const pkp = () => withEndgame({ kind: 'pkp', revealedAt: 90_000, wanted: null, bountyCaught: false })
const hebat = (meId = 'r1') => {
  const base = testView()
  return withEndgame(
    { kind: 'hebat', revealedAt: 90_000, wanted: { id: 'r1', label: '#07', name: 'Aina' }, bountyCaught: false },
    { me: { ...base.me, id: meId, name: meId === 'r1' ? 'Aina' : 'Wei', tag_id: meId === 'r1' ? 7 : 11 } },
  )
}

describe('EndgameTakeover (endgame design §6.4)', () => {
  it('nothing before the reveal', () => {
    const { container } = render(<EndgameTakeover code="ABC234" view={testView()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("PKP fills the screen in its pink: the eyebrow, the logo, the title, the rule card and Got it", () => {
    render(<EndgameTakeover code="ABC234" view={pkp()} />)
    expect(screen.getByRole('alertdialog', { name: 'pkp!' })).toBeInTheDocument()
    expect(screen.getByText('5 MINUTES LEFT · ENDGAME')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'PKP' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'pkp!' })).toBeInTheDocument()
    expect(screen.getByText('Penjara is closed for good. No more jailbreaks.')).toBeInTheDocument()
    expect(screen.getByText('Every station now gives two goes of its card. Use them or lose them.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })

  it('shows once per game per phone: gone after Got it, on a re-render and on the next open', () => {
    const onDone = vi.fn()
    const { rerender, unmount } = render(<EndgameTakeover code="ABC234" view={pkp()} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    rerender(<EndgameTakeover code="ABC234" view={{ ...pkp(), now: 103_000 }} onDone={onDone} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    unmount()
    render(<EndgameTakeover code="ABC234" view={pkp()} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(localStorage.getItem('kejar:endgame-seen:ABC234')).not.toBeNull()
  })

  it('another game on the same phone still gets its own takeover', () => {
    localStorage.setItem('kejar:endgame-seen:OTHER1', '1')
    render(<EndgameTakeover code="ABC234" view={pkp()} />)
    expect(screen.getByRole('alertdialog', { name: 'pkp!' })).toBeInTheDocument()
  })

  it('storage that fails: Got it still closes it, and it shows again next time', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { unmount } = render(<EndgameTakeover code="ABC234" view={pkp()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    unmount()
    render(<EndgameTakeover code="ABC234" view={pkp()} />)
    expect(screen.getByRole('alertdialog', { name: 'pkp!' })).toBeInTheDocument()
  })

  it("Hang Hebat names the wanted runner for everyone else", () => {
    render(<EndgameTakeover code="ABC234" view={hebat('r3')} />)
    expect(screen.getByRole('heading', { name: 'hang hebat!' })).toBeInTheDocument()
    expect(screen.getByText('10 MINUTES LEFT · ENDGAME')).toBeInTheDocument()
    expect(screen.getByText(/#07 Aina survived the longest/)).toBeInTheDocument()
    expect(screen.queryByText("You're wanted.")).toBeNull()
  })

  it("the wanted runner sees You're wanted.", () => {
    render(<EndgameTakeover code="ABC234" view={hebat('r1')} />)
    expect(screen.getByText("You're wanted.")).toBeInTheDocument()
    expect(screen.queryByText(/survived the longest/)).toBeNull()
  })
})
