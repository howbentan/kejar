import { render, screen } from '@testing-library/react'
import * as m from 'motion/react-m'
import { describe, expect, it } from 'vitest'
import { MotionRoot } from './motion'

describe('MotionRoot', () => {
  it('lets m components render inside it', () => {
    render(
      <MotionRoot>
        <m.div animate={{ opacity: 1 }}>moving</m.div>
      </MotionRoot>,
    )
    expect(screen.getByText('moving')).toBeInTheDocument()
  })
})
