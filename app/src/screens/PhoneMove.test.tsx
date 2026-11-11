import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

import PhoneMove from './PhoneMove'

beforeEach(() => {
  call.mockReset()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
  localStorage.clear()
})
afterEach(cleanup)

describe('PhoneMove', () => {
  it('redeems the link, saves the new session for that game and goes into the game', async () => {
    call.mockResolvedValue({ token: 'newtok', playerId: 'p1' })
    render(<PhoneMove code="ABC234" token="tok1" />)
    await waitFor(() => expect(call).toHaveBeenCalledWith('redeemPhoneMove', { code: 'ABC234', inviteToken: 'tok1' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('kejar.game.ABC234')!)).toEqual({ token: 'newtok' }))
    expect(window.location.assign).toHaveBeenCalledWith('/g/ABC234')
  })

  it("shows the server's message when the link is used or expired, and saves nothing", async () => {
    call.mockRejectedValue(new Error('That invite link has already been used'))
    render(<PhoneMove code="ABC234" token="tok1" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('That invite link has already been used')
    expect(localStorage.getItem('kejar.game.ABC234')).toBeNull()
    expect(window.location.assign).not.toHaveBeenCalled()
  })
})
