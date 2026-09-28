/** @jsxImportSource react */
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector2, Vector3 } from 'three'
import { SUN_DIR } from '../../scene/sunlight'
import { anchors, EARTH_POS, MARS_POS, MARS_RADIUS, MOON_RADIUS } from '../stage'

// Lens glare when the sun is in frame: a hot core, a soft veil, faint star
// spikes, an anamorphic streak and a few ghosts mirrored through the screen
// centre. One full-screen triangle drawn last; the sun's visibility is a CPU
// ray test against the planets, eased so it fades rather than pops. Screen
// space and additive: no postprocessing (see the no-bloom rule).
const VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
varying vec2 vNdc;
uniform vec2 uSun;
uniform float uAspect;
uniform float uVis;
float ghost(vec2 c, float size, float soft) {
  vec2 d = vNdc - c;
  d.x *= uAspect;
  float r = length(d);
  return smoothstep(size, size * soft, r);
}
void main() {
  vec2 p = vNdc - uSun;
  p.x *= uAspect;
  float r = length(p);
  float glare = exp(-r * 9.0) * 0.6 + exp(-r * 2.6) * 0.09;
  float a = atan(p.y, p.x);
  float spikes = (pow(abs(cos(a * 3.0)), 80.0) * 0.3 + pow(abs(cos(a * 3.0 + 0.52)), 120.0) * 0.18) * exp(-r * 5.0);
  float streak = exp(-abs(p.y) * 110.0) * exp(-abs(p.x) * 1.8) * 0.22;
  vec2 axis = -uSun;
  vec3 gh = vec3(0.0);
  gh += vec3(0.5, 0.8, 1.0) * ghost(uSun + axis * 0.42, 0.045, 0.6) * 0.05;
  gh += vec3(1.0, 0.7, 0.4) * ghost(uSun + axis * 0.7, 0.1, 0.85) * 0.03;
  gh += vec3(0.6, 1.0, 0.7) * ghost(uSun + axis * 1.15, 0.03, 0.4) * 0.06;
  gh += vec3(0.7, 0.6, 1.0) * ghost(uSun + axis * 1.5, 0.19, 0.9) * 0.022;
  gh += vec3(1.0, 0.85, 0.6) * ghost(uSun + axis * 1.85, 0.07, 0.7) * 0.035;
  vec3 col = vec3(1.0, 0.93, 0.82) * (glare + spikes) + vec3(0.65, 0.78, 1.0) * streak + gh;
  gl_FragColor = vec4(col * uVis, 1.0);
}
`

function hitsSphere(ro: Vector3, rd: Vector3, c: Vector3, r: number): boolean {
  const ox = ro.x - c.x
  const oy = ro.y - c.y
  const oz = ro.z - c.z
  const b = ox * rd.x + oy * rd.y + oz * rd.z
  const cc = ox * ox + oy * oy + oz * oz - r * r
  if (cc < 0) return false // inside (e.g. standing on it): the horizon handles it
  return b < 0 && b * b - cc > 0
}

export function SunGlare() {
  const { geo, mat } = useMemo(() => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const mat = new ShaderMaterial({
      uniforms: { uSun: { value: new Vector2() }, uAspect: { value: 1 }, uVis: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    return { geo, mat }
  }, [])
  const tmp = useMemo(() => ({ p: new Vector3(), f: new Vector3() }), [])

  useFrame(({ camera, size }, dt) => {
    const u = mat.uniforms
    camera.getWorldDirection(tmp.f)
    let target = 0
    if (tmp.f.dot(SUN_DIR) > 0.2) {
      tmp.p.copy(camera.position).addScaledVector(SUN_DIR, 1000).project(camera)
      const edge = Math.max(Math.abs(tmp.p.x), Math.abs(tmp.p.y))
      const onScreen = Math.max(0, Math.min(1, (1.25 - edge) / 0.35))
      const blocked =
        hitsSphere(camera.position, SUN_DIR, EARTH_POS, 1.0) ||
        hitsSphere(camera.position, SUN_DIR, anchors.moon, MOON_RADIUS) ||
        hitsSphere(camera.position, SUN_DIR, MARS_POS, MARS_RADIUS)
      target = blocked ? 0 : onScreen
      u.uSun.value.set(tmp.p.x, tmp.p.y)
    }
    u.uVis.value += (target - u.uVis.value) * Math.min(1, dt * 6)
    u.uAspect.value = size.width / Math.max(1, size.height)
  })

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={1000} />
}
