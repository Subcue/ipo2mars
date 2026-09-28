import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three'

// Coastal ground detail for Starbase, baked once into a periodic 512^2 tile:
// RG = surface slope (dh/dx, dh/dz), B = albedo shift, A = vegetation. Wind
// ripples in the sand, tufts of grass and scrub (clumped, each with its own
// tone), and grit. The ground samples it at three scales; mipmaps fade each
// scale out exactly when it gets too fine (no shimmer at grazing angles).
const N = 512

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967295
  }
}

function periodicNoise(out: Float32Array, rnd: () => number, cells: number, amp: number) {
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
      out[y * N + x] += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty - 0.5) * amp
    }
  }
}

let cached: DataTexture | null = null

export function coastDetail(): DataTexture {
  if (cached) return cached
  const rnd = lcg(77)
  const h = new Float32Array(N * N)
  const veg = new Float32Array(N * N)
  const alb = new Float32Array(N * N)
  // wind ripples: long crests, gently warped
  const warp = new Float32Array(N * N)
  periodicNoise(warp, rnd, 6, 1)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = y * N + x
      const ph = ((x + y * 0.35) / N) * 38 + warp[k] * 5
      h[k] += Math.pow(Math.abs(Math.sin(ph * Math.PI)), 1.5) * 0.0006
    }
  }
  // clumps of grass and scrub
  const clumps = 520
  for (let i = 0; i < clumps; i++) {
    const cx = rnd()
    const cy = rnd()
    const r = 0.006 + Math.pow(rnd(), 2.2) * 0.03
    const tall = 0.5 + rnd()
    const tone = rnd()
    const reach = r * 1.6
    const x0 = Math.floor((cx - reach) * N)
    const x1 = Math.ceil((cx + reach) * N)
    const y0 = Math.floor((cy - reach) * N)
    const y1 = Math.ceil((cy + reach) * N)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x / N - cx
        const dy = y / N - cy
        const d = Math.sqrt(dx * dx + dy * dy) / r
        if (d > 1.6) continue
        const k = (((y % N) + N) % N) * N + (((x % N) + N) % N)
        const dome = Math.max(0, 1 - d * d)
        h[k] += dome * r * 0.3 * tall
        const m = 1 - Math.min(1, Math.max(0, (d - 0.75) / 0.5))
        if (m > veg[k]) veg[k] = m
        alb[k] += m * (tone - 0.5) * 0.5
      }
    }
  }
  // grit and tufts inside the clumps
  periodicNoise(h, rnd, 96, 0.0022)
  periodicNoise(h, rnd, 192, 0.0012)
  periodicNoise(alb, rnd, 40, 0.5)
  periodicNoise(alb, rnd, 140, 0.3)
  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const k = y * N + x
      const sx = (h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)]) * (N / 2)
      const sy = (h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x]) * (N / 2)
      data[k * 4] = Math.max(0, Math.min(255, Math.round((sx / 4 + 0.5) * 255)))
      data[k * 4 + 1] = Math.max(0, Math.min(255, Math.round((sy / 4 + 0.5) * 255)))
      data[k * 4 + 2] = Math.max(0, Math.min(255, Math.round((0.5 + alb[k] * 0.4) * 255)))
      data[k * 4 + 3] = Math.round(veg[k] * 255)
    }
  }
  const t = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType)
  t.wrapS = t.wrapT = RepeatWrapping
  t.generateMipmaps = true
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.anisotropy = 8
  t.needsUpdate = true
  cached = t
  return t
}
