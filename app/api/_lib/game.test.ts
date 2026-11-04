// @vitest-environment node
// Lives in _lib so Vercel doesn't turn the test into a function of its own.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../game.js'

function fakeRes() {
  const out: { status?: number; json?: unknown } = {}
  const res = {
    status(code: number) {
      out.status = code
      return res
    },
    json(body: unknown) {
      out.json = body
      return res
    },
  }
  return { res: res as unknown as VercelResponse, out }
}

afterEach(() => vi.restoreAllMocks())

describe('api/game wrapper', () => {
  it('answers 400 Bad request, with nothing logged, when the JSON body cannot be parsed', async () => {
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      get body(): unknown {
        throw new SyntaxError('Unexpected token n in JSON at position 1')
      },
    } as unknown as VercelRequest
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { res, out } = fakeRes()
    await handler(req, res)
    expect(out).toEqual({ status: 400, json: { error: 'Bad request' } })
    expect(spy).not.toHaveBeenCalled()
  })

  it('still answers 405 to anything but POST', async () => {
    const { res, out } = fakeRes()
    await handler({ method: 'GET', headers: {} } as unknown as VercelRequest, res)
    expect(out).toEqual({ status: 405, json: { error: 'POST only' } })
  })
})
