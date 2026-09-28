/** @jsxImportSource react */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, IcosahedronGeometry, MeshStandardMaterial, Object3D, type InstancedMesh } from 'three'
import { heightAt, vnoise2, type TerrainSpec } from './heightfield'
import { BASE_SCALE } from '../stage'
import { QUALITY } from '../quality'

// Boulder field around a base: one lumpy rock mesh, instanced a couple of
// thousand times with power-law sizes, denser near crater rims, kept off the
// graded pads and roads, seated into the terrain (CPU heights match the
// patch). They catch the low sun and throw long shadows: most of what makes
// ground read as ground at this range.
function rockGeometry() {
  const g = new IcosahedronGeometry(1, 2)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const n = 0.72 + 0.5 * vnoise2(x * 2.1 + z * 1.3 + 5, y * 2.4 - z * 0.7 + 3)
    // flatter than tall, like weathered boulders
    p.setXYZ(i, x * n * 1.15, y * n * 0.62, z * n)
  }
  g.computeVertexNormals()
  return g
}

export function Rocks({
  spec,
  radius,
  color,
  count = QUALITY.rocks,
  seed = 11,
  env,
}: {
  spec: TerrainSpec
  radius: number
  color: string
  count?: number
  seed?: number
  env?: import('three').Texture
}) {
  const ref = useRef<InstancedMesh>(null)
  const geo = useMemo(rockGeometry, [])
  const mat = useMemo(
    () => new MeshStandardMaterial({ color: new Color(color), roughness: 0.95, metalness: 0, envMap: env ?? null, envMapIntensity: 0.6 }),
    [color, env],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    let s = seed >>> 0
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 4294967295
    }
    const d = new Object3D()
    const S = BASE_SCALE
    const R = radius
    let n = 0
    let guard = 0
    while (n < count && guard++ < count * 8) {
      // denser toward the base (where the camera is), thinning outward
      const a = rnd() * Math.PI * 2
      const r = 40 + Math.pow(rnd(), 1.6) * spec.extent * 0.45
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      let blocked = false
      for (const f of spec.flats) {
        if (Math.hypot(x - f.x, z - f.z) < f.r * 1.08 + 6) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      // clumped: skip where a low-frequency mask says "sand"
      if (vnoise2(x / 140 + 3, z / 140 - 2) < 0.38 && rnd() < 0.7) continue
      const size = 0.5 + Math.pow(rnd(), 5) * 9
      const h = heightAt(spec, x, z) - size * 0.28
      const xs = x * S
      const zs = z * S
      const inv = 1 / Math.sqrt(xs * xs + R * R + zs * zs)
      const rr = R + h * S
      d.position.set(xs * inv * rr, R * inv * rr - R, zs * inv * rr)
      d.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5)
      const k = size * S
      d.scale.set(k * (0.8 + rnd() * 0.5), k * (0.7 + rnd() * 0.6), k * (0.8 + rnd() * 0.5))
      d.updateMatrix()
      mesh.setMatrixAt(n++, d.matrix)
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [spec, radius, count, seed])

  return <instancedMesh ref={ref} args={[geo, mat, count]} castShadow receiveShadow />
}
