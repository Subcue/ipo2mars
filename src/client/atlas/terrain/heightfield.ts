// Deterministic terrain heights around the surface bases, evaluated on the
// CPU once to displace the terrain patch and to seat rocks and vehicles.
// Coordinates are base-local metres on the tangent plane (x east, z south in
// three.js terms); heights are metres. The in-shader surface detail
// (planets/surfaceGlsl.ts) layers finer relief on top.

function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

/** 2D value noise in [0, 1]. */
export function vnoise2(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = smooth(xf)
  const v = smooth(yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm2(x: number, y: number, octaves: number): number {
  let s = 0
  let a = 0.5
  let f = 1
  for (let i = 0; i < octaves; i++) {
    s += a * vnoise2(x * f + i * 17.3, y * f - i * 9.1)
    f *= 2.03
    a *= 0.5
  }
  return s
}

export interface Crater {
  x: number
  z: number
  r: number
  depth: number
}

export interface Zone {
  x: number
  z: number
  r: number
}

/** An open-pit mine: terraced benches down to a flat floor. */
export interface Pit {
  x: number
  z: number
  r: number
  depth: number
}

/** A long graded strip that follows the planet's curve (a mass driver's
 *  bed), unlike the flats, which are levelled onto the tangent plane. */
export interface Strip {
  x0: number
  z0: number
  x1: number
  z1: number
  w: number
}

export interface TerrainSpec {
  kind: 'mars' | 'moon'
  pits?: Pit[]
  strips?: Strip[]
  /** Patch radius, metres. */
  extent: number
  /** Graded (flat) zones: the base core, pads, roads. */
  flats: Zone[]
  craters: Crater[]
  seed: number
  /** BASE_SCALE / (2 R): lifts graded zones onto a true plane (y = 0), so
   *  structures built flat in Blender sit exactly on the ground. */
  curve: number
}

/** Bowl + raised rim; d = distance / radius. */
function craterProfile(d: number): number {
  const bowl = d < 1 ? (d * d - 1) * 0.42 : 0
  const rim = 0.11 * Math.exp(-(((d - 1) / 0.32) ** 2))
  return bowl + rim
}

/** Deterministic scatter of small craters (power-law sizes). */
export function scatterCraters(seed: number, count: number, extent: number, rMin: number, rMax: number): Crater[] {
  let s = seed >>> 0
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967295
  }
  const out: Crater[] = []
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2
    const d = Math.sqrt(rnd()) * extent
    const r = rMin * Math.pow(rMax / rMin, Math.pow(rnd(), 2.2))
    out.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r, depth: 0.9 + rnd() * 0.3 })
  }
  return out
}

/** How graded (0..1) the ground is at (x, z): 1 on pads and under
 *  structures, easing out over a wide apron. */
export function flatAt(spec: TerrainSpec, x: number, z: number): number {
  let flat = 0
  for (const zn of spec.flats) {
    const d = Math.hypot(x - zn.x, z - zn.z)
    const k = 1 - smooth(Math.min(1, Math.max(0, (d - zn.r) / (zn.r * 0.7 + 70))))
    if (k > flat) flat = k
  }
  return flat
}

/** Terrain height (metres) at base-local (x, z). */
export function heightAt(spec: TerrainSpec, x: number, z: number): number {
  const dc = Math.hypot(x, z)
  // the settlement sits on a calm plain; relief grows with distance
  const calm = 0.18 + 0.82 * smooth(Math.min(1, Math.max(0, (dc - 250) / 1400)))
  let h = 0
  if (spec.kind === 'mars') {
    // rolling plains, long dune-like swells
    h += (fbm2(x / 1100, z / 1100, 5) - 0.5) * 120 * calm
    h += (fbm2(x / 240 + 40, z / 240 - 11, 4) - 0.5) * 16 * calm
    const dune = Math.sin((x * 0.8 + z * 0.6) / 60 + fbm2(x / 400, z / 400, 3) * 6)
    h += dune * dune * 3 * smooth(Math.min(1, fbm2(x / 700 + 7, z / 700, 3) * 1.4)) * calm
  } else {
    h += (fbm2(x / 1300, z / 1300, 5) - 0.5) * 100 * calm
    h += (fbm2(x / 200 + 3, z / 200 + 8, 4) - 0.5) * 10 * calm
  }
  for (const c of spec.craters) {
    const dx = x - c.x
    const dz = z - c.z
    const d2 = dx * dx + dz * dz
    const reach = c.r * 1.9
    if (d2 > reach * reach) continue
    h += c.r * c.depth * craterProfile(Math.sqrt(d2) / c.r)
  }
  // grade the base onto a true plane (y = 0): structures are built flat
  const flat = flatAt(spec, x, z)
  h = h * (1 - flat) + flat * (x * x + z * z) * spec.curve
  // strips: graded onto the sphere itself (their structures bend with it)
  for (const st of spec.strips ?? []) {
    const bx = st.x1 - st.x0
    const bz = st.z1 - st.z0
    const L2 = bx * bx + bz * bz
    const t = Math.min(1, Math.max(0, ((x - st.x0) * bx + (z - st.z0) * bz) / L2))
    const d = Math.hypot(x - st.x0 - bx * t, z - st.z0 - bz * t)
    const k = 1 - smooth(Math.min(1, Math.max(0, (d - st.w) / (st.w + 40))))
    h = h * (1 - k)
  }
  for (const p of spec.pits ?? []) {
    const d = Math.hypot(x - p.x, z - p.z) / p.r
    if (d >= 1.25) continue
    // four benches: steps in depth with short ramps between them
    const t = Math.min(1, Math.max(0, (1.1 - d) / 1.1))
    const steps = 4
    const k = t * steps
    const bench = (Math.floor(k) + smooth(Math.min(1, (k - Math.floor(k)) / 0.35))) / steps
    const rim = d < 1.25 ? Math.max(0, 1 - Math.abs(d - 1.1) / 0.15) * 1.5 : 0
    h += rim - p.depth * Math.min(1, bench)
  }
  // fade all relief out toward the patch edge so it meets the sphere
  const e = dc / spec.extent
  h *= 1 - smooth(Math.min(1, Math.max(0, (e - 0.72) / 0.28)))
  return h
}
