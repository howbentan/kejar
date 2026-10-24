import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PrintTags from './PrintTags'

afterEach(cleanup)

describe('PrintTags', () => {
  it('prints Station 1 to Station 8 alongside the runner tags', () => {
    render(<PrintTags />)
    for (let n = 1; n <= 8; n++) expect(screen.getByText(`STATION ${n}`)).toBeInTheDocument()
    expect(screen.getByText('#01')).toBeInTheDocument()
  })
})
