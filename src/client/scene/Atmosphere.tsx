/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, CustomBlending, FrontSide, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector3, type Mesh } from 'three'
import { SUN_DIR } from './sunlight'

// Single-scattering atmosphere (Rayleigh + Mie, numerically integrated) on a
// shell around any planet. Per pixel it marches the camera ray through the
// shell, stops at the planet surface (found analytically: planets are
// spheres), and for every sample marches toward the sun for its
// transmittance. Blue limbs, orange terminators, hazy horizons and the dusty
// butterscotch of Mars all fall out of the same few lines.
//
// Blending is premultiplied (src + dst * (1 - a)) with a = 1 - transmittance:
// the planet surface and stars behind are dimmed by the air in front of them,
// then the in-scattered light is added. Works from outside (front faces) and
// from inside (back faces: the sky seen from a surface base); the side flips
// per frame with the camera. No postprocessing; nothing here can flicker.

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`

const frag = (steps: number, lightSteps: number) => /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vWorld;
uniform vec3 uCenter;
uniform float uPlanetR;
uniform float uAtmoR;
uniform vec3 uSunDir;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform vec3 uAbsorb;
uniform float uHR;
uniform float uHM;
uniform float uG;
uniform float uSun;
uniform float uFade;

vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 ro = cameraPosition - uCenter;
  vec3 rd = normalize(vWorld - cameraPosition);
  vec2 ta = raySphere(ro, rd, uAtmoR);
  if (ta.x > ta.y || ta.y < 0.0) discard;
  float t0 = max(ta.x, 0.0);
  float t1 = ta.y;
  vec2 tp = raySphere(ro, rd, uPlanetR);
  if (tp.x < tp.y && tp.y > 0.0) t1 = min(t1, max(tp.x, 0.0));
  if (t1 <= t0) discard;
  float ds = (t1 - t0) / float(${steps});
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;
  vec3 extM = uBetaM * 1.1 + uAbsorb;
  for (int i = 0; i < ${steps}; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
    float h = max(length(p) - uPlanetR, 0.0);
    float dR = exp(-h / uHR) * ds;
    float dM = exp(-h / uHM) * ds;
    odR += dR;
    odM += dM;
    // planet shadow with a soft penumbra: how close does the sun ray from
    // this sample pass to the planet's centre?
    float ps = dot(p, uSunDir);
    float lit = 1.0;
    if (ps < 0.0) lit = smoothstep(uPlanetR * 0.992, uPlanetR * 1.01, length(p - ps * uSunDir));
    if (lit <= 0.0) continue;
    float dl = raySphere(p, uSunDir, uAtmoR).y / float(${lightSteps});
    float lR = 0.0;
    float lM = 0.0;
    for (int j = 0; j < ${lightSteps}; j++) {
      vec3 q = p + uSunDir * ((float(j) + 0.5) * dl);
      float hq = max(length(q) - uPlanetR, 0.0);
      lR += exp(-hq / uHR) * dl;
      lM += exp(-hq / uHM) * dl;
    }
    vec3 att = exp(-(uBetaR * (odR + lR) + extM * (odM + lM)));
    sumR += dR * att * lit;
    sumM += dM * att * lit;
  }
  float mu = dot(rd, uSunDir);
  float pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g2 = uG * uG;
  float pm = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * uG * mu, 1e-4), 1.5));
  vec3 col = uSun * (sumR * uBetaR * pr + sumM * uBetaM * pm);
  vec3 trans = exp(-(uBetaR * odR + extM * odM));
  float a = clamp(1.0 - dot(trans, vec3(0.3333)), 0.0, 1.0);
  gl_FragColor = vec4(col, a) * uFade;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface AtmosphereParams {
  /** Shell top radius as a multiple of the planet radius. */
  top: number
  /** Scale heights (planet-radius units). */
  hR: number
  hM: number
  betaR: [number, number, number]
  betaM: [number, number, number]
  absorb?: [number, number, number]
  g: number
  sun: number
}

// Stylized (thicker than life, so the limb reads at stage scale) but
// physically shaped. Coefficients are per planet-radius unit; `sun` is the
// solar irradiance, kept near the scene's directional light (3.1) so air and
// ground stay in balance (x2 for a readable limb).
export const EARTH_AIR: AtmosphereParams = {
  top: 1.065,
  hR: 0.011,
  hM: 0.0024,
  betaR: [4.2, 9.8, 24.1],
  betaM: [10.5, 10.5, 10.5],
  g: 0.76,
  sun: 6.5,
}

export const MARS_AIR: AtmosphereParams = {
  top: 1.055,
  hR: 0.014,
  hM: 0.012,
  betaR: [0.35, 0.6, 1.2],
  betaM: [7.5, 5.2, 3.4],
  absorb: [0.5, 1.4, 3.2],
  g: 0.62,
  sun: 7,
}

interface AtmosphereProps {
  planetRadius?: number
  center?: [number, number, number]
  params?: AtmosphereParams
  steps?: number
  lightSteps?: number
  /** Live strength 0..1 (the atlas hands the sky to a ground dome near the
   *  surface); the shell hides at 0. */
  fade?: () => number
  /** Realistic-scale air for close views (low orbit): the shell blends from
   *  `params` to these as `nearBlend` goes 0 -> 1, keeping the vertical
   *  optical depth, so the limb thins to a bright blue line up close. */
  near?: Pick<AtmosphereParams, 'top' | 'hR' | 'hM'>
  nearBlend?: () => number
}

export function Atmosphere({
  planetRadius = 1,
  center = [0, 0, 0],
  params = EARTH_AIR,
  steps = 12,
  lightSteps = 4,
  fade,
  near,
  nearBlend,
}: AtmosphereProps) {
  const R = planetRadius
  const mat = useMemo(() => {
    const scale = (v: [number, number, number]) => new Vector3(v[0] / R, v[1] / R, v[2] / R)
    return new ShaderMaterial({
      uniforms: {
        uCenter: { value: new Vector3(...center) },
        uPlanetR: { value: R },
        uAtmoR: { value: R * params.top },
        uSunDir: { value: SUN_DIR.clone() },
        uBetaR: { value: scale(params.betaR) },
        uBetaM: { value: scale(params.betaM) },
        uAbsorb: { value: scale(params.absorb ?? [0, 0, 0]) },
        uHR: { value: params.hR * R },
        uHM: { value: params.hM * R },
        uG: { value: params.g },
        uSun: { value: params.sun },
        uFade: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: frag(steps, lightSteps),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      side: FrontSide,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [R, params, steps, lightSteps, center[0], center[1], center[2]])

  const c = useMemo(() => new Vector3(...center), [center[0], center[1], center[2]])
  const mesh = useRef<Mesh>(null)
  useFrame(({ camera }) => {
    const f = fade ? fade() : 1
    mat.uniforms.uFade.value = f
    if (mesh.current) mesh.current.visible = f > 0.002
    let top = params.top
    if (near && nearBlend) {
      const k = nearBlend()
      const u = mat.uniforms
      top = params.top + (near.top - params.top) * k
      const hR = params.hR + (near.hR - params.hR) * k
      const hM = params.hM + (near.hM - params.hM) * k
      u.uAtmoR.value = R * top
      u.uHR.value = hR * R
      u.uHM.value = hM * R
      const rR = params.hR / hR
      const rM = params.hM / hM
      u.uBetaR.value.set(params.betaR[0] * rR, params.betaR[1] * rR, params.betaR[2] * rR).divideScalar(R)
      u.uBetaM.value.set(params.betaM[0] * rM, params.betaM[1] * rM, params.betaM[2] * rM).divideScalar(R)
      const ab = params.absorb ?? [0, 0, 0]
      u.uAbsorb.value.set(ab[0] * rM, ab[1] * rM, ab[2] * rM).divideScalar(R)
    }
    // The proxy shell must wrap the air; from outside it we draw its near
    // (front) faces, so they sit in front of the planet and cover its disc.
    // When the air has thinned below the full-size proxy (low orbit), shrink
    // the proxy to fit between the air and the camera. Only from inside the
    // air itself (a base) do we draw the far (back) faces: the sky.
    const full = R * params.top * 1.012
    const d = camera.position.distanceTo(c)
    const airTop = R * top
    const inside = d < airTop * 1.002
    const proxy = inside ? full : Math.min(full, Math.max(airTop * 1.001, (airTop + d) / 2))
    if (mesh.current) mesh.current.scale.setScalar(proxy / full)
    const side = inside ? BackSide : FrontSide
    if (mat.side !== side) {
      mat.side = side
      mat.needsUpdate = true
    }
  })

  return (
    <mesh ref={mesh} position={center} renderOrder={2}>
      <sphereGeometry args={[R * params.top * 1.012, 128, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}
