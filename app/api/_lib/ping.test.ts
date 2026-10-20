// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Device } from '../../src/spike/types'
import { sendPingToDevices } from './ping'

const dev = (id: string): Device => ({
  id,
  label: id,
  platform: 'android',
  subscription: { endpoint: 'https://push.example/' + id },
  active: true,
  created_at: '',
})

describe('sendPingToDevices', () => {
  it('sends to every device with its own payload', async () => {
    const calls: string[] = []
    const r = await sendPingToDevices('p1', [dev('a'), dev('b')], async (_s, p) => {
      calls.push(p)
    })
    expect(r).toEqual({ sent: 2, expired: [], failed: [] })
    expect(calls.map((c) => JSON.parse(c))).toEqual([
      { pingId: 'p1', deviceId: 'a' },
      { pingId: 'p1', deviceId: 'b' },
    ])
  })

  it('marks 404/410 as expired, other errors as failed, and keeps going', async () => {
    const r = await sendPingToDevices('p1', [dev('a'), dev('b'), dev('c'), dev('d')], async (s) => {
      if (s.endpoint!.endsWith('a')) throw { statusCode: 410 }
      if (s.endpoint!.endsWith('b')) throw { statusCode: 500 }
      if (s.endpoint!.endsWith('d')) throw { statusCode: 404 }
    })
    expect(r).toEqual({ sent: 1, expired: ['a', 'd'], failed: ['b'] })
  })

  it('handles no devices', async () => {
    expect(await sendPingToDevices('p1', [], async () => {})).toEqual({ sent: 0, expired: [], failed: [] })
  })
})
