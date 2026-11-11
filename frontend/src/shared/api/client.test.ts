import { describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'
import { server } from '#/mocks/server'
import { apiClient, rawApiClient } from './client'

// Records the body it got and answers with one snake_case key.
function echo() {
  const seen: unknown[] = []
  server.use(
    http.post('*/api/v1/echo', async ({ request }) => {
      seen.push(await request.json())
      return HttpResponse.json({ user_name: 'a' })
    }),
  )
  return seen
}

describe('makeClient', () => {
  it('converts keys both ways in apiClient', async () => {
    const seen = echo()
    const res = await apiClient.post('/api/v1/echo', { textColor: 'red' })
    expect(seen).toEqual([{ text_color: 'red' }])
    expect(res).toEqual({ userName: 'a' })
  })

  it('leaves keys alone in rawApiClient', async () => {
    const seen = echo()
    const res = await rawApiClient.post('/api/v1/echo', { textColor: 'red' })
    expect(seen).toEqual([{ textColor: 'red' }])
    expect(res).toEqual({ user_name: 'a' })
  })
})
