import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../game/api', () => ({ call: vi.fn(), ApiError: class extends Error {} }))
const env = vi.hoisted(() => ({
  current: { ua: 'Mozilla/5.0 (Linux; Android 14)', standalone: false, hasPushManager: true, permission: 'default' as NotificationPermission },
}))
vi.mock('../spike/push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../spike/push')>()),
  currentPushEnv: () => env.current,
}))
import Join from './Join'

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
})
