/** @jsxImportSource react */
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BackSide,
  CustomBlending,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { SUN_DIR } from '../../scene/sunlight'
import { STILL } from '../../scene/debug'
import { anchors } from '../stage'

// The sky seen from the ground (Starbase, the Mars settlement). The shell
// atmospheres are tuned to read from orbit; standing on the surface wants a
// sky with real scale heights: a saturated zenith, a pale hazy horizon, an
// aureole around the sun. The sun never moves on this stage, so the sky is
// integrated ONCE (single scattering + an isotropic multiple-scattering term,
// 48 view x 10 light samples) into a small equirectangular table, and the dome
// just samples it. Clouds (Earth) drift across it procedurally. Drawn first,
// at infinity, fading in over the starfield as the camera comes down.

export interface GroundSkyParams {
  /** Planet radius and atmosphere top, metres. */
  R: number
  top: number
  /** Scattering coefficients per metre and scale heights. */
  betaR: [number, number, number]
  HR: number
  betaM: [number, number, number]
  absorbM?: [number, number, number]
  HM: number
  g: number
  /** Solar irradiance scale (matches the scene's directional light). */
  sun: number
  /** Multiple-scattering fill, 0..1. */
  ms: number
  /** Solar disc radiance multiplier and angular radius (radians). */
  disc: number
  discR: number
  clouds: boolean
}

export const EARTH_SKY: GroundSkyParams = {
  R: 6360e3,
  top: 6420e3,
  betaR: [5.8e-6, 13.5e-6, 33.1e-6],
  HR: 8000,
  betaM: [3.2e-6, 3.2e-6, 3.2e-6],
  HM: 1200,
  g: 0.8,
  sun: 22,
  ms: 0.4,
  disc: 1,
  discR: 0.0095,
  clouds: true,
}

/** Mars: a thin CO2 sky lit almost entirely by suspended dust (a few
 *  tenths optical depth, well mixed to ~11 km) that scatters red and
 *  absorbs blue: butterscotch overhead, paler and browner at the horizon,
 *  a bright aureole around a smaller sun. */
export const MARS_SKY: GroundSkyParams = {
  R: 3390e3,
  top: 3470e3,
  betaR: [0.06e-6, 0.14e-6, 0.33e-6],
  HR: 11000,
  // nearly grey extinction; red scatters best, blue is mostly absorbed
  betaM: [4.6e-5, 3.5e-5, 2.2e-5],
  absorbM: [0.2e-5, 1.3e-5, 2.9e-5],
  HM: 11000,
  g: 0.72,
  sun: 19,
  ms: 0.55,
  disc: 1,
  discR: 0.0064,
  clouds: false,
}

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const BAKE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uSun;
uniform float uR;
uniform float uTop;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform vec3 uAbsM;
uniform float uHR;
uniform float uHM;
uniform float uG;
uniform float uSunE;
uniform float uMs;
const float PI = 3.14159265;
vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
vec3 dirFromUv(vec2 uv) {
  // equirect: u = azimuth, v = elevation (sin-spaced toward the horizon)
  float az = (uv.x - 0.5) * 2.0 * PI;
  float s = uv.y * 2.0 - 1.0;
  float el = 0.5 * PI * sign(s) * s * s;
  return vec3(cos(el) * sin(az), sin(el), -cos(el) * cos(az));
}
void main() {
  vec3 rd = dirFromUv(vUv);
  vec3 ro = vec3(0.0, uR + 2.0, 0.0);
  vec2 ta = raySphere(ro, rd, uTop);
  float tmax = ta.y;
  vec2 tp = raySphere(ro, rd, uR);
  bool ground = tp.x > 0.0;
  if (ground) tmax = tp.x;
  const int N = 48;
  const int NL = 10;
  // sample more densely near the camera (thick air) with a quadratic ramp
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  vec3 sumMs = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;
  vec3 extM = uBetaM * 1.11 + uAbsM;
  float tPrev = 0.0;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 0.5) / float(N);
    float t = tmax * f * f;
    float fn = (float(i) + 1.0) / float(N);
    float ds = tmax * fn * fn - tPrev;
    tPrev = tmax * fn * fn;
    vec3 p = ro + rd * t;
    float h = length(p) - uR;
    float dR = exp(-h / uHR) * ds;
    float dM = exp(-h / uHM) * ds;
    odR += dR;
    odM += dM;
    vec2 ls = raySphere(p, uSun, uTop);
    vec2 lg = raySphere(p, uSun, uR);
    float shadow = lg.x > 0.0 ? 0.0 : 1.0;
    float dl = ls.y / float(NL);
    float lR = 0.0;
    float lM = 0.0;
    for (int j = 0; j < NL; j++) {
      vec3 q = p + uSun * ((float(j) + 0.5) * dl);
      float hq = length(q) - uR;
      lR += exp(-hq / uHR) * dl;
      lM += exp(-hq / uHM) * dl;
    }
    vec3 att = exp(-(uBetaR * (odR + lR) + extM * (odM + lM))) * shadow;
    sumR += dR * att;
    sumM += dM * att;
    // isotropic multiple-scattering fill: light that has already scattered
    // once, spread evenly (cheap stand-in for the higher orders)
    vec3 viewT = exp(-(uBetaR * odR + extM * odM));
    sumMs += (dR * uBetaR + dM * uBetaM) * viewT * exp(-(uBetaR * lR + extM * lM) * 0.5) * max(uSun.y + 0.1, 0.0);
  }
  float mu = dot(rd, uSun);
  float pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g2 = uG * uG;
  float pm = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * uG * mu, 1e-4), 1.5));
  vec3 col = uSunE * (sumR * uBetaR * pr + sumM * uBetaM * pm + sumMs * uMs / (4.0 * PI));
  if (ground) {
    // below the horizon: haze over a dim, sunlit ground (mostly hidden by
    // the terrain anyway); keeps reflections sane
    vec3 viewT = exp(-(uBetaR * odR + extM * odM));
    col += viewT * vec3(0.06, 0.05, 0.035) * uSunE * 0.02 * max(uSun.y, 0.0);
  }
  gl_FragColor = vec4(col, 1.0);
}
`

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  p.z = p.w * 0.999999;
  gl_Position = p;
}
`

