import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('shows the kejar logo on the home route', () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    expect(screen.getByRole('img', { name: 'kejar.' })).toHaveAttribute('src', '/logo-volt.png')
  })
})
