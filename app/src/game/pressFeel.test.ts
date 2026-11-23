import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPressFeel } from './pressFeel'

vi.mock('./sounds', () => ({ playPress: vi.fn() }))
import { playPress } from './sounds'

describe('installPressFeel', () => {
  let undo = () => {}
  afterEach(() => {
    undo()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  const press = (html: string) => {
    document.body.innerHTML = html
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    undo = installPressFeel(document)
    document.querySelector('span, button')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    return vibrate
  }

  it('a main button buzzes and tocks as it goes down, even when the thumb lands on its words', () => {
    const vibrate = press('<button class="btn"><span>join</span></button>')
    expect(vibrate).toHaveBeenCalledWith(8)
    expect(playPress).toHaveBeenCalledTimes(1)
  })

  it('a second choice and a disabled button stay quiet', () => {
    expect(press('<button class="btn btn-ghost">cancel</button>')).not.toHaveBeenCalled()
    undo()
    expect(press('<button class="btn" disabled>start</button>')).not.toHaveBeenCalled()
    expect(playPress).not.toHaveBeenCalled()
  })
})
