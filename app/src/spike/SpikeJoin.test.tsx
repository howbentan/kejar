import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({
  current: {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
    standalone: false,
    hasPushManager: false,
    permission: 'default' as NotificationPermission,
  },
}))

vi.mock('./push', async (importOriginal) => {
  const real = await importOriginal<typeof import('./push')>()
  return { ...real, currentPushEnv: () => env.current }
})

import SpikeJoin from './SpikeJoin'

afterEach(() => window.history.pushState({}, '', '/'))

describe('SpikeJoin', () => {
  it('tells an iPhone user to add Kejar to the home screen instead of offering alerts', () => {
    window.history.pushState({}, '', '/spike')
    render(<SpikeJoin />)
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn on alerts/i })).toBeNull()
  })

  it('explains how to re-enable notifications when they are blocked', () => {
    env.current = { ...env.current, ua: 'Mozilla/5.0 (Linux; Android 14)', hasPushManager: true, permission: 'denied' }
    window.history.pushState({}, '', '/spike')
    render(<SpikeJoin />)
    expect(screen.getByText(/notifications are blocked/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn on alerts/i })).toBeNull()
  })

  it('offers to turn on alerts when push is supported', () => {
    env.current = { ...env.current, ua: 'Mozilla/5.0 (Linux; Android 14)', hasPushManager: true, permission: 'default' }
    window.history.pushState({}, '', '/spike')
    render(<SpikeJoin />)
    expect(screen.getByRole('button', { name: /turn on alerts/i })).toBeInTheDocument()
  })
})
