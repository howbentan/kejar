import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
const reduce = vi.hoisted(() => ({ on: true }))
vi.mock('./api', () => ({ call, ApiError: class extends Error {} }))
vi.mock('./here', () => ({ currentCoords: async () => ({ lat: 3, lng: 101, accuracy_m: 5 }) }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))
import PenjaraReel, { SPIN_MS } from './PenjaraReel'

const audio = vi.hoisted(() => ({ made: [] as { src: string; play: ReturnType<typeof vi.fn> }[] }))

beforeEach(() => {
  call.mockReset()
  reduce.on = true
  audio.made = []
  localStorage.clear()
  localStorage.setItem('kejar.game.ABC234', JSON.stringify({ token: 't1' }))
  vi.stubGlobal(
    'Audio',
    class {
      src: string
      play = vi.fn(() => Promise.resolve())
      constructor(src: string) {
        this.src = src
        audio.made.push(this)
      }
    },
  )
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const reel = (over: Partial<Parameters<typeof PenjaraReel>[0]> = {}) =>
  render(<PenjaraReel code="ABC234" freedOnce={false} reel={{ pulled: false, result: null }} {...over} />)
const pull = async () => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pull the lever' })))
}

describe('PenjaraReel', () => {
  it('shows the copy and ten cards: nine black ones with words, and the lime one SETTLED with the settle doodle', () => {
    reel()
    expect(screen.getByText('PENJARA')).toBeInTheDocument()
    expect(screen.getByText('Your pull.')).toBeInTheDocument()
    expect(screen.getByText('One pull. One slot sets you free.')).toBeInTheDocument()
    const cards = screen.getAllByTestId('reel-card')
    expect(cards).toHaveLength(10)
    const lime = cards.filter((c) => c.dataset.kind === 'lime')
    expect(lime).toHaveLength(1)
    expect(lime[0].textContent).toBe('SETTLED')
    expect(lime[0].querySelector('svg')).not.toBeNull()
    const words = cards.filter((c) => c.dataset.kind === 'black').map((c) => c.textContent)
    expect(words).toEqual(['HAILAT', 'ALMOST', 'NEARLY', 'ALAMAK', 'ADUH', 'NOPE', 'TRY LAH', 'HAMPIR', 'NEXT TIME'])
  })

  it('a runner whose escape is used sees ten black word cards', () => {
    reel({ freedOnce: true })
    const cards = screen.getAllByTestId('reel-card')
    expect(cards.every((c) => c.dataset.kind === 'black')).toBe(true)
    expect(cards.map((c) => c.textContent)).toEqual(['HAILAT', 'ALMOST', 'NEARLY', 'ALAMAK', 'ADUH', 'NOPE', 'TRY LAH', 'HAMPIR', 'NEXT TIME', 'HAILAT'])
  })

  it('before it opens, a countdown stands where the lever is; then the lever comes back', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'))
    reel({ reel: { pulled: false, result: null, opensAt: '2026-11-24T10:00:42Z' } })
    expect(screen.getByText('opens in 0:42')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pull the lever' })).toBeNull()
    for (let s = 0; s < 42; s++) {
      act(() => {
        vi.advanceTimersByTime(1_000)
      })
    }
    expect(screen.queryByText(/opens in/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Pull the lever' })).toBeInTheDocument()
  })

  it('a black result: calls pullReel, plays the clip, says wait, and spends the lever', async () => {
    call.mockResolvedValue({ ok: true, result: 'black' })
    reel()
    await pull()
    expect(call).toHaveBeenCalledWith('pullReel', { code: 'ABC234', token: 't1', lat: 3, lng: 101, accuracy_m: 5 })
    expect(screen.getByText('Not this time. Wait for a rescue.')).toBeInTheDocument()
    expect(audio.made.map((a) => a.src)).toEqual([expect.stringContaining('/sounds/black-slot.mp3')])
    expect(audio.made[0].play).toHaveBeenCalled()
    expect(screen.getByText('ONE PULL PER STAY')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pull the lever' })).toBeDisabled()
  })

  it('a free result says so and does not play the clip', async () => {
    call.mockResolvedValue({ ok: true, result: 'free' })
    reel()
    await pull()
    expect(screen.getByText("YOU'RE FREE")).toBeInTheDocument()
    expect(screen.getByText('Keluar penjara! Walk away from Penjara and hide. This uses your one escape.')).toBeInTheDocument()
    expect(audio.made).toEqual([])
  })

  it('with mute on, no sound plays', async () => {
    localStorage.setItem('kejar.muted', '1')
    call.mockResolvedValue({ ok: true, result: 'black' })
    reel()
    await pull()
    expect(screen.getByText('Not this time. Wait for a rescue.')).toBeInTheDocument()
    expect(audio.made).toEqual([])
  })

  it('the mute toggle is kept per viewer', () => {
    reel()
    fireEvent.click(screen.getByRole('button', { name: 'Sound on' }))
    expect(localStorage.getItem('kejar.muted')).toBe('1')
    expect(screen.getByRole('button', { name: 'Sound off' })).toBeInTheDocument()
  })

  it('a refusal says why and leaves the lever to try again', async () => {
    call.mockResolvedValue({ ok: false, reason: 'too-far-from-jail' })
    reel()
    await pull()
    expect(screen.getByText('Get within 30 m of Penjara')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pull the lever' })).not.toBeDisabled()
  })

  it('a reel already pulled this stay comes back spent, with the black message', () => {
    reel({ reel: { pulled: true, result: 'black' } })
    expect(screen.getByText('Not this time. Wait for a rescue.')).toBeInTheDocument()
    expect(screen.getByText('ONE PULL PER STAY')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pull the lever' })).toBeDisabled()
    expect(audio.made).toEqual([])
  })

  it('keeps the winning lime card when the next poll flips freedOnce to true', async () => {
    call.mockResolvedValue({ ok: true, result: 'free' })
    const props = { code: 'ABC234', reel: { pulled: false, result: null } }
    const { rerender } = render(<PenjaraReel {...props} freedOnce={false} />)
    await pull()
    rerender(<PenjaraReel {...props} freedOnce={true} />)
    expect(screen.getByText("YOU'RE FREE")).toBeInTheDocument()
    expect(screen.getAllByTestId('reel-card').filter((c) => c.dataset.kind === 'lime')).toHaveLength(1)
  })

  it('with motion, the result waits for the reel to stop', async () => {
    reduce.on = false
    vi.useFakeTimers()
    call.mockResolvedValue({ ok: true, result: 'black' })
    reel()
    await pull()
    expect(screen.queryByText('Not this time. Wait for a rescue.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pull the lever' })).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(SPIN_MS + 50)
    })
    expect(screen.getByText('Not this time. Wait for a rescue.')).toBeInTheDocument()
    expect(audio.made).toHaveLength(1)
  })
})
