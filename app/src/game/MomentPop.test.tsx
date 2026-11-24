import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { testView } from '../screens/testView'
import type { FeedItem } from '../../shared/views.js'
import Moments, { momentsIn } from './MomentPop'

afterEach(cleanup)
beforeEach(() => sessionStorage.clear())

const NOW = Date.parse('2026-11-24T10:00:00Z')
const item = (kind: string, extra: Partial<FeedItem> = {}): FeedItem => ({
  at: new Date(NOW - 1000).toISOString(),
  text: '',
  means: null,
  act: false,
  label: null,
  kind,
  ...extra,
})

describe('one-off moments (design 2026-11-24 §4)', () => {
  it('pops someone else’s catch with who it was, but not my own', () => {
    expect(momentsIn(testView({ now: NOW, feed: [item('caught', { who: '#07 Aina' })] })).map((c) => c.m.kind)).toEqual(['caught'])
    expect(momentsIn(testView({ now: NOW, feed: [item('caught', { mine: true })] }))).toEqual([])
    render(<Moments view={testView({ now: NOW, feed: [item('caught', { who: '#07 Aina' })] })} />)
    expect(screen.getByRole('status')).toHaveTextContent('#07 Aina dah kena kejar')
  })

  it('cracks Penjara open for a jailbreak', () => {
    render(<Moments view={testView({ now: NOW, feed: [item('jailbreak')] })} />)
    expect(screen.getByRole('status')).toHaveTextContent('krak!')
  })

  it('calls 5 minit lagi', () => {
    render(<Moments view={testView({ now: NOW, feed: [item('five-left')] })} />)
    expect(screen.getByRole('status')).toHaveTextContent('5 minit lagi!')
  })

  it('blows the final whistle when the game ends', () => {
    render(<Moments view={testView({ now: NOW, phase: 'ended', endsAt: NOW - 1000, feed: [] })} />)
    expect(screen.getByRole('status')).toHaveTextContent('final whistle, bossku')
  })

  it('plays each only once, and never an old one', () => {
    const v = testView({ now: NOW, feed: [item('jailbreak')] })
    const { unmount } = render(<Moments view={v} />)
    unmount()
    render(<Moments view={v} />)
    expect(screen.queryByRole('status')).toBeNull()
    cleanup()
    render(<Moments view={testView({ now: NOW, feed: [item('jailbreak', { at: new Date(NOW - 3_600_000).toISOString() })] })} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
