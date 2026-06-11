import { Hono } from 'hono'
import type { Env } from '../types'
import { getStarlinkTle, sampleTle } from '../lib/tle'

export const api = new Hono<{ Bindings: Env }>()

// Same-origin Starlink TLE feed for the client island. `?max=` caps the count.
api.get('/tle/starlink', async (c) => {
  const max = Math.min(Math.max(Number(c.req.query('max')) || 2600, 100), 9000)
  try {
    const raw = await getStarlinkTle(c.env.KV_CACHE)
    c.header('Content-Type', 'text/plain; charset=utf-8')
    c.header('Cache-Control', 'public, max-age=1800')
    return c.body(sampleTle(raw, max))
  } catch (err) {
    console.error('starlink tle error', err)
    // Soft-fail: the scene shows the Earth without the constellation.
    return c.text('', 503)
  }
})
