/** @jsxImportSource react */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color, MeshStandardMaterial, type Mesh, type Vector3, type WebGLProgramParametersWithUniforms } from 'three'
import { vnoise2 } from './heightfield'
import { SURFACE_GLSL } from '../planets/surfaceGlsl'

// Distant mountains on a small planet: a crater rim or range standing beyond
// the terrain's own horizon, built as a ring on the curved surface (base-local
// metres, planet centre at (0, -R, 0)) whose crest is a noise silhouette. It
// takes the same aerial haze as the ground, heavier with distance, so it reads
// as kilometres away: the sense of a vast basin around the base.
interface Props {
  /** Planet radius in base metres (1 / (2 curve)). */
  planetR: number
  /** Ring radius (metres) and crest height range above the local surface. */
  radius: number
  minH: number
  maxH: number
  seed: number
  color: string
  /** Live haze: display-space colour and per-stage-unit density. */
  haze: () => { color: Color; k: number }
  /** Hide beyond this camera distance (stage units) from `center()`. */
  center: () => Vector3
  hideBeyond: number
  /** Erosion relief and strata strength (airless worlds read flatter). */
  relief?: number
  /** Crest raggedness: 1 = sharp ranges, ~0.2 = old, rounded massifs. */
  rough?: number
}

/** Value noise around the ring with `cycles` features per turn, seamless:
 *  sampled on a circle in the noise plane rather than along a line. */
function ringNoise(a: number, cycles: number, sx: number, sy: number): number {
  const r = cycles / (Math.PI * 2)
  return vnoise2(sx + Math.cos(a) * r, sy + Math.sin(a) * r)
}

export function HorizonRidge({ planetR, radius, minH, maxH, seed, color, haze, center, hideBeyond, relief = 1, rough = 1 }: Props) {
  const geo = useMemo(() => {
    const segs = 360
    const rows = [
      [0, -40, 0],
      [260, 0.55, 1],
      [700, 1, 1],
      [1400, 0.35, 1],
    ] as const
    const pos = new Float32Array(segs * rows.length * 3)
    const surf = (r: number) => Math.sqrt(planetR * planetR - r * r) - planetR
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2
      // a ragged crest: broad ranges, gaps, and sharp peaks
      const n =
        ringNoise(a, 9, seed, seed * 0.3) * (0.5 + 0.15 * (1 - rough)) +
        ringNoise(a, 31, seed * 2, 3.1) * 0.27 +
        (ringNoise(a, 97, 0, seed) * 0.1 + ringNoise(a, 260, 7, seed + 7) * 0.05) * rough
      const crest = minH + (maxH - minH) * Math.pow(Math.max(0, n * 1.25 - 0.18), 1.4)
      rows.forEach(([dr, f, use], j) => {
        const r = radius + dr
        const y = surf(r) + (use ? crest * f : f)
        const i = (k * rows.length + j) * 3
        pos[i] = Math.cos(a) * r
        pos[i + 1] = y
        pos[i + 2] = Math.sin(a) * r
      })
    }
    // closed ring: the last column joins the first (no seam in shape or normals)
    const idx: number[] = []
    for (let k = 0; k < segs; k++) {
      for (let j = 0; j < rows.length - 1; j++) {
        const a = k * rows.length + j
        const b = ((k + 1) % segs) * rows.length + j
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }, [planetR, radius, minH, maxH, seed, rough])
  const { mat, u } = useMemo(() => {
    const u = { uHazeColor: { value: new Color() }, uHazeK: { value: 0 }, uRelief: { value: relief } }
    const mat = new MeshStandardMaterial({ color: new Color(color), roughness: 1, metalness: 0 })
    mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vRObj;\nvarying vec3 vR2V0;\nvarying vec3 vR2V1;\nvarying vec3 vR2V2;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vRObj = position;
// normalMatrix also carries the inverse of the base's metre scale: keep only its rotation
vR2V0 = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
vR2V1 = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
vR2V2 = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform vec3 uHazeColor;
uniform float uHazeK;
uniform float uRelief;
varying vec3 vRObj;
varying vec3 vR2V0;
varying vec3 vR2V1;
varying vec3 vR2V2;
${SURFACE_GLSL}
void main() {
  // eroded flanks: gullies running downhill, strata, scree
  vec3 q = vRObj * vec3(1.0 / 140.0, 1.0 / 60.0, 1.0 / 140.0);
  vec4 g1 = vnoiseD(q);
  vec4 g2 = vnoiseD(q * 2.7 + 5.0);
  vec4 g3 = vnoiseD(vRObj / 22.0 + 11.0);
  vec3 rGrad = g1.yzw * vec3(1.0 / 140.0, 1.0 / 60.0, 1.0 / 140.0) * 90.0 + g2.yzw * vec3(2.7 / 140.0, 2.7 / 60.0, 2.7 / 140.0) * 45.0 + g3.yzw / 22.0 * 12.0;
  float strata = 0.5 + 0.5 * sin(vRObj.y / 38.0 + g1.x * 3.0);`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  diffuseColor.rgb *= 1.0 + (0.12 * g2.x + 0.06 * strata - 0.09) * uRelief;`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
  {
    vec3 G = mat3(vR2V0, vR2V1, vR2V2) * rGrad;
    normal = normalize(normal - (G - normal * dot(G, normal)) * 0.9 * uRelief);
  }`,
        )
        .replace(
          '#include <fog_fragment>',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, 1.0 - exp(-length(vViewPosition) * uHazeK * 2.6));',
        )
    }
    mat.customProgramCacheKey = () => 'horizon-ridge'
    return { mat, u }
  }, [color, relief])
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])
  const mesh = useRef<Mesh>(null)
  useFrame(({ camera }) => {
    const h = haze()
    u.uHazeColor.value.copy(h.color)
    u.uHazeK.value = h.k
    if (mesh.current) mesh.current.visible = camera.position.distanceTo(center()) < hideBeyond
  })
  return <mesh ref={mesh} geometry={geo} material={mat} />
}
