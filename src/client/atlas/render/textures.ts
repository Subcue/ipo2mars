import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Texture,
} from 'three'

// Procedural textures generated once in the browser: no downloads, no
// licensing, crisp at any zoom thanks to mipmaps + anisotropy.

function dataTex(data: Uint8Array<ArrayBuffer>, w: number, h: number, srgb: boolean): DataTexture {
  const t = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  t.wrapS = t.wrapT = RepeatWrapping
  t.generateMipmaps = true
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.anisotropy = 8
  if (srgb) t.colorSpace = SRGBColorSpace
  t.needsUpdate = true
  return t
}

function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

let hexCache: { map: Texture; orm: Texture; normal: Texture } | null = null

/** Hexagonal heat-shield tiles: 8 x 8 pointy-top hexes per texture, exactly
 *  periodic (lattice coordinates are derived from the normalized pixel
 *  position), with per-tile tone/gloss variation, a few pale replacement
 *  tiles, recessed grout and bevelled edges in the normal map. */
export function hexTiles() {
  if (hexCache) return hexCache
  const W = 512
  const H = 444
  const COLS = 8
  const ROWS = 8
  const SQ3 = Math.sqrt(3)
  const height = new Float32Array(W * H)
  const col = new Uint8Array(W * H * 4)
  const orm = new Uint8Array(W * H * 4)
  const inR = SQ3 / 2
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = ((x + 0.5) / W) * COLS * SQ3
      const py = ((y + 0.5) / H) * ROWS * 1.5
      // axial coordinates (pointy-top, circumradius 1)
      const qf = (SQ3 / 3) * px - py / 3
      const rf = (2 / 3) * py
      // cube rounding
      let q = Math.round(qf)
      let r = Math.round(rf)
      const s = Math.round(-qf - rf)
      const dq = Math.abs(q - qf)
      const dr = Math.abs(r - rf)
      const ds = Math.abs(s + qf + rf)
      if (dq > dr && dq > ds) q = -r - s
      else if (dr > ds) r = -q - s
      const cx = SQ3 * (q + r / 2)
      const cy = 1.5 * r
      const dx = px - cx
      const dy = py - cy
      // distance to the nearest edge (edge normals at 0, 60, 120 degrees)
      const e0 = Math.abs(dx)
      const e1 = Math.abs(dx * 0.5 + dy * (SQ3 / 2))
      const e2 = Math.abs(-dx * 0.5 + dy * (SQ3 / 2))
      const edge = inR - Math.max(e0, e1, e2)
      // periodic tile id (offset coords wrapped to the texture period)
      const rowW = ((r % ROWS) + ROWS) % ROWS
      const colW = ((((q + (r - (r & 1)) / 2) % COLS) + COLS) % COLS)
      const h1 = hash2(colW, rowW)
      const h2 = hash2(colW + 91, rowW + 17)
      const grout = edge < 0.05
      const bevel = Math.min(Math.max((edge - 0.05) / 0.09, 0), 1)
      height[y * W + x] = grout ? 0 : 0.35 + 0.65 * (bevel * bevel * (3 - 2 * bevel))
      const i = (y * W + x) * 4
      // tone: near-black ceramic, a few lighter re-flown tiles
      let tone = 30 + h1 * 14
      if (h2 > 0.975) tone = 70 + h1 * 30
      if (grout) tone = 14
      col[i] = tone
      col[i + 1] = tone
      col[i + 2] = tone + 2
      col[i + 3] = 255
      orm[i] = grout ? 150 : 255 // occlusion
      orm[i + 1] = grout ? 235 : Math.round(120 + h2 * 70) // roughness
      orm[i + 2] = 0 // metalness
      orm[i + 3] = 255
    }
  }
  const nrm = new Uint8Array(W * H * 4)
  const strength = 6
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const xl = height[y * W + ((x - 1 + W) % W)]
      const xr = height[y * W + ((x + 1) % W)]
      const yd = height[((y - 1 + H) % H) * W + x]
      const yu = height[((y + 1) % H) * W + x]
      let nx = (xl - xr) * strength
      let ny = (yd - yu) * strength
      let nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l
      ny /= l
      nz /= l
      const i = (y * W + x) * 4
      nrm[i] = Math.round((nx * 0.5 + 0.5) * 255)
      nrm[i + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      nrm[i + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      nrm[i + 3] = 255
    }
  }
  hexCache = {
    map: dataTex(col, W, H, true),
    orm: dataTex(orm, W, H, false),
    normal: dataTex(nrm, W, H, false),
  }
  return hexCache
}

