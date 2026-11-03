import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PenjaraTicket from './PenjaraTicket'

afterEach(cleanup)

describe('PenjaraTicket', () => {
  it('shows who caught the runner, when, and the live distance', () => {
    render(
      <PenjaraTicket
        playerId="r1"
        variant={{ kind: 'catch', caughtBy: 'Ben', caughtAtMs: new Date('2026-01-01T14:52:00').getTime() }}
        distanceM={193}
        outForGood={false}
        settled={false}
      />,
    )
    expect(screen.getByText('2:52')).toBeInTheDocument()
    expect(screen.getByText('190 M')).toBeInTheDocument()
    expect(screen.getByText('BELUM BAYAR')).toBeInTheDocument()
  })

  it('shows a dash before a GPS fix, not a blank or broken field', () => {
    render(<PenjaraTicket playerId="r1" variant={{ kind: 'catch', caughtBy: 'Ben', caughtAtMs: null }} distanceM={null} outForGood={false} settled={false} />)
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('auto-jail status reads differently from a chaser catch', () => {
    render(<PenjaraTicket playerId="r1" variant={{ kind: 'auto', lastSeenMs: null }} distanceM={null} outForGood={false} settled={false} />)
    expect(screen.getByText('SESSION TIMED OUT')).toBeInTheDocument()
    expect(screen.getByText('*** PHONE PROBLEM? ASK A MARSHAL ***')).toBeInTheDocument()
  })

  it('a player jailed for good gets a terminal status, not a false "walk to the gate"', () => {
    render(<PenjaraTicket playerId="r1" variant={{ kind: 'catch', caughtBy: 'Ben', caughtAtMs: null }} distanceM={null} outForGood={true} settled={false} />)
    expect(screen.getByText('HABIS · TIADA KELUARAN')).toBeInTheDocument()
    expect(screen.queryByText('BELUM BAYAR')).toBeNull()
  })

  it('shows the LEPAS stamp and flips STATUS to FREE once settled', () => {
    render(<PenjaraTicket playerId="r1" variant={{ kind: 'catch', caughtBy: 'Ben', caughtAtMs: null }} distanceM={null} outForGood={false} settled={true} />)
    expect(screen.getByText('LEPAS')).toBeInTheDocument()
    expect(screen.getByText('FREE')).toBeInTheDocument()
  })

  it('picks the same ticket number for the same player every time, not a new one per render', () => {
    const { unmount } = render(<PenjaraTicket playerId="same-id" variant={{ kind: 'auto', lastSeenMs: null }} distanceM={null} outForGood={false} settled={false} />)
    const first = screen.getByText(/^\d+$/).textContent
    unmount()
    render(<PenjaraTicket playerId="same-id" variant={{ kind: 'auto', lastSeenMs: null }} distanceM={null} outForGood={false} settled={false} />)
    expect(screen.getByText(/^\d+$/).textContent).toBe(first)
  })
})
