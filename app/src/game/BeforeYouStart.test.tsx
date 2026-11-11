import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { View } from '../../shared/views.js'

const call = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ call }))

import BeforeYouStart from './BeforeYouStart'

const places = [
  { id: 'station-1', label: 'Station 1', lat: 0, lng: 0 },
  { id: 'penjara', label: 'Penjara', lat: 0, lng: 0 },
  { id: 'dato', label: 'Yellow card', lat: 0, lng: 0, tone: 'yellow' },
]

function make(over: { placed?: string[]; marshals?: { name: string; pushOn: boolean }[]; mePush?: boolean; briefing?: { started: boolean; ready: number; total: number } } = {}) {
  const placed = over.placed ?? []
  return {
    me: { id: 'host', name: 'Owner', push: over.mePush ?? true },
    roster: [
      { id: 'p1', name: 'Wei', role: 'runner', tag_id: null, jailed: false },
      ...(over.marshals ?? []).map((m, i) => ({ id: `m${i}`, name: m.name, role: 'marshal', tag_id: null, jailed: false, pushOn: m.pushOn })),
    ],
    briefing: { status: {}, ...(over.briefing ?? { started: false, ready: 0, total: 3 }) },
    kit: {
      items: [{ id: 'brief-players', group: 'day', label: 'Brief the players', ticked: over.briefing?.started ?? false }],
      places,
      placed: Object.fromEntries(placed.map((id) => [id, true])),
    },
  } as unknown as View
}

const refresh = vi.fn()

beforeEach(() => {
  call.mockReset()
  call.mockResolvedValue({ ok: true })
  refresh.mockReset()
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'h1', name: 'Owner' }))
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const row = (name: string) => screen.getByText(name).closest('[role="checkbox"]') as HTMLElement

describe('BeforeYouStart', () => {
  it('shows the heading, the warning line and the links', () => {
    render(<BeforeYouStart code="ABC234" view={make()} refresh={refresh} />)
    expect(screen.getByText('BEFORE YOU START')).toBeInTheDocument()
    expect(screen.getByText('Unticked items warn you, but never block Start.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kit list' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Walk the park' })).toHaveAttribute('href', '/host/ABC234/walk')
  })

  it('Kit placed ticks once every non-secret item is placed, with no names', () => {
    render(<BeforeYouStart code="ABC234" view={make({ placed: ['station-1', 'penjara'], marshals: [{ name: 'Aina', pushOn: true }] })} refresh={refresh} />)
    expect(row('Kit placed')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('2 of 2 placed')).toBeInTheDocument()
  })

  it('Kit placed stays unticked while something is left, and the secret card does not count', () => {
    render(<BeforeYouStart code="ABC234" view={make({ placed: ['station-1', 'dato'] })} refresh={refresh} />)
    expect(row('Kit placed')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('1 of 2 placed')).toBeInTheDocument()
  })

  it('Helper joined ticks with the marshal name once one is in the roster', () => {
    const { unmount } = render(<BeforeYouStart code="ABC234" view={make()} refresh={refresh} />)
    expect(row('Helper joined')).toHaveAttribute('aria-checked', 'false')
    unmount()
    render(<BeforeYouStart code="ABC234" view={make({ marshals: [{ name: 'Aina', pushOn: true }] })} refresh={refresh} />)
    expect(row('Helper joined')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Aina · Penjara')).toBeInTheDocument()
  })

  it('SOS alerts on ticks when the organiser and every marshal have push on', () => {
    render(<BeforeYouStart code="ABC234" view={make({ marshals: [{ name: 'Aina', pushOn: true }] })} refresh={refresh} />)
    expect(row('SOS alerts on')).toHaveAttribute('aria-checked', 'true')
  })

  it("SOS alerts on names the marshal who hasn't turned them on", () => {
    render(<BeforeYouStart code="ABC234" view={make({ marshals: [{ name: 'Aina', pushOn: false }] })} refresh={refresh} />)
    expect(row('SOS alerts on')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText("Aina hasn't turned them on")).toBeInTheDocument()
  })

  it("SOS alerts on names the organiser when this phone's push is off", () => {
    render(<BeforeYouStart code="ABC234" view={make({ mePush: false, marshals: [{ name: 'Aina', pushOn: true }] })} refresh={refresh} />)
    expect(row('SOS alerts on')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText("You haven't turned them on")).toBeInTheDocument()
  })

  it('Brief the players is a button that says it opens how to play on every phone', async () => {
    render(<BeforeYouStart code="ABC234" view={make()} refresh={refresh} />)
    expect(screen.getByText('Opens how to play on every phone')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Brief the players/ }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('startBriefing', { code: 'ABC234', organiserToken: 'h1' }))
    expect(call).not.toHaveBeenCalledWith('setKit', expect.anything())
    expect(refresh).toHaveBeenCalled()
  })

  it('once started it shows who is ready and counts as done', () => {
    render(<BeforeYouStart code="ABC234" view={make({ briefing: { started: true, ready: 1, total: 3 } })} refresh={refresh} />)
    expect(screen.getByText('1 of 3 ready')).toBeInTheDocument()
    expect(screen.queryByText('Opens how to play on every phone')).not.toBeInTheDocument()
    expect(screen.getByText('Brief the players').closest('[data-done]')).not.toBeNull()
  })

  it('Kit list opens the packing list inline', () => {
    render(<BeforeYouStart code="ABC234" view={make()} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kit list' }))
    expect(screen.getByText('ON THE DAY')).toBeInTheDocument()
  })
})
