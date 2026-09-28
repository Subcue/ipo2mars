import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three'

// Ground detail for the terrain patches, baked once on the CPU into a small
// periodic texture: RG = surface slope (dh/dx, dh/dz), B = albedo shift.
// Craters use the same bowl + rim profile as the procedural sphere detail
// (surfaceGlsl.ts) and scatter on a torus so the tile wraps seamlessly. The
// patch samples it at four scales (rotated to hide the repeat), so the ground
// keeps its relief from a kilometre down to a few metres for a handful of
// texture reads: mipmaps fade each scale out exactly when it gets too fine.
const N = 512

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967295
  }
}

function periodicNoise(h: Float32Array, rnd: () => number, cells: number, amp: number) {
  const g = new Float32Array(cells * cells)
  for (let i = 0; i < g.length; i++) g[i] = rnd()
  const at = (x: number, y: number) => g[((y + cells) % cells) * cells + ((x + cells) % cells)]
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cells
      const fy = (y / N) * cells
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      let tx = fx - ix
      let ty = fy - iy
      tx = tx * tx * (3 - 2 * tx)
      ty = ty * ty * (3 - 2 * ty)
      const a = at(ix, iy)
      const b = at(ix + 1, iy)
      const c = at(ix, iy + 1)
      const d = at(ix + 1, iy + 1)
      h[y * N + x] += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty - 0.5) * amp
    }
  }
}

const cache = new Map<string, DataTexture>()

export function groundDetail(kind: 'moon' | 'mars'): DataTexture {
  const hit = cache.get(kind)
  if (hit) return hit
  const rnd = lcg(kind === 'moon' ? 91 : 57)
  const h = new Float32Array(N * N) // height, in tile units
  const rim = new Float32Array(N * N)
  const craters = kind === 'moon' ? 150 : 55
  for (let i = 0; i < craters; i++) {
    const cx = rnd()
    const cy = rnd()
    const r = 0.012 * Math.pow(0.11 / 0.012, Math.pow(rnd(), 2.4))
    const fresh = (kind === 'moon' ? 0.35 : 0.2) + 0.65 * Math.pow(rnd(), 1.5)
    const reach = r * 1.9
    const x0 = Math.floor((cx - reach) * N)
    const x1 = Math.ceil((cx + reach) * N)
    const y0 = Math.floor((cy - reach) * N)
    const y1 = Math.ceil((cy + reach) * N)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x / N - cx
        const dy = y / N - cy
        const d = Math.sqrt(dx * dx + dy * dy) / r
        if (d > 1.9) continue
        const bowl = d < 1 ? (d * d - 1) * 0.42 : 0
        const e = Math.exp(-(((d - 1) / 0.32) ** 2))
        const k = (((y % N) + N) % N) * N + (((x % N) + N) % N)
        h[k] += r * (bowl + 0.11 * e) * fresh
        rim[k] += (Math.exp(-(((d - 1.05) / 0.28) ** 2)) - (d < 1 ? (1 - d * d) * 0.35 : 0)) * fresh
      }
    }
  }
  // fine regolith roughness (periodic octaves)
  periodicNoise(h, rnd, 16, kind === 'moon' ? 0.004 : 0.006)
  periodicNoise(h, rnd, 48, kind === 'moon' ? 0.0016 : 0.0024)
  periodicNoise(h, rnd, 128, 0.0007)
  const alb = new Float32Array(N * N)
  periodicNoise(alb, rnd, 24, 0.5)
  periodicNoise(alb, rnd, 96, 0.25)

  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = y * N + x
      const sx = (h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)]) * (N / 2)
      const sy = (h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x]) * (N / 2)
      data[k * 4] = Math.max(0, Math.min(255, Math.round((sx / 4 + 0.5) * 255)))
      data[k * 4 + 1] = Math.max(0, Math.min(255, Math.round((sy / 4 + 0.5) * 255)))
      data[k * 4 + 2] = Math.max(0, Math.min(255, Math.round((0.5 + rim[k] * 0.22 + alb[k] * 0.35) * 255)))
      data[k * 4 + 3] = 255
    }
  }
  const t = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType)
  t.wrapS = t.wrapT = RepeatWrapping
  t.generateMipmaps = true
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.anisotropy = 8
  t.needsUpdate = true
  cache.set(kind, t)
  return t
}
