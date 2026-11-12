import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FreezePicker from './FreezePicker'

afterEach(cleanup)

describe('FreezePicker', () => {
  it('lists one button per chaser and picks by id', () => {
    const onPick = vi.fn()
    render(<FreezePicker targets={[{ id: 'c1', name: 'Ben' }, { id: 'c2', name: 'Aini' }]} onPick={onPick} onCancel={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Freeze which Kejar?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Aini' }))
    expect(onPick).toHaveBeenCalledWith('c2')
  })

  it('Cancel closes without picking', () => {
    const onPick = vi.fn()
    const onCancel = vi.fn()
    render(<FreezePicker targets={[{ id: 'c1', name: 'Ben' }]} onPick={onPick} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})
