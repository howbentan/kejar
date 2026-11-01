import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PowerCard from './PowerCard'

afterEach(cleanup)

describe('PowerCard', () => {
  it('face up: eyebrow, sticker, name and effect', () => {
    render(<PowerCard kind="cloak" />)
    expect(screen.getByText('POWER-UP')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ponteng' })).toBeInTheDocument()
    expect(screen.getByText('Ponteng')).toBeInTheDocument()
    expect(screen.getByText('You skip the next ping')).toBeInTheDocument()
  })

  it('face down shows nothing of the power-up', () => {
    render(<PowerCard kind="cloak" faceDown />)
    expect(screen.getByLabelText('Face-down card')).toBeInTheDocument()
    expect(screen.queryByText('Ponteng')).toBeNull()
    expect(screen.queryByRole('img', { name: 'Ponteng' })).toBeNull()
  })
})
