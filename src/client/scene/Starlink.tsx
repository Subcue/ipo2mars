/** @jsxImportSource react */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3 } from 'three'
import { propagate, type SatRec } from 'satellite.js'
import { parseTle, EARTH_RADIUS_KM } from '../lib/satellites'
import { STILL, FIXED_DATE } from './debug'
import { SUN_DIR } from './sunlight'

const UPDATE_INTERVAL = 1 // seconds — LEO sats move ~7.5 km/s, invisible per frame

// Each satellite is a soft point glint. The vertex shader tests the point
// against Earth's shadow cylinder: sunlit satellites sparkle, the ones
// crossing the night side dim to a faint trace, like the real sky.
const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uSun;
uniform float uR;
uniform float uPixelRatio;
uniform float uSize;
varying float vLit;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 p = wp.xyz - center;
  float ps = dot(p, uSun);
  float lit = 1.0;
  if (ps < 0.0) lit = smoothstep(0.985, 1.015, length(p - ps * uSun) / uR);
  vLit = lit;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 1e-3);
  gl_PointSize = uSize * uPixelRatio * (0.7 + 0.5 * lit) * clamp(3.6 * uR / dist, 0.55, 1.6);
  #include <logdepthbuf_vertex>
}
`

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vLit;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 14.0);
  vec3 col = mix(vec3(0.22, 0.3, 0.46) * 0.22, vec3(0.86, 0.94, 1.0) * 1.1, vLit);
  gl_FragColor = vec4(col * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

interface StarlinkProps {
  count?: number
  radius?: number
  onCount?: (n: number) => void
}

export function Starlink({ count = 2600, radius = 1, onCount }: StarlinkProps) {
  const recsRef = useRef<SatRec[]>([])
  const lastUpdate = useRef(-99)
  const dpr = useThree((s) => s.viewport.dpr)

  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    g.setDrawRange(0, 0) // hidden until the feed arrives
    return g
  }, [count])

  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uSun: { value: new Vector3().copy(SUN_DIR) },
          uR: { value: radius },
          uPixelRatio: { value: 1 },
          uSize: { value: 2.1 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [radius],
  )
  mat.uniforms.uPixelRatio.value = dpr

  useEffect(() => {
    let alive = true
    fetch(`/api/tle/starlink?max=${count}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((text) => {
        if (!alive) return
        recsRef.current = parseTle(text)
        lastUpdate.current = -99
        onCount?.(recsRef.current.length)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [count, onCount])

  useFrame((state) => {
    if (recsRef.current.length === 0) return
    const t = state.clock.elapsedTime
    if (t - lastUpdate.current < UPDATE_INTERVAL) return
    lastUpdate.current = t

    const date = STILL ? FIXED_DATE : new Date()
    const scale = radius / EARTH_RADIUS_KM
    const attr = geo.getAttribute('position') as BufferAttribute
    const arr = attr.array as Float32Array
    let n = 0
    for (const rec of recsRef.current) {
      if (n >= count) break
      const { position } = propagate(rec, date)
      if (!position || typeof position !== 'object') continue
      // ECI (z = north pole) -> three.js (y = up), preserving handedness.
      arr[n * 3] = position.x * scale
      arr[n * 3 + 1] = position.z * scale
      arr[n * 3 + 2] = -position.y * scale
      n++
    }
    attr.needsUpdate = true
    geo.setDrawRange(0, n)
    geo.computeBoundingSphere()
  })

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />
}
