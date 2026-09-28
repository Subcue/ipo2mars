import {
  Color,
  CustomBlending,
  DataTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  BufferAttribute,
  type Camera,
} from 'three'
import { SUN_DIR } from '../../scene/sunlight'

// Exhaust, steam and vapour as lit billboards: a few hundred puffs, simulated
// on the CPU (drag, buoyancy, wind, growth), depth-sorted every frame and
// drawn in one instanced call with premultiplied alpha. Each puff samples a
// baked "cauliflower" (union-of-spheres normals + eroded density) so it
// shades as a lumpy volume: sunlit side bright, the far side and the dense
// core darker, the underside warmed by the flame when it is close, and a soft
// fade where it meets the ground (no hard intersection line).

const CELL = 128

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967295
  }
}

let puffTex: DataTexture | null = null

/** 2 x 2 atlas of puff variants: RGB = normal (quad space), A = density. */
function puffAtlas(): DataTexture {
  if (puffTex) return puffTex
  const W = CELL * 2
  const data = new Uint8Array(W * W * 4)
  const rnd = lcg(4711)
  // periodic value noise (wraps, so any coordinate is safe)
  const G = 32
  const grid = new Float32Array(G * G)
  for (let i = 0; i < grid.length; i++) grid[i] = rnd()
  const at = (i: number, j: number) => grid[(((j % G) + G) % G) * G + (((i % G) + G) % G)]
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    let tx = x - ix
    let ty = y - iy
    tx = tx * tx * (3 - 2 * tx)
    ty = ty * ty * (3 - 2 * ty)
    const a = at(ix, iy)
    const b = at(ix + 1, iy)
    const c = at(ix, iy + 1)
    const d = at(ix + 1, iy + 1)
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
  }
  const fbm = (x: number, y: number) =>
    0.5 * noise(x * 5, y * 5) + 0.27 * noise(x * 11 + 3.1, y * 11 + 1.7) + 0.15 * noise(x * 23 + 5.3, y * 23 + 7.9) + 0.08 * noise(x * 47 + 1.3, y * 47 + 9.1)
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * CELL
    const oy = Math.floor(cell / 2) * CELL
    const blobs: [number, number, number][] = []
    const k = 7 + Math.floor(rnd() * 4)
    for (let i = 0; i < k; i++) {
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(rnd()) * 0.15
      blobs.push([0.5 + Math.cos(a) * r, 0.49 + Math.sin(a) * r * 0.8, 0.1 + rnd() * 0.1])
    }
    // cauliflower: small lumps around the rim, bunched toward the top
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2
      const r = 0.2 + rnd() * 0.07
      blobs.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r * 0.85 + 0.03 * Math.max(0, Math.sin(a)), 0.035 + rnd() * 0.05])
    }
    const off = cell * 3.7
    const h = new Float32Array(CELL * CELL)
    const dens = new Float32Array(CELL * CELL)
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const u = (x + 0.5) / CELL
        const v = (y + 0.5) / CELL
        // smooth union of spheres (no creases where lumps meet)
        let sum = 0
        let soft = 0
        for (const [bx, by, br] of blobs) {
          const dx = u - bx
          const dy = v - by
          const d2 = dx * dx + dy * dy
          const q = br * br - d2
          if (q > 0) sum += Math.exp(Math.sqrt(q) / 0.018)
          soft += Math.exp(-d2 / (br * br * 0.6))
        }
        const top = sum > 0 ? Math.max(0, 0.018 * Math.log(sum)) : 0
        const n = fbm(u + off, v + off * 0.7)
        const i = y * CELL + x
        h[i] = top + (n - 0.5) * 0.03
        let dd = sm(0.03, 0.9, soft) * (0.75 + 0.25 * n)
        dd = Math.min(1, Math.max(0, (dd - (1 - n) * 0.3) * 1.5))
        const edge = Math.hypot(u - 0.5, v - 0.5)
        dens[i] = dd * (1 - sm(0.38, 0.49, edge))
      }
    }
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const i = y * CELL + x
        const hx = (h[y * CELL + Math.min(CELL - 1, x + 1)] - h[y * CELL + Math.max(0, x - 1)]) * CELL * 0.5
        const hy = (h[Math.min(CELL - 1, y + 1) * CELL + x] - h[Math.max(0, y - 1) * CELL + x]) * CELL * 0.5
        let nx = -hx * 1.3
        let ny = -hy * 1.3
        let nz = 1
        const l = Math.hypot(nx, ny, nz)
        nx /= l
        ny /= l
        nz /= l
        const o = ((oy + y) * W + ox + x) * 4
        data[o] = Math.round((nx * 0.5 + 0.5) * 255)
        data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255)
        data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255)
        data[o + 3] = Math.round(dens[i] * 255)
      }
    }
  }
  const t = new DataTexture(data, W, W, RGBAFormat, UnsignedByteType)
  t.generateMipmaps = true
  t.minFilter = LinearMipmapLinearFilter
  t.magFilter = LinearFilter
  t.needsUpdate = true
  puffTex = t
  return t
}

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 iPos;
attribute float iSize;
attribute float iAlpha;
attribute float iSeed;
attribute float iHeat;
attribute float iTone;
uniform float uScale;
uniform vec3 uUpView;
varying vec2 vUv;
varying float vAlpha;
varying float vHeat;
varying float vTone;
varying float vH;
varying float vSeed;
varying mat2 vRot;
void main() {
  float ang = iSeed * 6.2832;
  mat2 R = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
  vec2 c = R * position.xy;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += c * iSize * uScale;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 0.5 + 0.5;
  vRot = R;
  vAlpha = iAlpha;
  vHeat = iHeat;
  vTone = iTone;
  vSeed = iSeed;
  vH = iPos.y + dot(c * iSize, uUpView.xy);
  #include <logdepthbuf_vertex>
}
`

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uPuff;
uniform vec3 uSunView;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uHeatCol;
uniform float uGround;
varying vec2 vUv;
varying float vAlpha;
varying float vHeat;
varying float vTone;
varying float vH;
varying float vSeed;
varying mat2 vRot;
void main() {
  #include <logdepthbuf_fragment>
  float cell = floor(fract(vSeed * 7.13) * 4.0);
  vec2 uv = (vUv + vec2(mod(cell, 2.0), floor(cell * 0.5))) * 0.5;
  vec4 tx = texture2D(uPuff, uv);
  float d = tx.a;
  float a = d * vAlpha * smoothstep(0.0, 5.0, vH - uGround);
  if (a < 0.004) discard;
  vec3 n = tx.rgb * 2.0 - 1.0;
  n.xy = vRot * n.xy;
  n = normalize(n);
  float ndl = dot(n, uSunView);
  float lit = clamp(ndl * 0.55 + 0.5, 0.0, 1.0);
  lit *= mix(1.0, 0.5, d * (1.0 - clamp(ndl + 0.3, 0.0, 1.0)));
  vec3 alb = vec3(0.8, 0.79, 0.77) * vTone;
  vec3 col = alb * (uSunCol * lit + uSkyCol * (0.55 + 0.3 * n.y));
  col += uHeatCol * vHeat * (0.35 + 0.65 * d) * (0.6 + 0.4 * max(-n.y, 0.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`

