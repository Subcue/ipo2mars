import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import {
  DataTexture,
  MeshStandardMaterial,
  PMREMGenerator,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  type Group,
  type Texture,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

let envCache: Texture | null = null
let brushedCache: DataTexture | null = null
let hullNormalCache: Texture | null = null
let deckCache: { color: Texture; normal: Texture } | null = null

// CC0 brushed-steel normal map (ambientCG Metal032), tiled around the hull for
// fine surface grain the procedural roughness can't give. Loaded once, shared.
function hullNormal(): Texture {
  if (hullNormalCache) return hullNormalCache
  const t = new TextureLoader().load('/textures/hull-normal.jpg')
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(5, 9)
  t.anisotropy = 8
  hullNormalCache = t
  return t
}

// CC0 concrete (ambientCG Concrete034) for landing-pad decks. Color multiplies
// the GLB's per-base deck tint, so Mars reads warm and the Moon reads grey.
function deckTextures(): { color: Texture; normal: Texture } {
  if (deckCache) return deckCache
  const loader = new TextureLoader()
  const color = loader.load('/textures/deck-concrete.jpg')
  const normal = loader.load('/textures/deck-concrete-normal.jpg')
  color.colorSpace = SRGBColorSpace
  for (const t of [color, normal]) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(4, 4)
    t.anisotropy = 8
  }
  deckCache = { color, normal }
  return deckCache
}

// One shared PMREM studio environment for the Blender-built models. Applied
// PER MATERIAL (not scene.environment) so the Earth's night side stays dark
// while steel hulls get real reflections.
export function useStudioEnv(): Texture {
  const gl = useThree((s) => s.gl)
  return useMemo(() => {
    if (!envCache) {
      const pmrem = new PMREMGenerator(gl)
      envCache = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      pmrem.dispose()
    }
    return envCache
  }, [gl])
}

// Row-streaked roughness map (three reads the GREEN channel): rolled/brushed
// stainless under reflections. Deterministic LCG, no Math.random.
function brushedRoughness(): DataTexture {
  if (brushedCache) return brushedCache
  const size = 256
  const data = new Uint8Array(size * size * 4)
  let seed = 7
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  for (let row = 0; row < size; row++) {
    const base = 0.5 + rnd() * 0.3 // mid-rough streak bands
    for (let x = 0; x < size; x++) {
      const v = Math.max(0.25, Math.min(0.95, base + (rnd() - 0.5) * 0.12)) * 255
      const i = (row * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.needsUpdate = true
  brushedCache = tex
  return tex
}

// Final material tuning by Blender material name. The GLBs ship plain
// factors; the look (metal punch, brushed map, ceramic sheen) is enforced
// here so it cannot be lost in glTF export translation.
function tune(m: MeshStandardMaterial, env: Texture) {
  m.envMap = env
  const name = m.name
  if (name === 'steel' || name === 'booster-steel') {
    m.metalness = 1
    m.roughness = 0.55 // scaled down by the map's green channel per-texel
    m.roughnessMap = brushedRoughness()
    m.normalMap = hullNormal()
    m.normalScale = new Vector2(0.28, 0.28) // subtle grain, not noise
    m.envMapIntensity = 1.9
    m.color.setRGB(0.95, 0.96, 1.0)
  } else if (name === 'tiles') {
    // Glossy black ceramic: visible specular sheen, faint mirror of the env.
    m.metalness = 0.2
    m.roughness = 0.3
    m.envMapIntensity = 1.2
    m.color.setRGB(0.03, 0.03, 0.035)
  } else if (name.startsWith('weld-steel')) {
    m.metalness = 1
    m.roughness = 0.5
    m.envMapIntensity = 1.4
  } else if (name === 'deck') {
    const t = deckTextures()
    m.map = t.color
    m.normalMap = t.normal
    m.normalScale = new Vector2(0.6, 0.6)
    m.roughness = 0.95
    m.metalness = 0
    m.envMapIntensity = 0.4
  } else {
    m.envMapIntensity = 1.0
  }
  m.needsUpdate = true
}

// Clone a GLB scene (so multiple instances don't share transforms) and tune
// every standard material. Draco/meshopt decoders are explicitly OFF: our
// GLBs are uncompressed, and the decoders' WASM (and draco's CDN fetch)
// would violate the site CSP.
export function useModel(path: string): Group {
  const { scene } = useGLTF(path, false, false)
  const env = useStudioEnv()
  return useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((node) => {
      const mesh = node as { material?: MeshStandardMaterial | MeshStandardMaterial[] }
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const m of mats) {
        if (m instanceof MeshStandardMaterial) tune(m, env)
      }
    })
    return clone
  }, [scene, env])
}

useGLTF.preload('/models/starship.glb', false, false)
useGLTF.preload('/models/booster.glb', false, false)
useGLTF.preload('/models/moonbase.glb', false, false)
useGLTF.preload('/models/marsbase.glb', false, false)
