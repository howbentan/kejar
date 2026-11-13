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
    expect(screen.getByText('NOT PAID, WALK TO THE GATE')).toBeInTheDocument()
  })

  it('reads in plain English: entry ticket, gate, in at, distance to gate, keep this ticket, with no Malay echoes', () => {
    const { container } = render(
      <PenjaraTicket playerId="r1" variant={{ kind: 'catch', caughtBy: 'Ben', caughtAtMs: null }} distanceM={null} outForGood={false} settled={false} />,
    )
    for (const text of ['kejar. plaza tol', 'ENTRY TICKET', 'GATE', 'PENJARA', 'IN AT', 'DISTANCE TO GATE', 'STATUS', '*** KEEP THIS TICKET TO EXIT ***']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(container.querySelector('.toll-ticket-echo')).toBeNull()
    expect(container.textContent).not.toMatch(/TIKET|MASUK|GERBANG|JARAK|SIMPAN|BELUM|entry ticket|keep this ticket to exit/)
  })

  it('shows a dash before a GPS fix, not a blank or broken field', () => {
    render(<PenjaraTicket playerId="r1" variant={{ kind: 'catch', caughtBy: 'Ben', caughtAtMs: null }} distanceM={null} outForGood={false} settled={false} />)
    expect(screen.getAllByText('-')).toHaveLength(2)
  })

  it('auto-jail status reads differently from a chaser catch', () => {
    render(<PenjaraTicket playerId="r1" variant={{ kind: 'auto', lastSeenMs: null }} distanceM={null} outForGood={false} settled={false} />)
    expect(screen.getByText('SESSION TIMED OUT')).toBeInTheDocument()
    expect(screen.getByText('*** PHONE PROBLEM? ASK A MARSHAL ***')).toBeInTheDocument()
  })

  it('a player jailed for good gets a terminal status, not a false "walk to the gate"', () => {
    render(<PenjaraTicket playerId="r1" variant={{ kind: 'catch', caughtBy: 'Ben', caughtAtMs: null }} distanceM={null} outForGood={true} settled={false} />)
    expect(screen.getByText('NO EXIT THIS ROUND')).toBeInTheDocument()
    expect(screen.queryByText('NOT PAID, WALK TO THE GATE')).toBeNull()
  })

  it('shows the SETTLE stamp and flips STATUS to FREE once settled', () => {
    render(<PenjaraTicket playerId="r1" variant={{ kind: 'catch', caughtBy: 'Ben', caughtAtMs: null }} distanceM={null} outForGood={false} settled={true} />)
    expect(screen.getByText('SETTLE')).toBeInTheDocument()
    expect(screen.getByText('FREE')).toBeInTheDocument()
  })

  it('picks the same ticket number for the same player every time, not a new one per render', () => {
    const { unmount } = render(<PenjaraTicket playerId="same-id" variant={{ kind: 'auto', lastSeenMs: null }} distanceM={null} outForGood={false} settled={false} />)
    const first = screen.getByText(/^\d+$/).textContent
    unmount()
    render(<PenjaraTicket playerId="same-id" variant={{ kind: 'auto', lastSeenMs: null }} distanceM={null} outForGood={false} settled={false} />)
    expect(screen.getByText(/^\d+$/).textContent).toBe(first)
  })
  it('Mak Kau Hijau and bail-revoked tickets say why, and show when they went in instead of a last check-in', () => {
    const { unmount } = render(<PenjaraTicket playerId="r1" variant={{ kind: 'hijau', caughtAtMs: null }} distanceM={120} outForGood={false} settled={false} />)
    expect(screen.getByText("DIDN'T TOUCH GREEN")).toBeInTheDocument()
    expect(screen.getByText('IN AT')).toBeInTheDocument()
    expect(screen.getByText('120 M')).toBeInTheDocument()
    expect(screen.queryByText('LAST SEEN')).toBeNull()
    expect(screen.queryByText('SESSION TIMED OUT')).toBeNull()
    unmount()
    render(<PenjaraTicket playerId="r1" variant={{ kind: 'bail-revoked', caughtAtMs: null }} distanceM={null} outForGood={false} settled={false} />)
    expect(screen.getByText('LEFT HOUSE ARREST')).toBeInTheDocument()
    expect(screen.queryByText('SESSION TIMED OUT')).toBeNull()
  })
})
