import {
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  TextureLoader,
  Vector2,
  type Object3D,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { NOISE } from './glsl'
import { brushedRoughness, hexTiles, padTexture, solarCells } from './textures'

// Final look of every Blender-built GLB, keyed by material NAME. The GLBs
// carry plain factors only; everything that makes them read as real hardware
// is enforced here where the glTF exporter cannot drop it:
//   - steel:   brushed stainless with per-ring panel variation and weld seams
//              (object-space, so every ring of a 52 m hull gets its own sheet)
//   - tiles:   hexagonal heat-shield tiles (procedural maps)
//   - dust:    settling on low surfaces and anything facing up (Mars/Moon)
//   - windows/engines: emissive, engine glow driven by a live uniform
export interface ModelContext {
  env: Texture
  envIntensity?: number
  /** 0 = pristine (in flight) .. 1 = heavily dusted. */
  dust?: number
  dustColor?: Color
  /** Object-space metres below which dust accumulates. */
  dustHeight?: number
  /** Shared live uniform for nozzle glow (0..1). */
  engineGlow?: { value: number }
  /** Local regolith colour (berms, covered tunnels). */
  regolith?: Color
  /** Tint multiplied into the landing-pad texture. */
  padTint?: Color
}

let hullNormalCache: Texture | null = null
// CC0 brushed-steel normal map (ambientCG Metal032): fine grain on the hull.
function hullNormal(): Texture {
  if (hullNormalCache) return hullNormalCache
  const t = new TextureLoader().load('/textures/hull-normal.jpg')
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(6, 12)
  t.anisotropy = 8
  hullNormalCache = t
  return t
}

const SEAMS_GLSL = /* glsl */ `
{
  // Stainless rings: every 1.83 m a weld line, one staggered vertical seam per
  // ring, and each ring its own sheet (slightly different gloss and tone).
  float yr = vObjPos.y / 1.83;
  float ring = floor(yr);
  float fy = fract(yr);
  float fw = max(fwidth(yr), 1e-4);
  float contrast = clamp(1.0 - fw * 7.0, 0.0, 1.0);
  float seamH = 1.0 - smoothstep(0.0, max(0.012, fw * 0.9), min(fy, 1.0 - fy));
  float ang = atan(vObjPos.z, vObjPos.x);
  float seamA = fract(sin(ring * 12.9898) * 43758.5453) * 6.2831853 - 3.1415927;
  float dA = abs(mod(ang - seamA + 3.1415927, 6.2831853) - 3.1415927) * 4.5;
  float fwa = max(fwidth(ang) * 4.5, 1e-4);
  float seamV = (1.0 - smoothstep(0.0, max(0.02, fwa * 1.2), dA)) * step(0.06, fy) * step(fy, 0.94);
  float seam = max(seamH, seamV) * contrast;
  float sheet = fract(sin(ring * 78.233 + 1.3) * 43758.5453);
  roughnessFactor = clamp(roughnessFactor * (0.84 + sheet * 0.32) + seam * 0.1, 0.06, 1.0);
  diffuseColor.rgb *= (0.93 + sheet * 0.12) * (1.0 - seam * 0.3);
}
`

const DUST_GLSL = /* glsl */ `
if (uDust > 0.0) {
  vec3 on = normalize(vObjN);
  float low = 1.0 - smoothstep(0.0, uDustH, vObjPos.y);
  float top = smoothstep(0.5, 0.95, on.y);
  float n = vnoise(vObjPos * 1.3) * 0.6 + vnoise(vObjPos * 5.1 + 3.0) * 0.4;
  float d = uDust * clamp(max(low * (0.4 + 0.9 * n), top * 0.85 * n), 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor, d);
  roughnessFactor = mix(roughnessFactor, 0.96, d);
  metalnessFactor = mix(metalnessFactor, 0.0, d);
}
`

interface Extra {
  seams?: boolean
  glow?: boolean
}

function inject(m: MeshStandardMaterial, ctx: ModelContext, extra: Extra) {
  const dustColor = ctx.dustColor ?? new Color('#9a6a4a')
  const uniforms = {
    uDust: { value: ctx.dust ?? 0 },
    uDustColor: { value: dustColor },
    uDustH: { value: ctx.dustHeight ?? 4 },
    uEngineGlow: ctx.engineGlow ?? { value: 0 },
  }
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vObjPos;\nvarying vec3 vObjN;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjN = normal;')
    let frag = shader.fragmentShader.replace(
      'void main() {',
      `varying vec3 vObjPos;
varying vec3 vObjN;
uniform float uDust;
uniform vec3 uDustColor;
uniform float uDustH;
uniform float uEngineGlow;
${NOISE}
void main() {`,
    )
    frag = frag.replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
${extra.seams ? SEAMS_GLSL : ''}
${DUST_GLSL}`,
    )
    if (extra.glow) {
      frag = frag.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.52, 0.24) * uEngineGlow * (0.15 + 1.6 * smoothstep(0.2, 2.8, vObjPos.y));`,
      )
    }
    shader.fragmentShader = frag
  }
  // Distinct program per feature set (onBeforeCompile bodies differ).
  m.customProgramCacheKey = () => `atlas-${extra.seams ? 's' : ''}${extra.glow ? 'g' : ''}`
}

