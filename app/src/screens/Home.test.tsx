import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testView } from './testView'

const api = vi.hoisted(() => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  return { call: vi.fn(), ApiError }
})
vi.mock('../game/api', () => api)
// The camera scanner, replaced by a button that "scans" whatever the test sets.
const scan = vi.hoisted(() => ({ text: '' }))
vi.mock('../game/Scanner', () => ({
  default: ({ onResult, onCancel }: { onResult: (t: string) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onResult(scan.text)}>fake scan</button>
      <button onClick={onCancel}>cancel</button>
    </div>
  ),
}))
import { saveLastGame } from '../game/lastGame'
import { saveOrganiserSession } from '../game/organiserSession'
import { saveSession } from '../game/session'
import Home from './Home'
import { joinCodeFrom } from './HomeJoin'

const assign = vi.fn()

beforeEach(() => {
  api.call.mockReset()
  api.call.mockRejectedValue(new api.ApiError(500, 'offline'))
  assign.mockClear()
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('location', { ...window.location, assign })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Home', () => {
  it('shows the logo, join game, organise game and the how-to-play link, and no tagline', () => {
    render(<Home />)
    expect(screen.getByTestId('hl')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'join game' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'organise game' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'if dk how to play click here :)' })).toBeInTheDocument()
    expect(screen.queryByText(/refereed/i)).toBeNull()
  })

  it('still shows the buttons when the browser blocks storage', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    try {
      render(<Home />)
      expect(screen.getByRole('button', { name: 'join game' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /reconnect/ })).toBeNull()
    } finally {
      Object.defineProperty(window, 'localStorage', real)
    }
  })

  it('a fresh open plays the opening: lime with the logo in black, then home', () => {
    render(<Home />)
    // Without a measured screen (jsdom) the j arrives at once, so the opening hands over straight away.
    expect(sessionStorage.getItem('kejar.opened')).toBe('1')
    expect(screen.getByRole('button', { name: 'join game' })).toBeInTheDocument()
  })

  it('once opened this visit, home starts straight away with the j running', () => {
    sessionStorage.setItem('kejar.opened', '1')
    render(<Home />)
    expect(screen.getByRole('main')).not.toHaveClass('opening')
    expect(screen.getByTestId('hl')).not.toHaveClass('inverted')
    expect(screen.getByTestId('hl')).toHaveClass('tappable')
  })

  it('has no reconnect without a last game', () => {
    render(<Home />)
    expect(screen.queryByRole('link', { name: /reconnect/ })).toBeNull()
  })

  it('reconnect goes to the game for a recent player game', () => {
    saveSession(localStorage, 'ABC234', { token: 't' })
    render(<Home />)
    expect(screen.getByRole('link', { name: /reconnect/ })).toHaveAttribute('href', '/g/ABC234')
  })

  it('reconnect goes to the lobby for a recent organiser game', () => {
    saveOrganiserSession(localStorage, { organiserToken: 'o', name: 'Owner' })
    saveLastGame(localStorage, 'ABC234', 'organiser')
    render(<Home />)
    expect(screen.getByRole('link', { name: /reconnect/ })).toHaveAttribute('href', '/host/ABC234')
  })

  it('organise game links to /host/new', () => {
    render(<Home />)
    expect(screen.getByRole('link', { name: 'organise game' })).toHaveAttribute('href', '/host/new')
  })

  it('the buttons sit outside the logo, so a tap on them never makes the j jump', () => {
    render(<Home />)
    const toy = screen.getByTestId('hl')
    expect(toy).not.toContainElement(screen.getByRole('button', { name: 'join game' }))
    expect(toy).not.toContainElement(screen.getByRole('link', { name: 'organise game' }))
    expect(toy).not.toContainElement(screen.getByRole('button', { name: 'if dk how to play click here :)' }))
  })

  it('join game opens the join step and back returns', () => {
    render(<Home />)
    fireEvent.click(screen.getByRole('button', { name: 'join game' }))
    expect(screen.getByRole('heading', { name: 'code?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'join game' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByRole('button', { name: 'join game' })).toBeInTheDocument()
  })

  it('the how-to-play link opens the runner story and closing returns', () => {
    render(<Home />)
    fireEvent.click(screen.getByRole('button', { name: 'if dk how to play click here :)' }))
    expect(screen.getByRole('heading')).toHaveTextContent("You're Dikejar.")
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })
})

describe('join step', () => {
  const openJoin = () => {
    render(<Home />)
    fireEvent.click(screen.getByRole('button', { name: 'join game' }))
  }

  it('joins when Enter is pressed in the code box', () => {
    openJoin()
    const box = screen.getByLabelText(/game code/i)
    fireEvent.change(box, { target: { value: 'abc234' } })
    fireEvent.submit(box)
    expect(assign).toHaveBeenCalledWith('/join/ABC234')
  })

  it('does nothing on Enter until the code is 6 characters', () => {
    openJoin()
    const box = screen.getByLabelText(/game code/i)
    fireEvent.change(box, { target: { value: 'abc' } })
    fireEvent.submit(box)
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'join' })).toBeDisabled()
  })

  it('still joins from the join button', () => {
    openJoin()
    fireEvent.change(screen.getByLabelText(/game code/i), { target: { value: 'ABC234' } })
    fireEvent.click(screen.getByRole('button', { name: 'join' }))
    expect(assign).toHaveBeenCalledWith('/join/ABC234')
  })

  it('joinCodeFrom accepts a join link or a bare code and rejects others', () => {
    expect(joinCodeFrom('https://x.app/join/abc234')).toBe('ABC234')
    expect(joinCodeFrom('abc234')).toBe('ABC234')
    expect(joinCodeFrom('https://x.app/g/ABC234')).toBeNull()
    expect(joinCodeFrom('hello')).toBeNull()
  })
})