export interface PuffInit {
  x: number
  y: number
  z: number
  vx?: number
  vy?: number
  vz?: number
  /** Start and final radius (metres), lifetime (s). */
  s0: number
  s1: number
  life: number
  /** Opacity, drag (1/s), buoyancy (m/s^2), albedo. */
  alpha?: number
  drag?: number
  rise?: number
  tone?: number
}

interface Puff extends Required<PuffInit> {
  age: number
  seed: number
  heat: number
}

export class Smoke {
  readonly mesh: Mesh
  private puffs: Puff[] = []
  private readonly cap: number
  private readonly geo: InstancedBufferGeometry
  private readonly mat: ShaderMaterial
  private readonly rnd = lcg(99)
  private readonly order: number[] = []
  private readonly tmp = { cam: new Vector3(), fwd: new Vector3(), inv: new Matrix4(), up: new Vector3() }

  constructor(cap: number, scale: number) {
    this.cap = cap
    const g = new InstancedBufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    const inst = (name: string, size: number) => {
      const a = new InstancedBufferAttribute(new Float32Array(cap * size), size)
      a.setUsage(DynamicDrawUsage)
      g.setAttribute(name, a)
    }
    inst('iPos', 3)
    inst('iSize', 1)
    inst('iAlpha', 1)
    inst('iSeed', 1)
    inst('iHeat', 1)
    inst('iTone', 1)
    g.instanceCount = 0
    this.geo = g
    this.mat = new ShaderMaterial({
      uniforms: {
        uPuff: { value: puffAtlas() },
        uScale: { value: scale },
        uUpView: { value: new Vector3(0, 1, 0) },
        uSunView: { value: new Vector3(0, 0, 1) },
        uSunCol: { value: new Color(2.6, 2.45, 2.2) },
        uSkyCol: { value: new Color(0.42, 0.52, 0.68) },
        uHeatCol: { value: new Color(3.4, 1.35, 0.4) },
        uGround: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    })
    this.mesh = new Mesh(g, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
  }

  /** Lighting for the setting (linear colours): sunlight and sky fill. */
  setLighting(sun: Color, sky: Color) {
    this.mat.uniforms.uSunCol.value.copy(sun)
    this.mat.uniforms.uSkyCol.value.copy(sky)
    return this
  }

  get count() {
    return this.puffs.length
  }

  clear() {
    this.puffs.length = 0
    this.geo.instanceCount = 0
  }

  emit(p: PuffInit) {
    if (this.puffs.length >= this.cap) {
      // recycle the oldest
      let oldest = 0
      for (let i = 1; i < this.puffs.length; i++) if (this.puffs[i].age / this.puffs[i].life > this.puffs[oldest].age / this.puffs[oldest].life) oldest = i
      this.puffs.splice(oldest, 1)
    }
    this.puffs.push({
      vx: 0,
      vy: 0,
      vz: 0,
      alpha: 0.9,
      drag: 0.3,
      rise: 0,
      tone: 1,
      ...p,
      age: 0,
      seed: this.rnd(),
      heat: 0,
    })
  }

  /** Advance the sim; `heat(x, y, z)` gives the flame glow at a point. */
  step(dt: number, wind: Vector3, heat: (x: number, y: number, z: number) => number, ground = 0) {
    const out: Puff[] = []
    for (const p of this.puffs) {
      p.age += dt
      if (p.age >= p.life) continue
      const k = Math.exp(-p.drag * dt)
      p.vx = p.vx * k + wind.x * (1 - k)
      p.vz = p.vz * k + wind.z * (1 - k)
      p.vy = p.vy * k + p.rise * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      // spread along the ground instead of through it
      const floor = ground + this.size(p) * 0.35
      if (p.y < floor) {
        p.y += (floor - p.y) * Math.min(1, dt * 3)
        if (p.vy < 0) p.vy *= 0.5
      }
      p.heat = heat(p.x, p.y, p.z)
      out.push(p)
    }
    this.puffs = out
    this.mat.uniforms.uGround.value = ground
  }

  private size(p: Puff) {
    return p.s0 + (p.s1 - p.s0) * Math.sqrt(Math.min(1, p.age / p.life))
  }

  /** Write sorted instance data; `toSite` is the site group's inverse world matrix. */
  update(camera: Camera, toSite: Matrix4) {
    const t = this.tmp
    t.cam.copy(camera.position).applyMatrix4(toSite)
    camera.getWorldDirection(t.fwd)
    t.fwd.transformDirection(toSite)
    const n = this.puffs.length
    this.order.length = n
    const depth = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const p = this.puffs[i]
      depth[i] = (p.x - t.cam.x) * t.fwd.x + (p.y - t.cam.y) * t.fwd.y + (p.z - t.cam.z) * t.fwd.z
      this.order[i] = i
    }
    this.order.sort((a, b) => depth[b] - depth[a])
    const g = this.geo
    const pos = g.getAttribute('iPos') as InstancedBufferAttribute
    const size = g.getAttribute('iSize') as InstancedBufferAttribute
    const alpha = g.getAttribute('iAlpha') as InstancedBufferAttribute
    const seed = g.getAttribute('iSeed') as InstancedBufferAttribute
    const heat = g.getAttribute('iHeat') as InstancedBufferAttribute
    const tone = g.getAttribute('iTone') as InstancedBufferAttribute
    let m = 0
    for (const i of this.order) {
      const p = this.puffs[i]
      if (depth[i] < -this.size(p)) continue // behind the camera
      pos.setXYZ(m, p.x, p.y, p.z)
      size.setX(m, this.size(p))
      const fin = Math.min(1, p.age / 0.4) * (1 - smoothstep(p.life * 0.5, p.life, p.age))
      alpha.setX(m, p.alpha * fin)
      seed.setX(m, p.seed)
      heat.setX(m, p.heat)
      tone.setX(m, p.tone)
      m++
    }
    for (const a of [pos, size, alpha, seed, heat, tone]) a.needsUpdate = true
    g.instanceCount = m
    // lighting in view space
    const u = this.mat.uniforms
    u.uSunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse)
    u.uUpView.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse)
  }

  dispose() {
    this.geo.dispose()
    this.mat.dispose()
  }
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
