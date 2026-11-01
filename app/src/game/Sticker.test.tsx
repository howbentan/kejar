import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Sticker from './Sticker'

afterEach(cleanup)

describe('Sticker', () => {
  it('is an image named after the power-up', () => {
    render(
      <>
        <Sticker kind="shield" />
        <Sticker kind="flare" />
      </>,
    )
    expect(screen.getByRole('img', { name: 'Durian' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Mat Rempit' })).toBeInTheDocument()
  })

  it('gives every sticker its own filter ids', () => {
    const { container } = render(
      <>
        <Sticker kind="cloak" />
        <Sticker kind="focus" />
      </>,
    )
    const ids = [...container.querySelectorAll('filter')].map((f) => f.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
  })
})
