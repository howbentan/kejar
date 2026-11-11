import { FAIL_LIMIT_PER_MIN, limitKey, LIMIT_WINDOW_MS } from './limits.js'
import { ActionError, actions, type ActionName, type Ctx } from './actions.js'

export interface HandleDeps {
  ctx: Omit<Ctx, 'now'> & { now: number }
  ip: string | null
}

export interface HandleResult {
  status: number
  json: unknown
}

const TOO_MANY: HandleResult = { status: 429, json: { error: 'Too many requests. Wait a moment and try again.' } }

/** Runs one POST /api/game body (a string or an already-parsed value) and says what to answer. */
export async function handle(raw: unknown, deps: HandleDeps): Promise<HandleResult> {
  let name = ''
  try {
    const body: unknown = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw === undefined ? {} : raw)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return { status: 400, json: { error: 'Bad request' } }
    }
    const fields = body as Record<string, unknown>
    if (typeof fields.action !== 'string' || !Object.hasOwn(actions, fields.action)) {
      return { status: 400, json: { error: 'Unknown action' } }
    }
    name = fields.action
    try {
      const { key, limit } = limitKey(name, fields, deps.ip)
      if (!(await deps.ctx.store.hitRateLimit(key, LIMIT_WINDOW_MS, limit))) {
        return TOO_MANY
      }
    } catch (e) {
      console.error('[api/game]', name, 'rate limit check failed, running the action anyway', e)
    }
    const result = await actions[name as ActionName](deps.ctx, fields)
    return { status: 200, json: result }
  } catch (e) {
    if (e instanceof ActionError) {
      if ([401, 403, 404].includes(e.status)) {
        try {
          if (!(await deps.ctx.store.hitRateLimit(`fail:${deps.ip ?? 'unknown'}`, LIMIT_WINDOW_MS, FAIL_LIMIT_PER_MIN))) {
            return TOO_MANY
          }
        } catch (err) {
          console.error('[api/game]', name, 'failed-guess check failed, answering as normal', err)
        }
      }
      return { status: e.status, json: { error: e.message } }
    }
    if (e instanceof SyntaxError && !name) return { status: 400, json: { error: 'Bad request' } }
    console.error('[api/game]', name, e)
    return { status: 500, json: { error: 'Something went wrong. Try again.' } }
  }
}
