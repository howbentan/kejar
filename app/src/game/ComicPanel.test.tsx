import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ComicPanel, { PanelStack } from './ComicPanel'

afterEach(cleanup)

const panel = (n: number) => <ComicPanel key={n} colour="#fff" ink="#000" caption="c" icon={null} title={`panel ${n}`} />

describe('PanelStack', () => {
  it('shows three panels at most and counts the rest', () => {
    render(<PanelStack>{[1, 2, 3, 4, 5].map(panel)}</PanelStack>)
    expect(screen.getAllByRole('status')).toHaveLength(3)
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('draws nothing when no state is on', () => {
    const { container } = render(<PanelStack>{[null, false]}</PanelStack>)
    expect(container).toBeEmptyDOMElement()
  })
})