function build(name: string, src: MeshStandardMaterial, ctx: ModelContext): MeshStandardMaterial {
  const envI = ctx.envIntensity ?? 1
  const m = new MeshStandardMaterial({ name, envMap: ctx.env, envMapIntensity: envI })
  const extra: Extra = {}
  switch (true) {
    case name === 'steel': {
      m.color.setRGB(0.68, 0.685, 0.69)
      m.metalness = 1
      m.roughness = 0.46
      m.roughnessMap = brushedRoughness()
      m.normalMap = hullNormal()
      m.normalScale = new Vector2(0.22, 0.22)
      m.envMapIntensity = envI * 1.15
      extra.seams = true
      break
    }
    case name === 'tiles': {
      const t = hexTiles()
      for (const tex of [t.map, t.orm, t.normal]) tex.repeat.set(9, 10.4)
      m.map = t.map
      m.roughnessMap = t.orm
      m.aoMap = t.orm
      m.aoMapIntensity = 0.6
      m.normalMap = t.normal
      m.normalScale = new Vector2(0.45, 0.45)
      m.roughness = 1
      m.metalness = 0.05
      m.envMapIntensity = envI * 0.9
      break
    }
    case name === 'nozzle': {
      m.color.setRGB(0.42, 0.36, 0.31)
      m.metalness = 1
      m.roughness = 0.42
      break
    }
    case name === 'nozzle-inner': {
      m.color.setRGB(0.07, 0.06, 0.055)
      m.metalness = 0.4
      m.roughness = 0.55
      extra.glow = true
      break
    }
    case name === 'engine-dark': {
      m.color.setRGB(0.035, 0.035, 0.04)
      m.metalness = 0.5
      m.roughness = 0.6
      break
    }
    case name === 'window': {
      m.color.setRGB(0.05, 0.04, 0.03)
      m.emissive.setRGB(1.0, 0.7, 0.4)
      m.emissiveIntensity = 2.4
      m.roughness = 0.2
      break
    }
    case name === 'leg' || name === 'footpad': {
      m.color.setRGB(0.16, 0.16, 0.17)
      m.metalness = 0.75
      m.roughness = 0.45
      break
    }
    case name === 'hls-white': {
      m.color.setRGB(0.78, 0.78, 0.77)
      m.metalness = 0
      m.roughness = 0.5
      break
    }
    case name === 'solar': {
      m.map = solarCells()
      m.color.setRGB(1, 1, 1)
      m.metalness = 0.35
      m.roughness = 0.24
      m.envMapIntensity = envI * 1.4
      break
    }
    case name === 'hab-shell': {
      m.color.setRGB(0.74, 0.72, 0.68)
      m.roughness = 0.62
      break
    }
    case name === 'regolith': {
      m.color.copy(ctx.regolith ?? src.color)
      m.roughness = 1
      m.envMapIntensity = envI * 0.5
      break
    }
    case name === 'glass': {
      m.color.setRGB(0.5, 0.56, 0.6)
      m.roughness = 0.06
      m.metalness = 0.2
      m.transparent = true
      m.opacity = 0.42
      m.depthWrite = false
      m.side = DoubleSide
      m.envMapIntensity = envI * 1.6
      break
    }
    case name === 'grow': {
      m.color.setRGB(0.1, 0.05, 0.08)
      m.emissive.setRGB(1.0, 0.42, 0.72)
      m.emissiveIntensity = 1.8
      break
    }
    case name === 'lamp': {
      m.color.setRGB(0.2, 0.2, 0.2)
      m.emissive.setRGB(1.0, 0.9, 0.75)
      m.emissiveIntensity = 3
      break
    }
    case name === 'beacon': {
      m.color.setRGB(0.2, 0.02, 0.02)
      m.emissive.setRGB(1.0, 0.12, 0.06)
      m.emissiveIntensity = 3
      break
    }
    case name === 'pad': {
      m.map = padTexture()
      m.color.copy(ctx.padTint ?? new Color(1, 1, 1))
      m.roughness = 0.92
      m.envMapIntensity = envI * 0.5
      break
    }
    case name === 'tank' || name === 'dish' || name === 'rover-body': {
      m.color.setRGB(0.8, 0.8, 0.78)
      m.roughness = 0.38
      m.metalness = 0.05
      break
    }
    case name === 'radiator': {
      m.color.setRGB(0.86, 0.87, 0.88)
      m.roughness = 0.25
      break
    }
    case name === 'pipe' || name === 'rib': {
      m.color.setRGB(0.6, 0.61, 0.63)
      m.metalness = 0.9
      m.roughness = 0.38
      break
    }
    case name === 'frame': {
      m.color.setRGB(0.26, 0.27, 0.29)
      m.metalness = 0.8
      m.roughness = 0.45
      break
    }
    case name === 'crate': {
      m.color.setRGB(0.7, 0.36, 0.12)
      m.roughness = 0.6
      break
    }
    case name === 'tire' || name === 'dark': {
      m.color.setRGB(0.04, 0.04, 0.045)
      m.roughness = 0.85
      m.metalness = name === 'dark' ? 0.4 : 0
      break
    }
    default: {
      m.color.copy(src.color)
      m.metalness = src.metalness
      m.roughness = src.roughness
      if (src.emissive && src.emissive.getHex() !== 0) {
        m.emissive.copy(src.emissive)
        m.emissiveIntensity = Math.min(src.emissiveIntensity, 3)
      }
      m.transparent = src.transparent
      m.opacity = src.opacity
    }
  }
  inject(m, ctx, extra)
  return m
}

/** Replace every mesh material in `root` with its tuned version (one tuned
 *  material per source name per call) and enable shadows. */
export function applyMaterials(root: Object3D, ctx: ModelContext, shadows = true) {
  const made = new Map<string, MeshStandardMaterial>()
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const out = mats.map((mm) => {
      const src = mm as MeshStandardMaterial
      const key = src.name || 'default'
      let m = made.get(key)
      if (!m) {
        m = build(key, src, ctx)
        made.set(key, m)
      }
      return m
    })
    mesh.material = Array.isArray(mesh.material) ? out : out[0]
    mesh.castShadow = shadows
    mesh.receiveShadow = shadows
  })
}
