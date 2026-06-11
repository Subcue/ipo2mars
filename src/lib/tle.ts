// CelesTrak Starlink TLE feed, proxied + cached in KV so the browser fetches
// same-origin (no CORS) and CelesTrak isn't hit on every page load. TLEs only
// meaningfully change ~daily, so a multi-hour cache is plenty.

const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle'
const CACHE_KEY = 'tle:starlink'
const TTL_SECONDS = 6 * 60 * 60

async function fetchFromCelestrak(): Promise<string> {
  const res = await fetch(CELESTRAK, {
    headers: {
      'user-agent': 'ipo2mars/1.0 (+https://ipo2mars.com; open-source visualization)',
    },
  })
  if (!res.ok) throw new Error(`CelesTrak responded ${res.status}`)

  const text = (await res.text()).trim()
  // Sanity-check: a TLE feed has "1 NNNNN" / "2 NNNNN" element lines.
  if (!text.includes('\n1 ') || !text.includes('\n2 ')) {
    throw new Error('CelesTrak returned an unexpected payload')
  }
  return text
}

export async function getStarlinkTle(kv: KVNamespace): Promise<string> {
  const cached = await kv.get(CACHE_KEY)
  if (cached) return cached

  const text = await fetchFromCelestrak()
  await kv.put(CACHE_KEY, text, { expirationTtl: TTL_SECONDS })
  return text
}

// Cron-driven warmer: refetch and overwrite the cache so visitors never hit a
// cold (multi-second) CelesTrak request. Runs well inside the cache TTL.
export async function refreshStarlinkTle(kv: KVNamespace): Promise<void> {
  const text = await fetchFromCelestrak()
  await kv.put(CACHE_KEY, text, { expirationTtl: TTL_SECONDS })
}

// Evenly downsample TLE groups (name, line1, line2) to at most `max` satellites.
// Keeps the client payload and SGP4 propagation cost bounded while preserving
// the overall shape of the constellation.
export function sampleTle(raw: string, max: number): string {
  const lines = raw.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean)
  const triples: string[][] = []
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]]
    if (l1.startsWith('1 ') && l2.startsWith('2 ')) triples.push([name, l1, l2])
  }
  const keep = Math.min(max, triples.length)
  if (keep === triples.length) return triples.flat().join('\n')

  const out: string[] = []
  for (let i = 0; i < keep; i++) {
    out.push(...triples[Math.floor((i * triples.length) / keep)])
  }
  return out.join('\n')
}
