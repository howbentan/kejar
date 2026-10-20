export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** POST /api/game { action, ...body }. Throws ApiError with the server's message on failure. */
export async function call<T>(action: string, body: object): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    })
  } catch {
    throw new ApiError(0, 'No connection — check your signal')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`)
  return data as T
}
