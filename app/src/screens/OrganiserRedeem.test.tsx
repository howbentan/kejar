import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))

import OrganiserRedeem from './OrganiserRedeem'

beforeEach(() => {
  call.mockReset()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
  localStorage.clear()
})
afterEach(cleanup)

describe('OrganiserRedeem', () => {
  it('redeems the invite, saves the session, and goes to create a game', async () => {
    call.mockResolvedValue({ organiserToken: 'ot1', name: 'Partner' })
    render(<OrganiserRedeem token="tok1" />)
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(call).toHaveBeenCalledWith('redeemOrganiserInvite', { inviteToken: 'tok1' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('kejar.organiser')!)).toEqual({ organiserToken: 'ot1', name: 'Partner' }))
    expect(window.location.assign).toHaveBeenCalledWith('/host/new')
  })

  it('shows the server error on a used or expired link', async () => {
    call.mockRejectedValue(new Error('That invite link has already been used'))
    render(<OrganiserRedeem token="tok1" />)
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('That invite link has already been used')).toBeInTheDocument()
  })
})
