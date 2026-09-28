/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  DoubleSide,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ShaderMaterial,
  Vector3,
  type Sprite,
} from 'three'
import { glowTexture } from '../render/textures'
import { SUN_DIR } from '../../scene/sunlight'
import { STILL } from '../../scene/debug'

// A Starship launch as it really looks from orbit: not a rocket-shaped model
// (at planet scale it would be hundreds of km tall), but a point of fire
// climbing out of the twilight with an exhaust trail that widens with
// altitude and catches the sun above the terminator (the "jellyfish"), then
// staging: the ship burns on toward orbit while the booster flips, flashes a
// boostback burn and drops home for a landing burn at the pad.
//
// The pad sits in world space near the terminator on the Earth-view side
// (altitudes exaggerated so the arc reads). Loop: LOOP seconds.
const LOOP = 34
const T_IGN = 1.0
const T_STAGE = 9.5
const T_SHIP_END = 24
const T_BOOST = [10.6, 13.2]
const T_LAND = [20.8, 22.2]

const TRAIL_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aTan;
attribute float aT;
attribute float aSide;
uniform float uWidth;
varying float vT;
varying float vSide;
varying float vLit;
varying float vAlt;
uniform vec3 uSun;
void main() {
  vec3 p = position;
  float alt = length(p) - 1.0;
  vAlt = alt;
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(aTan, toCam));
  // plume expands as the air thins
  float w = uWidth * (0.35 + 3.2 * pow(clamp(alt / 0.12, 0.0, 1.0), 1.5));
  p += side * aSide * w;
  // sunlit above the Earth's shadow cylinder?
  float ps = dot(position, uSun);
  vLit = ps > 0.0 ? 1.0 : smoothstep(0.995, 1.03, length(position - ps * uSun));
  vT = aT;
  vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`

const TRAIL_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vT;
varying float vSide;
varying float vLit;
varying float vAlt;
uniform float uHead;
uniform float uFade;
uniform float uAge;
void main() {
  #include <logdepthbuf_fragment>
  if (vT > uHead) discard;
  float age = (uHead - vT) * uAge;
  float edge = exp(-vSide * vSide * 2.6);
  float body = exp(-age * 0.55) * edge;
  // hot core near the engine, sunlit plume above the terminator
  vec3 hot = vec3(1.0, 0.72, 0.42) * exp(-age * 5.0);
  vec3 lit = mix(vec3(0.62, 0.72, 0.95), vec3(0.95, 0.97, 1.0), clamp(vAlt * 12.0, 0.0, 1.0)) * vLit * 0.8;
  vec3 col = (hot * 2.2 + lit) * body * uFade;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function ribbon(curve: CatmullRomCurve3, n: number) {
  const pos = new Float32Array(n * 2 * 3)
  const tan = new Float32Array(n * 2 * 3)
  const t = new Float32Array(n * 2)
  const side = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1)
    const p = curve.getPointAt(u)
    const d = curve.getTangentAt(u)
    for (let s = 0; s < 2; s++) {
      const k = i * 2 + s
      pos.set([p.x, p.y, p.z], k * 3)
      tan.set([d.x, d.y, d.z], k * 3)
      t[k] = u
      side[k] = s === 0 ? -1 : 1
    }
  }
  const idx: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aTan', new BufferAttribute(tan, 3))
  g.setAttribute('aT', new BufferAttribute(t, 1))
  g.setAttribute('aSide', new BufferAttribute(side, 1))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

export function LaunchStreak({ viewDir }: { viewDir: Vector3 }) {
  const geo = useMemo(() => {
    // Pad just on the lit side of the terminator, facing the Earth view.
    const c = viewDir.clone().normalize()
    const term = c.clone().addScaledVector(SUN_DIR, -c.dot(SUN_DIR)).normalize()
    // a little onto the day side, and in from the limb toward the viewer
    const n = term.clone().addScaledVector(SUN_DIR, 0.18).addScaledVector(c, 0.55).normalize()
    const pad = n.clone().multiplyScalar(1.0005)
    // downrange: toward screen-up along the limb, so the arc climbs across
    // the frame instead of pointing at the camera
    const right = new Vector3().crossVectors(c, new Vector3(0, 1, 0)).normalize()
    const screenUp = new Vector3().crossVectors(right, c).normalize()
    const east = screenUp.clone().addScaledVector(n, -screenUp.dot(n)).normalize()
    const up = (alt: number, down: number) => {
      // point `down` along the surface (great circle), `alt` above it
      const a = down // radians of arc
      const dir = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(east, Math.sin(a))
      return dir.multiplyScalar(1 + alt)
    }
    const shipPath = new CatmullRomCurve3([
      pad,
      up(0.012, 0.001),
      up(0.035, 0.012),
      up(0.065, 0.045), // staging
      up(0.09, 0.11),
      up(0.11, 0.2),
      up(0.12, 0.32),
      up(0.125, 0.45),
    ])
    const boosterPath = new CatmullRomCurve3([
      up(0.065, 0.045),
      up(0.078, 0.05),
      up(0.07, 0.035),
      up(0.04, 0.016),
      up(0.012, 0.004),
      pad,
    ])
    return { pad, n, shipPath, boosterPath, ribbon: ribbon(shipPath, 220), stageU: 0.3 }
  }, [viewDir])

  const trailMat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uHead: { value: 0 },
          uFade: { value: 1 },
          uAge: { value: 6 },
          uWidth: { value: 0.0016 },
          uSun: { value: SUN_DIR.clone() },
        },
        vertexShader: TRAIL_VERT,
        fragmentShader: TRAIL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [],
  )
  const tex = useMemo(() => glowTexture(), [])
  const stack = useRef<Sprite>(null)
  const ship = useRef<Sprite>(null)
  const booster = useRef<Sprite>(null)
  const padGlow = useRef<Sprite>(null)
  const col = useMemo(() => ({ hot: new Color('#ffd9a8'), blue: new Color('#dfe7ff') }), [])

  useFrame(({ clock }) => {
    const t = STILL ? 14 : clock.elapsedTime % LOOP
    const { shipPath, boosterPath, pad, stageU } = geo
    const s = stack.current
    const sh = ship.current
    const bo = booster.current
    const pg = padGlow.current
    if (!s || !sh || !bo || !pg) return

    // --- ascent (stack) then ship -------------------------------------------
    let head = 0
    if (t >= T_IGN && t < T_STAGE) {
      const k = (t - T_IGN) / (T_STAGE - T_IGN)
      head = stageU * k * k
    } else if (t >= T_STAGE) {
      const k = Math.min(1, (t - T_STAGE) / (T_SHIP_END - T_STAGE))
      head = stageU + (1 - stageU) * (1 - (1 - k) * (1 - k))
    }
    const fadeOut = 1 - smooth(T_SHIP_END + 2, LOOP - 1, t)
    trailMat.uniforms.uHead.value = head
    trailMat.uniforms.uFade.value = t < T_IGN ? 0 : fadeOut
    const flick = STILL ? 1 : 0.85 + 0.15 * Math.sin(clock.elapsedTime * 47) * Math.sin(clock.elapsedTime * 13)

    const onStack = t >= T_IGN && t < T_STAGE
    s.visible = onStack
    if (onStack) {
      s.position.copy(shipPath.getPointAt(Math.max(head, 0.0005)))
      const g = (0.05 + 0.05 * smooth(T_IGN, T_IGN + 1.5, t)) * flick
      s.scale.set(g, g, 1)
    }
    const onShip = t >= T_STAGE + 0.6 && t < T_SHIP_END
    sh.visible = onShip
    if (onShip) {
      sh.position.copy(shipPath.getPointAt(head))
      const g = 0.036 * flick * (1 - smooth(T_SHIP_END - 2.5, T_SHIP_END, t))
      sh.scale.set(g, g, 1)
    }

    // --- booster: boostback flash, coast, landing burn ------------------------
    const bb = t >= T_BOOST[0] && t < T_BOOST[1]
    const land = t >= T_LAND[0] && t < T_LAND[1]
    bo.visible = bb || land
    if (bo.visible) {
      const k = Math.min(1, Math.max(0, (t - T_STAGE) / (T_LAND[1] - T_STAGE)))
      bo.position.copy(boosterPath.getPointAt(k * k * (3 - 2 * k)))
      const burst = bb
        ? Math.sin(((t - T_BOOST[0]) / (T_BOOST[1] - T_BOOST[0])) * Math.PI)
        : Math.sin(((t - T_LAND[0]) / (T_LAND[1] - T_LAND[0])) * Math.PI)
      const g = 0.03 * burst * flick
      bo.scale.set(g, g, 1)
    }

    // --- pad: ignition bloom and the landing flash ------------------------------
    const ign = smooth(T_IGN - 0.2, T_IGN + 0.4, t) * (1 - smooth(T_IGN + 1, T_IGN + 5, t))
    const lf = land ? Math.sin(((t - T_LAND[0]) / (T_LAND[1] - T_LAND[0])) * Math.PI) * 0.6 : 0
    const pglow = Math.max(ign, lf)
    pg.visible = pglow > 0.01
    pg.position.copy(pad)
    const pgs = 0.09 * pglow
    pg.scale.set(pgs, pgs, 1)
  })

  const sprite = (ref: React.RefObject<Sprite | null>, color: Color) => (
    <sprite ref={ref} visible={false} renderOrder={7}>
      <spriteMaterial map={tex} color={color} blending={AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
    </sprite>
  )

  return (
    <group>
      <mesh geometry={geo.ribbon} material={trailMat} frustumCulled={false} renderOrder={6} />
      {sprite(stack, col.hot)}
      {sprite(ship, col.blue)}
      {sprite(booster, col.hot)}
      {sprite(padGlow, col.hot)}
    </group>
  )
}
