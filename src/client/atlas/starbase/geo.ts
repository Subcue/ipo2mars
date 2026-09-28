// The ground around Starbase in base-local metres (x east, z south, y up),
// evaluated identically on the CPU (terrain heights, seating structures) and
// in GLSL (per-pixel shoreline, surf, wet sand, lagoons). The coast runs
// roughly north-south a few hundred metres east of the pads with the Gulf
// beyond it, as at Boca Chica; everything else is dead flat tidal plain.

import layout from '../bases/layout.json'

const L = layout.starbase

/** Patch radius, metres. */
export const SITE_EXTENT = L.extent

/** Shoreline x (metres east) at a given z. */
export function shoreX(z: number): number {
  return L.shore + 70 * Math.sin(z / 1900 + 0.7) + 26 * Math.sin(z / 540 + 1.9) + 9 * Math.sin(z / 170 + 0.3)
}

/** Signed horizontal distance to the shoreline, metres: > 0 offshore. */
export function shoreDist(x: number, z: number): number {
  const d = (shoreX(z + 1) - shoreX(z - 1)) / 2
  return (x - shoreX(z)) / Math.sqrt(1 + d * d)
}

function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function vnoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let u = x - xi
  let v = y - yi
  u = u * u * (3 - 2 * u)
  v = v * v * (3 - 2 * v)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Graded zones (pads, roads, building aprons): [x, z, radius]. */
const FLATS = L.flats as number[][]

/** 0..1: how graded the ground is (1 on pads and aprons). */
export function flatAt(x: number, z: number): number {
  let f = 0
  for (const [fx, fz, r] of FLATS) {
    const d = Math.hypot(x - fx, z - fz)
    f = Math.max(f, 1 - smooth(r, r + 40, d))
  }
  // the highway west to the production site
  const road = L.road as number[]
  if (x < road[2] && x > road[0]) f = Math.max(f, 1 - smooth(7, 16, Math.abs(z - road[1])))
  return f
}

/** Ground height (metres above sea level) at base-local (x, z). */
export function groundHeight(x: number, z: number): number {
  const s = shoreDist(x, z)
  let h: number
  if (s > 0) {
    h = 0 // sea surface (waves are shading only)
  } else {
    // beach: a 3% ramp up from the swash line
    const beach = Math.min(-s, 70) * 0.03
    // dunes behind the beach, patchy along the coast
    const dz = smooth(40, 90, -s) * (1 - smooth(260, 420, -s))
    const dune = dz * (1.5 + 4.5 * vnoise(x / 60, z / 90) * vnoise(x / 23 + 4, z / 31 - 2))
    // the tidal plain: flat, barely above the water table
    const plain = 0.35 + 0.5 * vnoise(x / 400 + 7, z / 400 - 3)
    const inland = smooth(260, 520, -s)
    h = beach * (1 - inland) + plain * inland + dune
  }
  // graded pads sit a little proud of the plain
  const f = flatAt(x, z)
  h = h * (1 - f) + 1.6 * f
  // fade to the sphere at the patch rim
  const e = Math.hypot(x, z) / SITE_EXTENT
  return h * (1 - smooth(0.7, 0.95, e))
}

/** GLSL twins of the functions above (fragment-side shoreline and zones). */
export const GEO_GLSL = /* glsl */ `
float shoreX(float z) {
  return ${L.shore.toFixed(1)} + 70.0 * sin(z / 1900.0 + 0.7) + 26.0 * sin(z / 540.0 + 1.9) + 9.0 * sin(z / 170.0 + 0.3);
}
float shoreDist(vec2 p) {
  float d = (shoreX(p.y + 1.0) - shoreX(p.y - 1.0)) * 0.5;
  return (p.x - shoreX(p.y)) * inversesqrt(1.0 + d * d);
}
`
