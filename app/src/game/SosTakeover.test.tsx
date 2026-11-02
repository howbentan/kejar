import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from '../../shared/alerts.js'

const mapCalls = vi.hoisted(() => [] as unknown[])
vi.mock('./Map', () => ({
  default: (props: unknown) => {
    mapCalls.push(props)
    return <div data-testid="map" />
  },
}))
import SosTakeover from './SosTakeover'

afterEach(() => {
  cleanup()
  mapCalls.length = 0
})

const baseAlert: Alert = {
  id: 'e1',
  at: new Date(Date.now() - 65_000).toISOString(),
  kind: 'sos',
  text: 'SOS from Aina #07',
  where: null,
  targetId: null,
  handled: false,
  respondingName: null,
  outcome: null,
  closedByName: null,
}

describe('SosTakeover', () => {
  it("shows the sender, what's happening, and the arrow-and-distance readout", () => {
    render(
      <SosTakeover
        alert={{ ...baseAlert, text: 'SOS from Aina #07: Catch dispute' }}
        myPos={{ lat: 3, lng: 101 }}
        senderPos={{ lat: 3.001, lng: 101 }}
        onRespond={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('sos')).toBeInTheDocument()
    expect(screen.getByText(/Aina #07/)).toBeInTheDocument()
    expect(screen.getByText(/Catch dispute/)).toBeInTheDocument()
    expect(screen.getByText(/M$/)).toBeInTheDocument() // the distance readout, e.g. "111 M"
  })

  it("tells GameMap not to draw jail/start labels on its scoped-down stub arena (they'd float on the sender's/marshal's own dot)", () => {
    render(
      <SosTakeover
        alert={baseAlert}
        myPos={{ lat: 3, lng: 101 }}
        senderPos={{ lat: 3.001, lng: 101 }}
        onRespond={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(mapCalls).toHaveLength(1)
    expect((mapCalls[0] as { showJailAndStart?: boolean }).showJailAndStart).toBe(false)
  })

  it('shows the waiting copy until the alert carries a reason', () => {
    render(
      <SosTakeover
        alert={{ ...baseAlert, text: 'SOS from Aina #07' }}
        myPos={null}
        senderPos={null}
        onRespond={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Waiting for Aina #07 to say/)).toBeInTheDocument()
  })

  it('renders no map section when either position is unknown (the rare multi-SOS case)', () => {
    render(<SosTakeover alert={baseAlert} myPos={null} senderPos={null} onRespond={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it("shows who's responding, or that nobody is yet", () => {
    const { rerender } = render(
      <SosTakeover alert={{ ...baseAlert, respondingName: null }} myPos={null} senderPos={null} onRespond={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText(/nobody.*going yet/i)).toBeInTheDocument()
    rerender(
      <SosTakeover alert={{ ...baseAlert, respondingName: 'Hafiz' }} myPos={null} senderPos={null} onRespond={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText(/hafiz is going/i)).toBeInTheDocument()
  })

  it('a second marshal tapping "I\'m going" after the first must still work (no disabling)', () => {
    const onRespond = vi.fn()
    render(<SosTakeover alert={{ ...baseAlert, respondingName: 'Hafiz' }} myPos={null} senderPos={null} onRespond={onRespond} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /i'm going/i }))
    fireEvent.click(screen.getByRole('button', { name: /i'm going/i }))
    expect(onRespond).toHaveBeenCalledTimes(2)
  })

  it('closing requires an outcome first', () => {
    const onClose = vi.fn()
    render(<SosTakeover alert={baseAlert} myPos={null} senderPos={null} onRespond={vi.fn()} onClose={onClose} />)
    expect(screen.getByRole('button', { name: /close sos/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /sorted, all good/i }))
    fireEvent.click(screen.getByRole('button', { name: /close sos/i }))
    expect(onClose).toHaveBeenCalledWith('sorted')
  })
})
