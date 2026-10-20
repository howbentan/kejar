import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({ count: 0 }))
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor() {
      created.count++
    }
    on() {}
    remove() {}
    getSource() {
      return undefined
    }
  },
}))

import GameMap from './Map'

afterEach(cleanup)

const arena = {
  id: 'around-me',
  name: 'Around',
  boundary: [{ lat: 3, lng: 101 }],
  jail: { lat: 3, lng: 101 },
  start: { lat: 3, lng: 101 },
}

describe('GameMap', () => {
  it('keeps one map when a poll returns an equal arena as a new object', () => {
    created.count = 0
    const { rerender } = render(<GameMap arena={arena} dots={[]} />)
    rerender(<GameMap arena={structuredClone(arena)} dots={[]} />)
    rerender(<GameMap arena={structuredClone(arena)} dots={[]} />)
    expect(created.count).toBe(1)
  })
})
