import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('shows the kejar logo on the home route', () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    // The home logo is built from its letters (the catch-the-j toy), named as one image.
    expect(screen.getByRole('img', { name: 'kejar.' })).toBeInTheDocument()
  })
})
