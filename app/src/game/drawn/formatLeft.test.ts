import { describe, expect, it } from 'vitest'
import { formatLeft } from './formatLeft'

describe('formatLeft', () => {
  it('shows m:ss under an hour', () => {
    expect(formatLeft(270_000)).toBe('4:30')
    expect(formatLeft(59_001)).toBe('1:00')
  })
  it('shows h:mm:ss from an hour', () => expect(formatLeft(3_725_000)).toBe('1:02:05'))
  it('rounds up to the next whole second', () => expect(formatLeft(1)).toBe('0:01'))
  it('never goes below 0:00', () => {
    expect(formatLeft(0)).toBe('0:00')
    expect(formatLeft(-5000)).toBe('0:00')
  })
})
