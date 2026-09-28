/** @jsxImportSource react */
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, DoubleSide, BufferAttribute, BufferGeometry, ShaderMaterial, Vector2 } from 'three'
import { TRANSIT_CURVE } from './route'
import { STILL } from '../../scene/debug'

// The Earth<->Mars cycler drawn as a hairline of constant screen width with
// light pulses flowing along it in the direction of travel, fading out near
// both planets. A map of a working route, not a tube: it never gets fat up
// close and never stacks into a band end-on. Overview only (the caller
// unmounts it elsewhere).
const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aNext;
attribute float aSide;
attribute float aT;
uniform vec2 uRes;
uniform float uWidth;
varying float vT;
varying float vSide;
void main() {
  vec4 c0 = projectionMatrix * viewMatrix * vec4(position, 1.0);
  vec4 c1 = projectionMatrix * viewMatrix * vec4(aNext, 1.0);
  vec2 s0 = c0.xy / c0.w * uRes;
  vec2 s1 = c1.xy / c1.w * uRes;
  vec2 dir = normalize(s1 - s0 + 1e-6);
  vec2 nrm = vec2(-dir.y, dir.x);
  c0.xy += nrm * aSide * uWidth / uRes * c0.w;
  gl_Position = c0;
  vT = aT;
  vSide = aSide;
  #include <logdepthbuf_vertex>
}
`

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uOpacity;
varying float vT;
varying float vSide;
void main() {
  #include <logdepthbuf_fragment>
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vSide));
  // 14 pulses riding the loop; each a sharp head with a soft tail
  float ph = fract(vT * 14.0 - uTime * 0.11);
  float pulse = pow(ph, 10.0) * 1.6 + pow(ph, 2.5) * 0.25;
  // fade near Earth (t~0/1) and Mars (t~0.5)
  float ends = smoothstep(0.0, 0.012, vT) * (1.0 - smoothstep(0.988, 1.0, vT)) * (0.3 + 0.7 * smoothstep(0.02, 0.09, abs(vT - 0.5)));
  vec3 col = vec3(0.45, 0.66, 1.0) * (0.14 + pulse) * edge * ends * uOpacity;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export function TransitRoute({ opacity = 1 }: { opacity?: number }) {
  const size = useThree((s) => s.size)
  const geo = useMemo(() => {
    const n = 600
    const pts = TRANSIT_CURVE.getSpacedPoints(n)
    const pos = new Float32Array((n + 1) * 2 * 3)
    const next = new Float32Array((n + 1) * 2 * 3)
    const side = new Float32Array((n + 1) * 2)
    const t = new Float32Array((n + 1) * 2)
    for (let i = 0; i <= n; i++) {
      const p = pts[i]
      const q = pts[Math.min(i + 1, n)] === p ? pts[i - 1] : pts[Math.min(i + 1, n)]
      const flip = i === n ? -1 : 1
      for (let s = 0; s < 2; s++) {
        const k = i * 2 + s
        pos.set([p.x, p.y, p.z], k * 3)
        next.set([q.x, q.y, q.z], k * 3)
        side[k] = (s === 0 ? -1 : 1) * flip
        t[k] = i / n
      }
    }
    const idx: number[] = []
    for (let i = 0; i < n; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aNext', new BufferAttribute(next, 3))
    g.setAttribute('aSide', new BufferAttribute(side, 1))
    g.setAttribute('aT', new BufferAttribute(t, 1))
    g.setIndex(idx)
    return g
  }, [])
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uRes: { value: new Vector2(1, 1) },
          uWidth: { value: 1.6 },
          uTime: { value: 0 },
          uOpacity: { value: 1 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [],
  )
  // Mounted only in the overview: free the GPU copies on the way out.
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])
  mat.uniforms.uRes.value.set(size.width / 2, size.height / 2)
  mat.uniforms.uOpacity.value = opacity
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = STILL ? 0 : clock.elapsedTime
  })
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={4} />
}