describe('home upgrades', () => {
  const opened = () => sessionStorage.setItem('kejar.opened', '1')

  it('the camera button opens the scanner and a good scan joins', () => {
    opened()
    render(<Home />)
    fireEvent.click(screen.getByRole('button', { name: 'scan qr' }))
    scan.text = 'https://x.app/join/abc234'
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }))
    expect(assign).toHaveBeenCalledWith('/join/ABC234')
  })

  it('a bad scan says so and closes the scanner', () => {
    opened()
    render(<Home />)
    fireEvent.click(screen.getByRole('button', { name: 'scan qr' }))
    scan.text = 'hello'
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }))
    expect(screen.getByText('That QR is not a kejar game.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'fake scan' })).toBeNull()
  })

  it('a tip shows under the logo and tapping it shows another, without making the j jump', () => {
    opened()
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    render(<Home />)
    const tip = screen.getByRole('button', { name: /^TIP/ })
    const first = tip.textContent
    fireEvent.pointerDown(tip)
    fireEvent.click(tip)
    expect(screen.getByRole('button', { name: /^TIP/ }).textContent).not.toBe(first)
    expect(vibrate).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('with a lobby game that has a start time, the countdown shows instead of the tip', async () => {
    opened()
    saveSession(localStorage, 'ABC234', { token: 't' })
    const now = Date.now()
    api.call.mockResolvedValue(testView({ phase: 'lobby', now, settings: { ...testView().settings, startsAt: new Date(now + 270_000).toISOString() } }))
    render(<Home />)
    await act(async () => {})
    expect(screen.getByText('GAME ABC234 STARTS IN')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '4:30' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^TIP/ })).toBeNull()
  })

  it('at the start time it reads starting soon', async () => {
    opened()
    saveSession(localStorage, 'ABC234', { token: 't' })
    const now = Date.now()
    api.call.mockResolvedValue(testView({ phase: 'lobby', now, settings: { ...testView().settings, startsAt: new Date(now).toISOString() } }))
    render(<Home />)
    await act(async () => {})
    expect(screen.getByText('starting soon')).toBeInTheDocument()
  })
})

