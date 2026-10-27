import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

import MarshalRedeem from './MarshalRedeem'

beforeEach(() => {
  call.mockReset()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
  localStorage.clear()
})
afterEach(cleanup)

describe('MarshalRedeem', () => {
  it('redeems the invite with a typed name and goes into the game', async () => {
    call.mockResolvedValue({ token: 'pt1', playerId: 'p1' })
    render(<MarshalRedeem code="ABC234" token="tok1" />)
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Siti' } })
    fireEvent.click(screen.getByRole('button', { name: /join as marshal/i }))
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith('redeemMarshalInvite', { code: 'ABC234', inviteToken: 'tok1', name: 'Siti' }),
    )
    await waitFor(() => expect(JSON.parse(localStorage.getItem('kejar.game.ABC234')!)).toEqual({ token: 'pt1' }))
    expect(window.location.assign).toHaveBeenCalledWith('/g/ABC234')
  })
})
