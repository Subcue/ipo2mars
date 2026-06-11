import { twoline2satrec, type SatRec } from 'satellite.js'

// Parse a CelesTrak TLE feed (name / line1 / line2 triples) into SGP4 records.
export function parseTle(text: string): SatRec[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)

  const recs: SatRec[] = []
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const l1 = lines[i + 1]
    const l2 = lines[i + 2]
    if (!l1?.startsWith('1 ') || !l2?.startsWith('2 ')) continue
    try {
      recs.push(twoline2satrec(l1, l2))
    } catch {
      /* skip malformed element set */
    }
  }
  return recs
}

export const EARTH_RADIUS_KM = 6371
