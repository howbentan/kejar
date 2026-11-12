import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
vi.mock('../game/api', () => ({ call, ApiError: class extends Error {} }))
const env = vi.hoisted(() => ({
  current: { ua: 'Mozilla/5.0 (Linux; Android 14)', standalone: false, hasPushManager: true, permission: 'default' as NotificationPermission },
}))
vi.mock('../game/push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../game/push')>()),
  currentPushEnv: () => env.current,
}))
import Join from './Join'

beforeEach(() => {
  call.mockReset()
  localStorage.clear()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
})
afterEach(cleanup)

describe('Join', () => {
  it('keeps the button disabled until both checkboxes are ticked', () => {
    render(<Join code="ABC234" />)
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Aina' } })
    const button = screen.getByRole('button', { name: /join game/i })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/no grabbing/i))
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/waiver/i))
    expect(button).toBeEnabled()
  })

  it('tells iPhone Safari users to add Kejar to the Home Screen before joining', () => {
    env.current = { ...env.current, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile Safari/604.1' }
    render(<Join code="ABC234" />)
    expect(screen.getByText(/add to home screen first/i)).toBeInTheDocument()
    expect(screen.getByText(/code ABC234/i)).toBeInTheDocument()
  })

  it('prefills the name from the last game and says so', () => {
    localStorage.setItem('kejar.name', 'Aina')
    render(<Join code="ABC234" />)
    expect(screen.getByLabelText(/your name/i)).toHaveValue('Aina')
    expect(screen.getByText('✓ remembered from your last game')).toBeInTheDocument()
  })

  it('not you? clears the name and forgets it', () => {
    localStorage.setItem('kejar.name', 'Aina')
    render(<Join code="ABC234" />)
    fireEvent.click(screen.getByRole('button', { name: 'not you?' }))
    expect(screen.getByLabelText(/your name/i)).toHaveValue('')
    expect(localStorage.getItem('kejar.name')).toBeNull()
    expect(screen.queryByText('✓ remembered from your last game')).toBeNull()
  })

  it('a successful join remembers the name, and the agreements still start unticked', async () => {
    call.mockResolvedValue({ token: 't' })
    render(<Join code="ABC234" />)
    expect(screen.getByLabelText(/no grabbing/i)).not.toBeChecked()
    expect(screen.getByLabelText(/waiver/i)).not.toBeChecked()
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Zara' } })
    fireEvent.click(screen.getByLabelText(/no grabbing/i))
    fireEvent.click(screen.getByLabelText(/waiver/i))
    fireEvent.click(screen.getByRole('button', { name: /join game/i }))
    await waitFor(() => expect(localStorage.getItem('kejar.name')).toBe('Zara'))
  })
})