const DOME_FRAG = (clouds: boolean) => /* glsl */ `
varying vec3 vDir;
uniform sampler2D uLut;
uniform vec3 uSun;
uniform vec3 uSunCol;
uniform vec3 uCloudSun;
uniform float uDiscR;
uniform float uFade;
uniform float uTime;
const float PI = 3.14159265;
vec3 sky(vec3 d) {
  float az = atan(d.x, -d.z);
  // below the horizon: the terrain covers it; continue the horizon haze
  // (the real horizon dips a degree or so below the celestial one)
  float el = asin(clamp(d.y, 0.004, 1.0));
  float s = sqrt(abs(el) / (0.5 * PI)) * sign(el);
  return texture2D(uLut, vec2(az / (2.0 * PI) + 0.5, s * 0.5 + 0.5)).rgb;
}
float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vn2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cloudField(vec2 p) {
  // scattered fair-weather cumulus: a coverage mask times billowy detail
  float cov = vn2(p * 0.18 + 3.1) * 0.6 + vn2(p * 0.47 - 1.7) * 0.4;
  float d = 0.0;
  float a = 0.5;
  vec2 q = p;
  for (int i = 0; i < 5; i++) {
    d += a * vn2(q);
    q = q * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return clamp((cov * 0.75 + d * 0.6 - 0.83) * 3.2, 0.0, 1.0);
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = sky(d);
  // the sun: limb-darkened disc
  float cs = dot(d, uSun);
  float ang = acos(clamp(cs, -1.0, 1.0));
  float disc = 1.0 - smoothstep(uDiscR * 0.92, uDiscR, ang);
  float limb = sqrt(max(1.0 - pow(ang / uDiscR, 2.0), 0.0));
  col += uSunCol * disc * mix(0.6, 1.0, limb);
  ${
    clouds
      ? `if (d.y > 0.0) {
    // a cloud deck ~2 km up, drifting slowly from the southeast
    vec2 p = d.xz / max(d.y, 0.03) * 2.0 + vec2(-0.02, 0.012) * uTime;
    float c = cloudField(p);
    if (c > 0.0) {
      vec2 sunXZ = normalize(uSun.xz + 1e-5);
      float toward = cloudField(p + sunXZ * 0.35);
      float lit = clamp(0.62 + (c - toward) * 1.8, 0.2, 1.0);
      float silver = pow(max(cs, 0.0), 12.0) * 2.5;
      vec3 amb = sky(normalize(vec3(d.x, 0.35, d.z))) * 1.6;
      vec3 cc = amb * 0.5 + uCloudSun * (lit + silver);
      float fadeH = smoothstep(0.015, 0.14, d.y);
      // distant clouds melt into the horizon haze
      cc = mix(sky(d) * 1.05, cc, smoothstep(0.02, 0.25, d.y));
      col = mix(col, cc, c * fadeH * 0.96);
    }
  }`
      : ''
  }
  gl_FragColor = vec4(col * uFade, uFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const cache = new Map<GroundSkyParams, Texture>()

/** Integrate the sky once into a 512 x 256 half-float equirect table. */
export function bakeSkyLut(gl: WebGLRenderer, p: GroundSkyParams): Texture {
  const hit = cache.get(p)
  if (hit) return hit
  const rt = new WebGLRenderTarget(512, 256, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  })
  const mat = new ShaderMaterial({
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uR: { value: p.R },
      uTop: { value: p.top },
      uBetaR: { value: new Vector3(...p.betaR) },
      uBetaM: { value: new Vector3(...p.betaM) },
      uAbsM: { value: new Vector3(...(p.absorbM ?? [0, 0, 0])) },
      uHR: { value: p.HR },
      uHM: { value: p.HM },
      uG: { value: p.g },
      uSunE: { value: p.sun },
      uMs: { value: p.ms },
    },
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    depthTest: false,
    depthWrite: false,
  })
  const scene = new Scene()
  const quad = new Mesh(new PlaneGeometry(2, 2), mat)
  scene.add(quad)
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const prev = gl.getRenderTarget()
  const prevXr = gl.xr.enabled
  gl.xr.enabled = false
  gl.setRenderTarget(rt)
  gl.render(scene, cam)
  gl.setRenderTarget(prev)
  gl.xr.enabled = prevXr
  quad.geometry.dispose()
  mat.dispose()
  rt.texture.wrapS = RepeatWrapping
  cache.set(p, rt.texture)
  return rt.texture
}

/** Transmittance of sunlight straight down to the ground (for the disc). */
function sunColor(p: GroundSkyParams): Vector3 {
  const mu = Math.max(SUN_DIR.y, 0.02)
  // plane-parallel airmass is plenty at these elevations
  const am = 1 / (mu + 0.15 * Math.pow(93.885 - (Math.acos(mu) * 180) / Math.PI, -1.253))
  const t = (i: number) =>
    Math.exp(-(p.betaR[i] * p.HR + (p.betaM[i] * 1.11 + (p.absorbM?.[i] ?? 0)) * p.HM) * am)
  return new Vector3(t(0), t(1), t(2)).multiplyScalar(p.sun * p.disc * 2600)
}

export function GroundSky({ params, fade }: { params: GroundSkyParams; fade: (camera: Camera) => number }) {
  const gl = useThree((s) => s.gl)
  const lut = useMemo(() => bakeSkyLut(gl, params), [gl, params])
  const { geo, mat } = useMemo(() => {
    const geo = new SphereGeometry(1, 64, 32)
    const mat = new ShaderMaterial({
      uniforms: {
        uLut: { value: lut },
        uSun: { value: SUN_DIR.clone() },
        uSunCol: { value: sunColor(params) },
        uCloudSun: { value: sunColor(params).multiplyScalar(0.62 / (params.sun * params.disc * 2600)) },
        uDiscR: { value: params.discR },
        uFade: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG(params.clouds),
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      // opaque list (drawn first, by renderOrder) but still blended over
      // the starfield: three only drops blending for NormalBlending
      transparent: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    })
    return { geo, mat }
  }, [lut, params])
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])

  useFrame(({ clock, camera }) => {
    const f = fade(camera)
    mat.uniforms.uFade.value = f
    mat.uniforms.uTime.value = STILL ? 0 : clock.elapsedTime
    mesh.visible = f > 0.002
  }, -3)
  const mesh = useMemo(() => new Mesh(geo, mat), [geo, mat])
  mesh.renderOrder = -997
  mesh.frustumCulled = false
  return <primitive object={mesh} />
}

/** Fade (0..1) of the ground sky over a base: full near the ground, gone by
 *  `top` (stage units above the surface). Also dims the shell atmosphere. */
export function groundFade(center: Vector3, radius: number, cam: Vector3, near: number, top: number, key: 'earth' | 'mars') {
  const alt = cam.distanceTo(center) - radius
  const t = Math.min(1, Math.max(0, (alt - near) / (top - near)))
  const f = 1 - t * t * (3 - 2 * t)
  anchors.airFade[key] = 1 - f
  return f
}
