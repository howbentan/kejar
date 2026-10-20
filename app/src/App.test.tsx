import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('shows the kejar wordmark with a volt full stop on the home route', () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    expect(screen.getByText('kejar')).toBeInTheDocument()
    expect(screen.getByText('.')).toHaveStyle({ color: 'var(--volt)' })
  })
})
