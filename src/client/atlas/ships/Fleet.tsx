/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Quaternion, ShaderMaterial, Vector3, type Group } from 'three'
import { Starship } from './Starship'
import { anchors, SHIP_LENGTH } from '../stage'
import { TRANSIT_CURVE, TRANSIT_PERIOD, routeParam } from './route'
import { STILL } from '../../scene/debug'

// The fleet. Transfer windows open every 26 months, so ships leave for Mars
// together: the followed Starship flies with a loose formation of wingmen
// (their hulls and burning engines near and far), and from the overview the
// route carries a stream of hundreds of glints, convoy after convoy.

// Formation: (depth beyond the lead ship as the chase camera sees it,
// sideways, along the axis), in ship lengths. The lead ship is rolled so the
// camera always sits at CAM in its frame (TransitShip), so the convoy
// recedes behind it into the frame.
const CAM = new Vector3(Math.cos(1.22), 0, -Math.sin(1.22))
const RIGHT = new Vector3(Math.sin(1.22), 0, Math.cos(1.22))
const WING: [number, number, number][] = [
  [6, -2.4, -1.2],
  [9, 3.6, 1.6],
  [13, -5.2, 2.6],
  [18, 6.8, -2.2],
  [24, -1.6, -4.2],
  [31, 9.5, 3.1],
  [39, -9.5, 0.6],
  [49, 3.2, 5.2],
  [62, -15, -3.2],
  [78, 17, 4.4],
].map(([d, l, a]) => {
  const v = CAM.clone().multiplyScalar(-d).addScaledVector(RIGHT, l).add(new Vector3(0, a, 0))
  return [v.x, v.y, v.z] as [number, number, number]
})

export function FleetWingmen() {
  const root = useRef<Group>(null)
  const ships = useRef<(Group | null)[]>([])
  const tmp = useMemo(() => ({ v: new Vector3(), q: new Quaternion() }), [])
  useFrame(({ camera, clock }) => {
    const r = root.current
    if (!r) return
    const near = camera.position.distanceTo(anchors.ship) < SHIP_LENGTH * 160
    r.visible = near
    if (!near) return
    const t = STILL ? 0 : clock.elapsedTime
    WING.forEach(([x, y, z], i) => {
      const g = ships.current[i]
      if (!g) return
      // each holds station with a slow, individual drift
      tmp.v.set(x + 0.3 * Math.sin(t * 0.21 + i), y + 0.25 * Math.sin(t * 0.17 + i * 2.1), z + 0.3 * Math.cos(t * 0.19 + i))
      tmp.v.multiplyScalar(SHIP_LENGTH).applyQuaternion(anchors.shipQuat)
      g.position.copy(anchors.ship).add(tmp.v)
      tmp.q.setFromAxisAngle(new Vector3(0, 1, 0), 0.04 * Math.sin(t * 0.13 + i))
      g.quaternion.copy(anchors.shipQuat).multiply(tmp.q)
    })
  }, -2.5)
  return (
    <group ref={root}>
      {WING.map((_, i) => (
        <group key={i} ref={(el) => (ships.current[i] = el)}>
          <Starship length={SHIP_LENGTH} firing={1} />
        </group>
      ))}
    </group>
  )
}

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aBright;
uniform float uPixelRatio;
uniform float uOpacity;
varying float vB;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vB = aBright * uOpacity;
  gl_PointSize = (1.6 + 2.6 * aBright) * uPixelRatio;
  #include <logdepthbuf_vertex>
}
`
const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vB;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 16.0);
  gl_FragColor = vec4(vec3(1.0, 0.8, 0.58) * a * vB, 1.0);
  #include <colorspace_fragment>
}
`

/** Convoys riding the route: glints bunched into waves, all moving. */
export function FleetStream({ visible }: { visible: boolean }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const N = 260
  const { geo, mat, phase, jitter } = useMemo(() => {
    let seed = 99
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967295
    }
    const phase = new Float32Array(N)
    const jitter = new Float32Array(N * 3)
    const bright = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      // six convoys, each a few hundred km of loose stream
      const wave = Math.floor(rnd() * 6)
      phase[i] = wave / 6 + (rnd() - 0.5) * 0.035 + (rnd() < 0.15 ? (rnd() - 0.5) * 0.12 : 0)
      jitter.set([(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.5], i * 3)
      bright[i] = 0.25 + Math.pow(rnd(), 3) * 0.75
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3))
    geo.setAttribute('aBright', new BufferAttribute(bright, 1))
    const mat = new ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 }, uOpacity: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    return { geo, mat, phase, jitter }
  }, [])
  mat.uniforms.uPixelRatio.value = dpr
  const tmp = useMemo(() => new Vector3(), [])
  useFrame(({ clock }) => {
    const u = mat.uniforms
    u.uOpacity.value += ((visible ? 1 : 0) - u.uOpacity.value) * 0.05
    if (u.uOpacity.value < 0.01) return
    const time = STILL ? 30 : clock.elapsedTime
    const pos = geo.getAttribute('position') as BufferAttribute
    for (let i = 0; i < N; i++) {
      const t = routeParam(time / TRANSIT_PERIOD + phase[i])
      TRANSIT_CURVE.getPointAt(t, tmp)
      pos.setXYZ(i, tmp.x + jitter[i * 3], tmp.y + jitter[i * 3 + 1], tmp.z + jitter[i * 3 + 2])
    }
    pos.needsUpdate = true
  })
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={4} />
}
