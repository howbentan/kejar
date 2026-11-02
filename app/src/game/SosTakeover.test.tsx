import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from '../../shared/alerts.js'
import type { Arena } from '../../shared/types.js'

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

const arena: Arena = {
  id: 'a',
  name: 'Park',
  boundary: [
    { lat: 2.99, lng: 100.99 },
    { lat: 3.01, lng: 100.99 },
    { lat: 3.01, lng: 101.01 },
  ],
  jail: { lat: 3, lng: 101 },
  start: { lat: 3, lng: 101 },
}

/** Pending until `resolve`/`reject` is called, like a call over poor signal in a park. */
function deferred() {
  let resolve!: () => void
  let reject!: (e: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderTakeover(over: Partial<ComponentProps<typeof SosTakeover>> = {}) {
  return render(
    <SosTakeover
      alert={baseAlert}
      arena={arena}
      myPos={null}
      senderPos={null}
      onRespond={vi.fn(async () => {})}
      onClose={vi.fn(async () => {})}
      onDismiss={vi.fn()}
      {...over}
    />,
  )
}

describe('SosTakeover', () => {
  it("shows the sender, what's happening, and the arrow-and-distance readout", () => {
    renderTakeover({ alert: { ...baseAlert, text: 'SOS from Aina #07: Catch dispute' }, myPos: { lat: 3, lng: 101 }, senderPos: { lat: 3.001, lng: 101 } })
    expect(screen.getByText('sos')).toBeInTheDocument()
    expect(screen.getByText(/Aina #07/)).toBeInTheDocument()
    expect(screen.getByText(/Catch dispute/)).toBeInTheDocument()
    expect(screen.getByText(/M$/)).toBeInTheDocument() // the distance readout, e.g. "111 M"
  })

  it("draws the game's real arena (stable across polls, so the map isn't rebuilt) framed to fit both the marshal and the sender", () => {
    const myPos = { lat: 3, lng: 101 }
    const senderPos = { lat: 3.008, lng: 101.004 }
    const { rerender } = renderTakeover({ myPos, senderPos })
    const first = mapCalls[0] as { arena: Arena; fit: unknown; showJailAndStart?: boolean }
    expect(first.arena).toBe(arena)
    expect(first.fit).toEqual([myPos, senderPos])
    // The marshal walks closer: the arena handed to the map is still the same one, only the framing moves.
    const closer = { lat: 3.004, lng: 101.002 }
    rerender(
      <SosTakeover alert={baseAlert} arena={arena} myPos={closer} senderPos={senderPos} onRespond={vi.fn()} onClose={vi.fn()} onDismiss={vi.fn()} />,
    )
    const last = mapCalls.at(-1) as { arena: Arena; fit: unknown }
    expect(JSON.stringify(last.arena)).toBe(JSON.stringify(first.arena))
    expect(last.fit).toEqual([closer, senderPos])
  })

  it('shows the waiting copy until the alert carries a reason', () => {
    renderTakeover({ alert: { ...baseAlert, text: 'SOS from Aina #07' } })
    expect(screen.getByText(/Waiting for Aina #07 to say/)).toBeInTheDocument()
  })

  it('renders no map section when either position is unknown (the rare multi-SOS case)', () => {
    renderTakeover()
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it("shows who's responding, or that nobody is yet", () => {
    const { rerender } = renderTakeover({ alert: { ...baseAlert, respondingName: null } })
    expect(screen.getByText(/nobody.*going yet/i)).toBeInTheDocument()
    rerender(
      <SosTakeover
        alert={{ ...baseAlert, respondingName: 'Hafiz' }}
        arena={arena}
        myPos={null}
        senderPos={null}
        onRespond={vi.fn()}
        onClose={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText(/hafiz is going/i)).toBeInTheDocument()
  })

  it('"See the map first" steps out of the takeover without sending anything', () => {
    const onDismiss = vi.fn()
    const onRespond = vi.fn(async () => {})
    const onClose = vi.fn(async () => {})
    renderTakeover({ onDismiss, onRespond, onClose })
    fireEvent.click(screen.getByRole('button', { name: /see the map first/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onRespond).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a second marshal tapping "I\'m going" after the first must still work (not disabled by someone else going)', async () => {
    const onRespond = vi.fn(async () => {})
    renderTakeover({ alert: { ...baseAlert, respondingName: 'Hafiz' }, onRespond })
    const going = screen.getByRole('button', { name: /i'm going/i })
    expect(going).toBeEnabled()
    fireEvent.click(going)
    await waitFor(() => expect(going).toBeEnabled())
    fireEvent.click(going)
    await waitFor(() => expect(onRespond).toHaveBeenCalledTimes(2))
  })

  it('a double tap on "I\'m going" while the first is still in flight sends it once', async () => {
    const pending = deferred()
    const onRespond = vi.fn(() => pending.promise)
    renderTakeover({ onRespond })
    const going = screen.getByRole('button', { name: /i'm going/i })
    fireEvent.click(going)
    fireEvent.click(going)
    expect(onRespond).toHaveBeenCalledTimes(1)
    expect(going).toBeDisabled()
    pending.resolve()
    await waitFor(() => expect(going).toBeEnabled())
  })

  it('closing requires an outcome first', () => {
    const onClose = vi.fn(async () => {})
    renderTakeover({ onClose })
    expect(screen.getByRole('button', { name: /close sos/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /sorted, all good/i }))
    fireEvent.click(screen.getByRole('button', { name: /close sos/i }))
    expect(onClose).toHaveBeenCalledWith('sorted')
  })

  it('a double tap on Close SOS while the first is still in flight sends it once', () => {
    const pending = deferred()
    const onClose = vi.fn(() => pending.promise)
    renderTakeover({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /first aid given/i }))
    const close = screen.getByRole('button', { name: /close sos/i })
    fireEvent.click(close)
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(close).toBeDisabled()
  })

  it('a failed call says so, and the marshal can try again', async () => {
    const onClose = vi.fn().mockRejectedValueOnce(new Error('Network down')).mockResolvedValueOnce(undefined)
    renderTakeover({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /false alarm/i }))
    fireEvent.click(screen.getByRole('button', { name: /close sos/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    const close = screen.getByRole('button', { name: /close sos/i })
    expect(close).toBeEnabled()
    fireEvent.click(close)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('a failed "I\'m going" says so too', async () => {
    renderTakeover({ onRespond: vi.fn().mockRejectedValue(new Error('Not in this game')) })
    fireEvent.click(screen.getByRole('button', { name: /i'm going/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not in this game')
  })
})
