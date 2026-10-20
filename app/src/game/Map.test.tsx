import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({ count: 0, workerUrl: '' as string, workerSetBeforeMap: false }))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '/assets/maplibre-worker.js' }))
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: (url: string) => {
    created.workerUrl = url
  },
  Map: class {
    constructor() {
      if (created.count === 0) created.workerSetBeforeMap = created.workerUrl !== ''
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

  it("points MapLibre at the bundled worker before creating a map (without it, nothing draws)", () => {
    created.count = 0
    render(<GameMap arena={arena} dots={[]} />)
    expect(created.workerUrl).toBe('/assets/maplibre-worker.js')
    expect(created.workerSetBeforeMap).toBe(true)
  })
})
