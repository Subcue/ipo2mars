/** @jsxImportSource react */
import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Matrix4, type Texture } from 'three'
import { flatAt, heightAt, type TerrainSpec } from './heightfield'
import { groundDetail } from './detailTexture'
import { makePlanetMaterial, type PlanetUniforms } from '../planets/planetMaterial'
import type { SurfaceLook } from '../planets/surfaceGlsl'
import { BASE_SCALE } from '../stage'
import { QUALITY } from '../quality'

// The ground under a base: a displaced spherical cap in base-local space
// (origin on the surface, +Y the local up, planet centre at (0, -R, 0)).
// Rings are spaced quadratically so vertices bunch up where the camera
// looks; relief fades to zero at the rim, and the planet sphere cuts a hole
// just inside it, so the patch takes over seamlessly (same map, same
// procedural detail, same haze).
function buildGeometry(spec: TerrainSpec, R: number): BufferGeometry {
  const rings = QUALITY.terrainRings
  const segs = QUALITY.terrainSegs
  const s = BASE_SCALE
  const count = 1 + rings * segs
  const pos = new Float32Array(count * 3)
  const flat = new Float32Array(count)
  const put = (i: number, xm: number, zm: number) => {
    const h = heightAt(spec, xm, zm)
    flat[i] = flatAt(spec, xm, zm)
    const x = xm * s
    const z = zm * s
    const inv = 1 / Math.sqrt(x * x + R * R + z * z)
    const rr = R + h * s
    pos[i * 3] = x * inv * rr
    pos[i * 3 + 1] = R * inv * rr - R
    pos[i * 3 + 2] = z * inv * rr
  }
  put(0, 0, 0)
  for (let r = 1; r <= rings; r++) {
    const rad = spec.extent * Math.pow(r / rings, 2)
    for (let k = 0; k < segs; k++) {
      const a = ((k + (r % 2) * 0.5) / segs) * Math.PI * 2
      put(1 + (r - 1) * segs + k, Math.cos(a) * rad, Math.sin(a) * rad)
    }
  }
  const idx: number[] = []
  for (let k = 0; k < segs; k++) idx.push(0, 1 + ((k + 1) % segs), 1 + k)
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs
    const b0 = 1 + r * segs
    for (let k = 0; k < segs; k++) {
      const k1 = (k + 1) % segs
      idx.push(a0 + k, a0 + k1, b0 + k1)
      idx.push(a0 + k, b0 + k1, b0 + k)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(count * 2), 2))
  g.setAttribute('aFlat', new BufferAttribute(flat, 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

export interface TerrainPatchProps {
  spec: TerrainSpec
  radius: number
  map: Texture
  look: SurfaceLook
  /** base-local -> planet sphere object space (for map + detail lookups). */
  baseToPlanet: Matrix4
  /** Receives the live uniforms (haze is driven per frame by the body). */
  onUniforms?: (u: PlanetUniforms) => void
  tracks?: number[][]
  /** Sky/ground fill so shadows are not pure black. */
  env?: Texture
  envIntensity?: number
}

export function TerrainPatch({ spec, radius, map, look, baseToPlanet, onUniforms, tracks = [], env, envIntensity = 0.4 }: TerrainPatchProps) {
  const geo = useMemo(() => buildGeometry(spec, radius), [spec, radius])
  const { material, uniforms } = useMemo(() => {
    const made = makePlanetMaterial({
      map,
      radius,
      look,
      octaves: QUALITY.terrainOctaves,
      patch: { scale: BASE_SCALE, tracks, detail: groundDetail(spec.kind) },
    })
    if (env) {
      made.material.envMap = env
      made.material.envMapIntensity = envIntensity
    }
    return made
  }, [map, radius, look, tracks, env, envIntensity, spec.kind])
  uniforms.uBaseToPlanet.value.copy(baseToPlanet)
  uniforms.uPlanetToObj.value.setFromMatrix4(baseToPlanet).transpose()
  useEffect(() => {
    onUniforms?.(uniforms)
  }, [uniforms, onUniforms])
  // Receives shadows from vehicles, structures and boulders; does not cast
  // (its facets would print jagged shadows; slope shading carries relief).
  return <mesh geometry={geo} material={material} receiveShadow />
}
