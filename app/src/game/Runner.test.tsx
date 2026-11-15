import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const reduce = vi.hoisted(() => ({ on: false }))
vi.mock('motion/react', async (orig) => ({ ...(await orig<typeof import('motion/react')>()), useReducedMotion: () => reduce.on }))

import { BusyLabel, FullLoader, MiniRunner, WaitingLine } from './Runner'

afterEach(() => {
  cleanup()
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
    expect(screen.getByText('JAP, LOADING YOUR PARKS')).toBeInTheDocument()
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
