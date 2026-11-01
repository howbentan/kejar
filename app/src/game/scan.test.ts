import { describe, expect, it } from 'vitest'
import { scanTarget } from './scan'

describe('scanTarget', () => {
  it('a station code claims, for either side', () => {
    expect(scanTarget('KEJAR:STATION:3', 'runner')).toEqual({ action: 'claim', body: { qr: 'KEJAR:STATION:3' } })
    expect(scanTarget('KEJAR:STATION:3', 'chaser')).toEqual({ action: 'claim', body: { qr: 'KEJAR:STATION:3' } })
  })
  it('the Penjara code breaks runners out', () => {
    expect(scanTarget('KEJAR:JAIL', 'runner')).toEqual({ action: 'jailbreak', body: { qr: 'KEJAR:JAIL' } })
  })
  it('a tag catches, for chasers', () => {
    expect(scanTarget('KEJAR:TAG:07', 'chaser')).toEqual({ action: 'catch', body: { tagQr: 'KEJAR:TAG:07' } })
  })
  it('anything else is an error that calls nothing', () => {
    expect(scanTarget('KEJAR:TAG:07', 'runner')).toEqual({ error: "That's not a station or Penjara code" })
    expect(scanTarget('hello', 'runner')).toEqual({ error: "That's not a station or Penjara code" })
    expect(scanTarget('KEJAR:JAIL', 'chaser')).toEqual({ error: "That's not a tag or station code" })
    expect(scanTarget('https://example.com', 'chaser')).toEqual({ error: "That's not a tag or station code" })
  })
})
