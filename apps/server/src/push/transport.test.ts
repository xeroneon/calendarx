import { describe, expect, it } from 'vitest'
import { UnifiedPushTransport } from './transport.js'

function mockFetch(status: number): { fetch: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(status === 200 ? 'ok' : `${status}`, { status })
  }
  return { fetch: fetchImpl, calls }
}

describe('UnifiedPushTransport', () => {
  it('POSTs the message JSON to the endpoint with ntfy title header', async () => {
    const { fetch, calls } = mockFetch(200)
    const t = new UnifiedPushTransport(fetch)
    await t.deliver('https://notify.local/fun', { title: 'Standup', body: 'Room 4', eventKey: 'e1' })
    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe('https://notify.local/fun')
    expect(call.init.method).toBe('POST')
    expect(call.init.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Title': 'Standup' })
    const body = JSON.parse(String(call.init.body))
    expect(body.title).toBe('Standup')
    expect(body.body).toContain('Room 4')
  })

  it('sets X-At when a scheduled fire time is present (ntfy holds until then)', async () => {
    const { fetch, calls } = mockFetch(200)
    const t = new UnifiedPushTransport(fetch)
    await t.deliver('https://notify.local/fun', { title: 'Hi', body: '', at: '2026-10-22T12:00:00.000Z' })
    expect(String((calls[0]!.init.headers as Record<string, string>)['X-At'])).toBe('Thu, 22 Oct 2026 12:00:00 GMT')
  })

  it('rejects a malformed (non-http) endpoint', async () => {
    const t = new UnifiedPushTransport(mockFetch(200).fetch)
    await expect(t.deliver('not-a-url', { title: 'x', body: '' })).rejects.toThrow('invalid unifiedpush endpoint')
  })

  it('throws on a non-ok gateway response', async () => {
    const t = new UnifiedPushTransport(mockFetch(500).fetch)
    await expect(t.deliver('https://notify.local/fun', { title: 'x', body: '' })).rejects.toThrow(/HTTP 500/)
  })
})