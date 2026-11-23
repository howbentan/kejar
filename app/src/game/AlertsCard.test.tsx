import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ support: 'needs-install' as string }))
vi.mock('./push', () => ({
  currentPushEnv: () => ({}),
  pushSupport: () => env.support,
  subscribe: async () => ({}),
  NotificationsDeniedError: class extends Error {},
}))
vi.mock('./api', () => ({ call: vi.fn() }))

import AlertsCard from './AlertsCard'
import { testView } from '../screens/testView'

afterEach(cleanup)

describe('AlertsCard', () => {
  it('in Safari on an iPhone, shows how to add kejar. to the Home Screen so alerts can reach it', () => {
    const view = testView()
    render(<AlertsCard code="ABC234" view={{ ...view, settings: { ...view.settings, checkinMode: 'push' }, me: { ...view.me, push: null } }} />)
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(steps).toEqual(['Tap Share', 'Add to Home Screen', 'Open kejar. from the icon', 'Tap Turn on'])
  })
})
