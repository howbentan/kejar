import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jailbreakText, rescueFailedText, type FeedItem } from '../../../shared/views.js'
import { testView } from '../../screens/testView'

const sounds = vi.hoisted(() => ({ playKeyClick: vi.fn(), playKeyUnlock: vi.fn(), playKeyLetGo: vi.fn(), playRescueReset: vi.fn() }))
vi.mock('../sounds', () => sounds)
import RescueEnd, { rescueEndingFrom, type RescueEnding, type RescueWatched } from './RescueEnd'

beforeEach(() => Object.values(sounds).forEach((f) => f.mockReset()))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const line = (text: string, at = 100_500): FeedItem => ({ at: new Date(at).toISOString(), text, means: null, act: false, label: 'RESCUE' })
const watched = (over: Partial<RescueWatched> = {}): RescueWatched => ({ by: 'r3', byName: 'Hafiz', rescuer: false, heldMs: 9_000, seenAt: 100_000, ...over })
const after = (feed: FeedItem[], me: Partial<ReturnType<typeof testView>['me']> = {}) => {
  const v = testView({ feed })
  return { ...v, me: { ...v.me, ...me } }
}

describe('rescueEndingFrom: how the watched rescue ended, read from the feed', () => {
  it('a jailbreak line: freed, with how many', () => {
    expect(rescueEndingFrom(watched(), after([line(jailbreakText(2))]))).toMatchObject({ kind: 'freed', freed: 2, rescuer: false, meFree: true })
  })

  it('each failed reason, by the rescuer it names', () => {
    for (const reason of ['caught', 'left', 'removed', 'locked'] as const) {
      expect(rescueEndingFrom(watched(), after([line(rescueFailedText(reason, 'Hafiz'))]))).toMatchObject({ kind: 'failed', reason, who: 'Hafiz' })
    }
  })

  it('the reset line: reset', () => {
    expect(rescueEndingFrom(watched(), after([line(rescueFailedText('reset', 'Hafiz'))]))).toMatchObject({ kind: 'reset' })
  })

  it('takes the newest line, and ignores lines from before the rescue was last seen', () => {
    const feed = [line(jailbreakText(1), 101_000), line(rescueFailedText('reset', 'Hafiz'), 100_200)]
    expect(rescueEndingFrom(watched(), after(feed))).toMatchObject({ kind: 'freed' })
    expect(rescueEndingFrom(watched({ seenAt: 200_000 }), after(feed))).toBeNull()
  })

  it('another rescuer’s failure is not this one', () => {
    expect(rescueEndingFrom(watched(), after([line(rescueFailedText('caught', 'Wei'))]))).toBeNull()
  })

  it('a rescuer who was caught gets the Penjara screen, not this', () => {
    expect(rescueEndingFrom(watched({ rescuer: true, byName: 'Aina' }), after([line(rescueFailedText('caught', 'Aina'))], { jailed: true }))).toBeNull()
  })
})

const ending = (e: Partial<RescueEnding> & Pick<RescueEnding, 'kind'>) => ({ at: '2026-11-17T10:00:00.000Z', rescuer: false, heldMs: 9_000, ...e }) as RescueEnding

describe('RescueEnd', () => {
  it('freed, for the rescuer: LEPAS!, how many and their head start', () => {
    render(<RescueEnd ending={ending({ kind: 'freed', freed: 2, rescuer: true, meFree: true })} onDone={() => {}} />)
    expect(screen.getByText('LEPAS!')).toBeInTheDocument()
    expect(screen.getByText('2 freed.')).toBeInTheDocument()
    expect(screen.getByText('They have a 10 s head start. Now you run too.')).toBeInTheDocument()
  })

  it('freed, for a runner it freed: their own head start', () => {
    render(<RescueEnd ending={ending({ kind: 'freed', freed: 2, meFree: true })} onDone={() => {}} />)
    expect(screen.getByText("You're free.")).toBeInTheDocument()
    expect(screen.getByText('Run. 10 s head start: nobody can catch you yet.')).toBeInTheDocument()
  })

  it('failed: the reason and that nobody gets out', () => {
    render(<RescueEnd ending={ending({ kind: 'failed', reason: 'caught', who: 'Hafiz' })} onDone={() => {}} />)
    expect(screen.getByText('RESCUE FAILED')).toBeInTheDocument()
    expect(screen.getByText('Hafiz was caught.')).toBeInTheDocument()
    expect(screen.getByText('Nobody gets out this time. Another Dikejar can try.')).toBeInTheDocument()
    cleanup()
    render(<RescueEnd ending={ending({ kind: 'failed', reason: 'left', who: 'Hafiz' })} onDone={() => {}} />)
    expect(screen.getByText('Hafiz walked away.')).toBeInTheDocument()
  })

  it('reset: Rescue reset.', () => {
    render(<RescueEnd ending={ending({ kind: 'reset' })} onDone={() => {}} />)
    expect(screen.getByText('Rescue reset.')).toBeInTheDocument()
  })

  it("the rescuer's phone plays the unlock or the spin-back; nobody else's does", async () => {
    vi.useFakeTimers()
    render(<RescueEnd ending={ending({ kind: 'freed', freed: 1, rescuer: true, meFree: true })} onDone={() => {}} />)
    await act(async () => vi.advanceTimersByTime(300))
    expect(sounds.playKeyUnlock).toHaveBeenCalledTimes(1)
    cleanup()
    render(<RescueEnd ending={ending({ kind: 'reset', rescuer: true })} onDone={() => {}} />)
    await act(async () => vi.advanceTimersByTime(300))
    expect(sounds.playRescueReset).toHaveBeenCalledTimes(1)
    cleanup()
    render(<RescueEnd ending={ending({ kind: 'freed', freed: 1, meFree: true })} onDone={() => {}} />)
    await act(async () => vi.advanceTimersByTime(300))
    expect(sounds.playKeyUnlock).toHaveBeenCalledTimes(1)
  })

  it('goes on its own after a few seconds, or on a tap', async () => {
    vi.useFakeTimers()
    const done = vi.fn()
    render(<RescueEnd ending={ending({ kind: 'reset' })} onDone={done} />)
    await act(async () => vi.advanceTimersByTime(5_000))
    expect(done).toHaveBeenCalledTimes(1)
    cleanup()
    const tapped = vi.fn()
    render(<RescueEnd ending={ending({ kind: 'reset' })} onDone={tapped} />)
    fireEvent.click(screen.getByRole('status'))
    expect(tapped).toHaveBeenCalled()
  })
})
