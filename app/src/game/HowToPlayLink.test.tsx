import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testView } from '../screens/testView'

vi.mock('./api', () => ({ call: vi.fn().mockResolvedValue({ ok: true }), ApiError: class extends Error {} }))
vi.mock('./Map', () => ({ default: () => null }))
vi.mock('./push', () => ({ subscribe: vi.fn(), pushSupport: () => 'unsupported', currentPushEnv: () => ({}), NotificationsDeniedError: class extends Error {} }))
vi.mock('./useWakeLock', () => ({ useWakeLock: vi.fn() }))

import RunnerChase from '../screens/RunnerChase'
import ChaserChase from '../screens/ChaserChase'
import Jail from '../screens/Jail'
import Hide from '../screens/Hide'
import HowToPlayLink from './HowToPlayLink'

afterEach(cleanup)

const runner = () => testView()
const chaser = () => {
  const v = testView()
  return { ...v, me: { ...v.me, role: 'chaser' as const } }
}
const jailed = () => {
  const v = testView()
  return { ...v, me: { ...v.me, jailed: true } }
}

const screens: [string, () => ReturnType<typeof render>][] = [
  ['runner chase', () => render(<RunnerChase code="ABC234" view={runner()} locationOff={false} />)],
  ['chaser chase', () => render(<ChaserChase code="ABC234" view={chaser()} refresh={vi.fn()} />)],
  ['jail', () => render(<Jail code="ABC234" view={jailed()} />)],
  ['auto-jail', () => render(<Jail code="ABC234" view={{ ...jailed(), jailReason: 'missed-checkins' as const }} />)],
  ['hide', () => render(<Hide code="ABC234" view={{ ...runner(), phase: 'hiding' }} />)],
]

describe('How to play link', () => {
  for (const [name, mount] of screens) {
    it(`sits in the ${name} layout, not fixed, and opens the story`, () => {
      mount()
      const link = screen.getByRole('button', { name: 'How to play' })
      expect(link.style.position).not.toBe('fixed')
      fireEvent.click(link)
      expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument()
    })
  }

  it('is absent for marshals', () => {
    const v = testView()
    render(<HowToPlayLink code="ABC234" view={{ ...v, me: { ...v.me, role: 'marshal' } }} />)
    expect(screen.queryByRole('button', { name: 'How to play' })).toBeNull()
  })
  it('renders the dialog through a portal on body, tappable even inside a pointer-events none ancestor', () => {
    const v = testView()
    const { container } = render(
      <div data-testid="wrap" style={{ pointerEvents: 'none' }}>
        <HowToPlayLink code="ABC234" view={v} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }))
    const dialog = screen.getByRole('dialog', { name: 'How to play' })
    expect(container.contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body)
    expect(dialog.style.pointerEvents).toBe('auto')
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
