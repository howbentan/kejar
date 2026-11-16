import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

import { Busy, BusyLabel, FullLoader, MiniRunner, WaitingLine } from './Runner'
import { useLoaderGate } from './useLoaderGate'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  reduce.on = false
  vi.restoreAllMocks()
})

describe('MiniRunner', () => {
  it("draws the logo's j (head, body, two legs), hidden from screen readers", () => {
    render(<MiniRunner height={30} />)
    const svg = screen.getByTestId('mini-runner')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('height', '30')
    expect(svg.querySelectorAll('ellipse')).toHaveLength(1)
    expect(svg.querySelectorAll('path')).toHaveLength(3)
    expect(svg.querySelector('path')).toHaveAttribute('stroke', 'var(--volt)')
  })

  it('runs on the spot by animation frames', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    render(<MiniRunner />)
    expect(raf).toHaveBeenCalled()
    expect(screen.getByTestId('mini-runner')).not.toHaveAttribute('data-still')
  })

  it("stands still in the logo's pose with reduced motion", () => {
    reduce.on = true
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    render(<MiniRunner colour="var(--black)" />)
    expect(raf).not.toHaveBeenCalled()
    const svg = screen.getByTestId('mini-runner')
    expect(svg).toHaveAttribute('data-still', 'true')
    expect((svg.querySelector('g') as SVGGElement).style.transform).toBe('')
    expect(svg.querySelector('path')).toHaveAttribute('stroke', 'var(--black)')
  })
})

describe('BusyLabel and WaitingLine', () => {
  it('a busy button shows the small j beside its label', () => {
    render(
      <button type="button">
        <BusyLabel label="Joining" />
      </button>,
    )
    const button = screen.getByRole('button', { name: 'Joining' })
    expect(button).toContainElement(screen.getByTestId('mini-runner'))
  })

  it('a long wait keeps its words with the j beside them', () => {
    render(<WaitingLine>Finding you</WaitingLine>)
    expect(screen.getByText('Finding you').closest('p')).toContainElement(screen.getByTestId('mini-runner'))
  })
})

describe('FullLoader', () => {
  it('shows the home logo with the caption, announced as a status', () => {
    render(<FullLoader caption="JAP, LOADING YOUR PARKS" />)
    expect(screen.getByRole('status', { name: 'JAP, LOADING YOUR PARKS' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'kejar.' })).toBeInTheDocument()
  })

  it('splits the caption into one letter each, so the j can clear them one by one', () => {
    const { container } = render(<FullLoader caption="JAP, LOADING" />)
    const chars = container.querySelectorAll('.hl-caption .hl-ch')
    expect(chars).toHaveLength('JAP, LOADING'.length)
    expect([...chars].map((c) => c.textContent).join('')).toBe('JAP, LOADING')
  })
})

describe('Busy', () => {
  const button = (busy: boolean) => (
    <button type="button">
      <Busy busy={busy} label="Joining">
        Join game
      </Busy>
    </button>
  )
  const runner = () => screen.queryByTestId('mini-runner')

  it('shows the small j and the busy label while busy', () => {
    render(button(true))
    expect(screen.getByRole('button', { name: 'Joining' })).toContainElement(runner())
  })

  it('when the wait ends, the j wipes its label for 650 ms, then the button reads as normal', () => {
    vi.useFakeTimers()
    const { rerender, container } = render(button(true))
    rerender(button(false))
    expect(runner()).toBeInTheDocument()
    expect(container.querySelector('[data-leaving]')).not.toBeNull()
    // Only for the eyes: the button is already named for what it does next.
    expect(screen.getByRole('button', { name: 'Join game' })).toBeInTheDocument()
    expect(screen.getByText('Join game')).toHaveClass('sr-only')
    act(() => void vi.advanceTimersByTime(650))
    expect(screen.getByRole('button', { name: 'Join game' })).toBeInTheDocument()
    expect(runner()).toBeNull()
  })

  it('without motion the button reads as normal at once', () => {
    reduce.on = true
    const { rerender } = render(button(true))
    rerender(button(false))
    expect(screen.getByRole('button', { name: 'Join game' })).toBeInTheDocument()
  })

  it('busy again mid-wipe shows busy at once', () => {
    vi.useFakeTimers()
    const { rerender, container } = render(button(true))
    rerender(button(false))
    act(() => void vi.advanceTimersByTime(300))
    rerender(button(true))
    expect(screen.getByRole('button', { name: 'Joining' })).toBeInTheDocument()
    expect(container.querySelector('[data-leaving]')).toBeNull()
  })

  it('leaving the screen mid-wipe leaves nothing running', () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender, unmount } = render(button(true))
    rerender(button(false))
    unmount()
    act(() => void vi.advanceTimersByTime(1000))
    expect(error).not.toHaveBeenCalled()
  })
})

describe('useLoaderGate', () => {
  function Probe({ ready, instant }: { ready: boolean; instant?: boolean }) {
    const gate = useLoaderGate(ready, instant)
    return (
      <>
        {gate.show ? <FullLoader caption="JAP, LOADING" {...gate.loader} /> : <p>the screen</p>}
        <span data-testid="exit" data-exit={gate.loader.leaving ? gate.loader.exit : ''} />
        <button type="button" onClick={gate.loader.onLeft}>
          end the exit
        </button>
      </>
    )
  }
  const loader = () => screen.queryByRole('status')

  it('shows the loader while waiting, and the screen at once when the wait was short', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Probe ready={false} />)
    expect(loader()).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(200))
    rerender(<Probe ready />)
    expect(loader()).toBeNull()
    expect(screen.getByText('the screen')).toBeInTheDocument()
  })

  it('after a real wait, the loader plays a random exit and only then shows the screen', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // The logo needs a size and frames that never come, so the exit stays on until the test ends it.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 290, height: 430, top: 0, left: 0, right: 290, bottom: 430, x: 0, y: 0, toJSON: () => ({}) })
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const { rerender } = render(<Probe ready={false} />)
    act(() => void vi.advanceTimersByTime(1000))
    rerender(<Probe ready />)
    expect(loader()).toBeInTheDocument()
    expect(['wipe', 'bulldoze', 'kungfu']).toContain(screen.getByTestId('exit').dataset.exit)
    fireEvent.click(screen.getByText('end the exit'))
    expect(screen.getByText('the screen')).toBeInTheDocument()
  })

  it('shows the screen at once when told to (an error), and never when ready from the start', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Probe ready={false} />)
    act(() => void vi.advanceTimersByTime(1000))
    rerender(<Probe ready instant />)
    expect(screen.getByText('the screen')).toBeInTheDocument()
    cleanup()
    render(<Probe ready />)
    expect(screen.getByText('the screen')).toBeInTheDocument()
  })

  it('brings the loader back if the screen loses its data', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Probe ready />)
    rerender(<Probe ready={false} />)
    expect(loader()).toBeInTheDocument()
  })
})

describe('press feedback (tokens.css)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  it('turns off the blue tap box app-wide', () => {
    expect(css).toMatch(/html \{ -webkit-tap-highlight-color: transparent; \}/)
  })
  it('dims only named button classes, never every plain button, so SOS, the reel and the lucky dip are untouched', () => {
    expect(css).not.toMatch(/(^|[\s,}])button:not\(/m)
    const dims = css.split('}').filter((rule) => /:active[^{]*\{[^}]*opacity: 0\.65/.test(rule + '}'))
    expect(dims.length).toBeGreaterThan(0)
    for (const rule of dims) expect(rule).not.toMatch(/sos|reel|lucky|dip/)
  })
})
