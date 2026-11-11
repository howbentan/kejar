import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveLastGame } from '../game/lastGame'
import { saveOrganiserSession } from '../game/organiserSession'
import { saveSession } from '../game/session'
import Home from './Home'
import { joinCodeFrom } from './HomeJoin'

const assign = vi.fn()

beforeEach(() => {
  assign.mockClear()
  localStorage.clear()
  vi.stubGlobal('location', { ...window.location, assign })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Home', () => {
  it('shows the logo, join game, organise game and the how-to-play link, and no tagline', () => {
    render(<Home />)
    expect(screen.getByTestId('toy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'join game' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'organise game' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'if dk how to play click here :)' })).toBeInTheDocument()
    expect(screen.queryByText(/refereed/i)).toBeNull()
  })

  it('has no reconnect without a last game', () => {
    render(<Home />)
    expect(screen.queryByRole('link', { name: 'reconnect' })).toBeNull()
  })

  it('reconnect goes to the game for a recent player game', () => {
    saveSession(localStorage, 'ABC234', { token: 't' })
    render(<Home />)
    expect(screen.getByRole('link', { name: 'reconnect' })).toHaveAttribute('href', '/g/ABC234')
  })

  it('reconnect goes to the lobby for a recent organiser game', () => {
    saveOrganiserSession(localStorage, { organiserToken: 'o', name: 'Owner' })
    saveLastGame(localStorage, 'ABC234', 'organiser')
    render(<Home />)
    expect(screen.getByRole('link', { name: 'reconnect' })).toHaveAttribute('href', '/host/ABC234')
  })

  it('organise game links to /host/new', () => {
    render(<Home />)
    expect(screen.getByRole('link', { name: 'organise game' })).toHaveAttribute('href', '/host/new')
  })

  it('the buttons sit outside the toy, so a tap on them is never a catch', () => {
    render(<Home />)
    const toy = screen.getByTestId('toy')
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