let solarCache: Texture | null = null

/** One solar module: dark blue cells, silver busbars, a thin frame. The GLB
 *  panels are UV-mapped 0..1 per face, so this lands once per panel. */
export function solarCells(): Texture {
  if (solarCache) return solarCache
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#9aa3ad'
  g.fillRect(0, 0, 256, 256)
  const cols = 6
  const rows = 10
  const pad = 6
  const cw = (256 - pad * 2) / cols
  const ch = (256 - pad * 2) / rows
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = hash2(i, j)
      const x = pad + i * cw
      const y = pad + j * ch
      const grd = g.createLinearGradient(x, y, x + cw, y + ch)
      grd.addColorStop(0, `rgb(${16 + v * 8},${26 + v * 10},${58 + v * 18})`)
      grd.addColorStop(1, `rgb(${10 + v * 6},${18 + v * 8},${44 + v * 14})`)
      g.fillStyle = grd
      g.fillRect(x + 1, y + 1, cw - 2, ch - 2)
      g.fillStyle = 'rgba(190,200,215,0.55)'
      g.fillRect(x + cw * 0.33, y + 1, 1, ch - 2)
      g.fillRect(x + cw * 0.66, y + 1, 1, ch - 2)
    }
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  solarCache = t
  return t
}

let glowCache: CanvasTexture | null = null

/** Soft radial falloff for additive glow sprites. */
export function glowTexture(): CanvasTexture {
  if (glowCache) return glowCache
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  glowCache = new CanvasTexture(c)
  return glowCache
}

let brushedCache: DataTexture | null = null

/** Row-streaked roughness (three reads GREEN): rolled stainless sheet. */
export function brushedRoughness(): DataTexture {
  if (brushedCache) return brushedCache
  const size = 256
  const data = new Uint8Array(size * size * 4)
  let seed = 7
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  for (let row = 0; row < size; row++) {
    const base = 0.72 + rnd() * 0.22
    for (let x = 0; x < size; x++) {
      const v = Math.max(0.4, Math.min(1, base + (rnd() - 0.5) * 0.1)) * 255
      const i = (row * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
  }
  brushedCache = dataTex(data, size, size, false)
  return brushedCache
}

let padCache: Texture | null = null

/** Sintered-regolith landing pad seen from above (UV 0..1 across the disc):
 *  mottled deck, scorched centre, a painted ring and alignment ticks. The
 *  pad material tints it per world. */
export function padTexture(): Texture {
  if (padCache) return padCache
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#8f8f8f'
  g.fillRect(0, 0, S, S)
  // mottling: deterministic blotches
  for (let i = 0; i < 900; i++) {
    const x = hash2(i, 1) * S
    const y = hash2(i, 2) * S
    const r = 4 + hash2(i, 3) * 22
    const v = 120 + Math.floor(hash2(i, 4) * 50)
    g.fillStyle = `rgba(${v},${v},${v},0.18)`
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  // sintered tile seams
  g.strokeStyle = 'rgba(60,60,60,0.35)'
  g.lineWidth = 1
  for (let k = 0; k <= S; k += 32) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.stroke()
    g.beginPath(); g.moveTo(0, k); g.lineTo(S, k); g.stroke()
  }
  // engine scorch
  const sc = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.3)
  sc.addColorStop(0, 'rgba(20,18,16,0.85)')
  sc.addColorStop(0.5, 'rgba(30,26,22,0.45)')
  sc.addColorStop(1, 'rgba(30,26,22,0)')
  g.fillStyle = sc
  g.fillRect(0, 0, S, S)
  // painted ring + ticks
  g.strokeStyle = 'rgba(235,235,230,0.75)'
  g.lineWidth = 7
  g.beginPath()
  g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = 6
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    g.beginPath()
    g.moveTo(S / 2 + Math.cos(a) * S * 0.43, S / 2 + Math.sin(a) * S * 0.43)
    g.lineTo(S / 2 + Math.cos(a) * S * 0.48, S / 2 + Math.sin(a) * S * 0.48)
    g.stroke()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  padCache = t
  return t
}
