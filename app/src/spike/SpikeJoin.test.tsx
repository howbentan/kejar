import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const IPHONE_NOT_INSTALLED = {
  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
  standalone: false,
  hasPushManager: false,
  permission: 'default' as NotificationPermission,
}

const env = vi.hoisted(() => ({
  current: null as unknown as typeof IPHONE_NOT_INSTALLED,
  subscribe: null as null | ((key: string) => Promise<PushSubscriptionJSON>),
}))
env.current = IPHONE_NOT_INSTALLED

vi.mock('./push', async (importOriginal) => {
  const real = await importOriginal<typeof import('./push')>()
  return {
    ...real,
    currentPushEnv: () => env.current,
    subscribe: (key: string) => (env.subscribe ?? real.subscribe)(key),
  }
})

import { NotificationsDeniedError } from './push'
import SpikeJoin from './SpikeJoin'

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
  env.current = IPHONE_NOT_INSTALLED
  env.subscribe = null
})

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

  it('shows how to unblock notifications right after the user refuses them', async () => {
    env.current = { ...env.current, ua: 'Mozilla/5.0 (Linux; Android 14)', hasPushManager: true, permission: 'default' }
    env.subscribe = async () => {
      throw new NotificationsDeniedError()
    }
    window.history.pushState({}, '', '/spike')
    render(<SpikeJoin />)
    fireEvent.change(screen.getByLabelText(/name this phone/i), { target: { value: 'Aina Pixel' } })
    fireEvent.click(screen.getByRole('button', { name: /turn on alerts/i }))
    expect(await screen.findByText(/notifications are blocked/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn on alerts/i })).toBeNull()
  })

  it('offers to turn on alerts when push is supported', () => {
    env.current = { ...env.current, ua: 'Mozilla/5.0 (Linux; Android 14)', hasPushManager: true, permission: 'default' }
    window.history.pushState({}, '', '/spike')
    render(<SpikeJoin />)
    expect(screen.getByRole('button', { name: /turn on alerts/i })).toBeInTheDocument()
  })
})
