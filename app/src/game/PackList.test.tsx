import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { View } from '../../shared/views.js'

const call = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ call }))

import PackList from './PackList'

const items = (ticked: string[] = []) =>
  [
    { id: 'armbands', group: 'pack', label: 'Armbands #01–#40' },
    { id: 'vests-kejar', group: 'pack', label: '4 lime vests' },
    { id: 'tupperware', group: 'pack', label: '1 red Tupperware, 1 Dikejar slip', tone: 'red', note: '(secret)' },
    { id: 'walk', group: 'day', label: 'Walk the park' },
    { id: 'brief-helper', group: 'day', label: 'Brief your helper', note: 'Penjara, dares, SOS' },
  ].map((i) => ({ ...i, ticked: ticked.includes(i.id) }))

const view = (ticked: string[] = []) => ({ kit: { items: items(ticked), places: [], placed: {} } }) as unknown as View

const assign = vi.fn()
const refresh = vi.fn()

function at(search: string) {
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, origin: 'https://kejar.test', search, assign } })
}

beforeEach(() => {
  assign.mockReset()
  refresh.mockReset()
  call.mockReset()
  call.mockResolvedValue({ ok: true })
  localStorage.setItem('kejar.organiser', JSON.stringify({ organiserToken: 'h1', name: 'Owner' }))
  at('?setup=pack')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('PackList', () => {
  it('shows the heading, the two groups and the items', () => {
    render(<PackList code="ABC234" view={view()} refresh={refresh} />)
    expect(screen.getByRole('heading', { name: 'Pack.' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Step 5 of 5' })).toBeInTheDocument()
    expect(screen.getByText('From your printed kit. Nothing to print today.')).toBeInTheDocument()
    expect(screen.getByText('PACK')).toBeInTheDocument()
    expect(screen.getByText('ON THE DAY')).toBeInTheDocument()
    expect(screen.getByText('Armbands #01–#40')).toBeInTheDocument()
    expect(screen.getByText('Penjara, dares, SOS')).toBeInTheDocument()
  })

  it('shows the Tupperware line in red with its note', () => {
    render(<PackList code="ABC234" view={view()} refresh={refresh} />)
    expect(screen.getByText('1 red Tupperware, 1 Dikejar slip').style.color).toBe('rgb(230, 57, 70)')
    expect(screen.getByText('(secret)')).toBeInTheDocument()
  })

  it('tapping an item saves the tick, draws the marker and strikes the text through', async () => {
    render(<PackList code="ABC234" view={view()} refresh={refresh} />)
    expect(document.querySelector('.marker')).toBeNull()
    fireEvent.click(screen.getByText('4 lime vests'))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setKit', { code: 'ABC234', organiserToken: 'h1', tick: { id: 'vests-kejar', on: true } }),
    )
    expect(document.querySelectorAll('.marker')).toHaveLength(1)
    expect(screen.getByText('4 lime vests').closest('[data-done]')).toHaveStyle({ textDecoration: 'line-through' })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('tapping a ticked item unticks it', async () => {
    render(<PackList code="ABC234" view={view(['armbands'])} refresh={refresh} />)
    fireEvent.click(screen.getByText('Armbands #01–#40'))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('setKit', { code: 'ABC234', organiserToken: 'h1', tick: { id: 'armbands', on: false } }),
    )
    expect(document.querySelectorAll('.marker')).toHaveLength(0)
  })

  it('circles Ready for event day once everything is ticked', () => {
    const { rerender } = render(<PackList code="ABC234" view={view(['armbands'])} refresh={refresh} />)
    expect(screen.queryByText('Ready for event day')).toBeNull()
    rerender(<PackList code="ABC234" view={view(['armbands', 'vests-kejar', 'tupperware', 'walk', 'brief-helper'])} refresh={refresh} />)
    expect(screen.getByText('Ready for event day')).toBeInTheDocument()
  })

  it('Walk the park shows OPEN, which goes to the walk', () => {
    render(<PackList code="ABC234" view={view()} refresh={refresh} />)
    const open = screen.getByRole('link', { name: 'OPEN' })
    expect(open.getAttribute('href')).toBe('/host/ABC234/walk')
    open.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(open)
    expect(call).not.toHaveBeenCalled()
  })

  it('Go to the lobby drops the setup', () => {
    render(<PackList code="ABC234" view={view()} refresh={refresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Go to the lobby' }))
    expect(assign).toHaveBeenCalledWith('/host/ABC234')
  })

  it('Back returns to step 4, the crew', () => {
    render(<PackList code="ABC234" view={view()} refresh={refresh} />)
    expect(screen.getByRole('button', { name: 'Back' })).toHaveTextContent('‹')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(assign).toHaveBeenCalledWith('/host/ABC234?setup=crew')
  })

  it('the lobby view (compact) has no Back', () => {
    render(<PackList code="ABC234" view={view()} refresh={refresh} compact />)
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('never says to reprint a card, whatever an old notice param says (the colour cards are retired)', () => {
    at('?setup=pack&notice=dato,bomoh')
    render(<PackList code="ABC234" view={view()} refresh={refresh} />)
    expect(screen.queryByText(/Reprint/)).toBeNull()
  })

  it('draws a lime tick on the Tupperware line', () => {
    render(<PackList code="ABC234" view={view(['tupperware'])} refresh={refresh} />)
    expect(document.querySelector('.marker path')?.getAttribute('stroke')).toBe('#C6FF3D')
  })

  it('Walk the park cannot be tapped; it ticks itself', () => {
    render(<PackList code="ABC234" view={view()} refresh={refresh} />)
    fireEvent.click(screen.getByText('Walk the park'))
    expect(call).not.toHaveBeenCalled()
  })

  it('a tap does not hide a later change from the server', async () => {
    const { rerender } = render(<PackList code="ABC234" view={view()} refresh={refresh} />)
    fireEvent.click(screen.getByText('4 lime vests'))
    await waitFor(() => expect(call).toHaveBeenCalled())
    rerender(<PackList code="ABC234" view={view(['vests-kejar'])} refresh={refresh} />)
    rerender(<PackList code="ABC234" view={view([])} refresh={refresh} />)
    expect(document.querySelectorAll('.marker')).toHaveLength(0)
  })
})
