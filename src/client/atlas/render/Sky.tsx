/** @jsxImportSource react */
import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { NOISE } from './glsl'
import { SUN_DIR } from '../../scene/sunlight'
import { QUALITY } from '../quality'
import { EARTH_POS, MARS_POS, MARS_RADIUS } from '../stage'

// The sky is drawn at infinity, first (renderOrder < 0, no depth test/write),
// so every body rendered afterwards simply paints over it: planets occlude the
// stars, the Milky Way and the sun disc for free, with no depth fighting at
// any camera scale.

// Galactic frame: the band crosses the default overview diagonally.
const GAL_N = new Vector3(0.42, -0.79, 0.43).normalize()
const GAL_C = new Vector3(0.78, 0.08, -0.62)
GAL_C.sub(GAL_N.clone().multiplyScalar(GAL_C.dot(GAL_N))).normalize()

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  p.z = p.w * 0.999999;
  gl_Position = p;
}
`

const MILKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uGalN;
uniform vec3 uGalC;
uniform float uIntensity;
${NOISE}
void main() {
  vec3 d = normalize(vDir);
  float sb = dot(d, uGalN);
  float b = asin(clamp(sb, -1.0, 1.0));
  vec3 e = normalize(d - uGalN * sb + 1e-5);
  float l = atan(dot(e, cross(uGalN, uGalC)), dot(e, uGalC));
  float n1 = fbm3(d * 5.0, 5);
  float n2 = fbm3(d * 19.0 + 4.0, 4);
  float width = 0.1 + 0.05 * n1;
  float band = exp(-pow(b / width, 2.0));
  float bulge = exp(-pow(b / 0.2, 2.0)) * exp(-pow(l / 0.55, 2.0));
  // clumpy star clouds (contrasty, not fog), brightest along the plane
  float clouds = band * pow(n1, 2.2) * 2.4 * (0.35 + 0.9 * n2);
  // dark dust lanes hugging the plane
  float rift = smoothstep(0.5, 0.72, fbm3(d * 8.0 + 9.0, 4)) * exp(-pow((b + 0.01) / 0.045, 2.0));
  float lum = (clouds + bulge * 0.9 * (0.5 + n2)) * (1.0 - 0.7 * rift);
  vec3 warm = vec3(1.0, 0.86, 0.72);
  vec3 cool = vec3(0.74, 0.82, 1.0);
  vec3 col = mix(cool, warm, clamp(bulge * 1.2, 0.0, 1.0)) * lum;
  // faint airglow-free floor so pure black never bands
  col += vec3(0.0012, 0.0014, 0.0024);
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <colorspace_fragment>
}
`

const STAR_VERT = /* glsl */ `
attribute float aBright;
attribute vec3 aColor;
varying vec3 vColor;
varying float vBright;
uniform float uPixelRatio;
void main() {
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  p.z = p.w * 0.999999;
  gl_Position = p;
  float s = 0.9 + 3.4 * pow(aBright, 1.6);
  gl_PointSize = s * uPixelRatio;
  vColor = aColor;
  vBright = aBright;
}
`

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vBright;
uniform float uIntensity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  float a = exp(-r2 * 5.0);
  float l = (0.08 + 1.6 * vBright * vBright) * uIntensity;
  gl_FragColor = vec4(vColor * l * a, 1.0);
  #include <colorspace_fragment>
}
`

const SUN_VERT = /* glsl */ `
uniform vec3 uSunDir;
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = position.xy;
  vec3 c = mat3(viewMatrix) * uSunDir;
  // camera-facing quad around the sun direction, at unit distance
  vec3 right = normalize(cross(c, vec3(0.0, 1.0, 0.0) + 1e-4));
  vec3 up = normalize(cross(right, c));
  vec3 v = c + (right * position.x + up * position.y) * uSize;
  vec4 p = projectionMatrix * vec4(v, 1.0);
  p.z = p.w * 0.999999;
  gl_Position = p;
}
`

const SUN_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uCore;
uniform vec3 uGlow;
void main() {
  float r = length(vUv);
  float disc = 1.0 - smoothstep(0.075, 0.085, r);
  float limb = mix(0.72, 1.0, sqrt(max(1.0 - pow(r / 0.085, 2.0), 0.0)));
  float corona = exp(-r * 16.0) * 0.9 + exp(-r * 5.5) * 0.22;
  vec3 col = uCore * disc * limb * 6.0 + uGlow * corona;
  gl_FragColor = vec4(col * (1.0 - smoothstep(0.85, 1.0, r)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function starGeometry(count: number): BufferGeometry {
  // Deterministic LCG; stars are denser along the galactic plane.
  let seed = 1337
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  const pos = new Float32Array(count * 3)
  const bright = new Float32Array(count)
  const color = new Float32Array(count * 3)
  const palette = [
    [0.66, 0.76, 1.0],
    [0.82, 0.88, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 0.95, 0.86],
    [1.0, 0.84, 0.66],
    [1.0, 0.72, 0.55],
  ]
  const weights = [0.08, 0.2, 0.3, 0.24, 0.13, 0.05]
  const v = new Vector3()
  for (let i = 0; i < count; i++) {
    // rejection-sample a mild concentration toward the galactic plane
    for (let tries = 0; tries < 6; tries++) {
      const z = rnd() * 2 - 1
      const t = rnd() * Math.PI * 2
      const r = Math.sqrt(1 - z * z)
      v.set(r * Math.cos(t), z, r * Math.sin(t))
      const b = Math.abs(v.dot(GAL_N))
      if (rnd() < 0.45 + 0.55 * Math.exp(-(b * b) / 0.03)) break
    }
    pos.set([v.x, v.y, v.z], i * 3)
    // magnitude-like distribution: most faint, a few bright
    bright[i] = Math.pow(rnd(), 7.5) * 0.96 + rnd() * 0.04
    let pick = rnd()
    let k = 0
    while (k < weights.length - 1 && pick > weights[k]) {
      pick -= weights[k]
      k++
    }
    color.set(palette[k], i * 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aBright', new BufferAttribute(bright, 1))
  g.setAttribute('aColor', new BufferAttribute(color, 3))
  return g
}

/** Unresolved-looking star dust: tens of thousands of faint points hugging
 *  the galactic plane (gaussian in latitude, denser toward the bulge). This
 *  is what makes the band read as stars instead of fog. */
function dustGeometry(count: number): BufferGeometry {
  let seed = 4242
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-6))) * Math.cos(2 * Math.PI * rnd())
  const pos = new Float32Array(count * 3)
  const bright = new Float32Array(count)
  const color = new Float32Array(count * 3)
  const E = new Vector3().crossVectors(GAL_N, GAL_C)
  const v = new Vector3()
  for (let i = 0; i < count; i++) {
    const l = rnd() < 0.35 ? gauss() * 0.6 : (rnd() * 2 - 1) * Math.PI
    const b = gauss() * (0.05 + 0.07 * rnd())
    v.copy(GAL_C).multiplyScalar(Math.cos(l) * Math.cos(b))
      .addScaledVector(E, Math.sin(l) * Math.cos(b))
      .addScaledVector(GAL_N, Math.sin(b))
      .normalize()
    pos.set([v.x, v.y, v.z], i * 3)
    bright[i] = 0.05 + Math.pow(rnd(), 3) * 0.25
    const w = rnd()
    color.set(w < 0.5 ? [0.85, 0.9, 1] : w < 0.85 ? [1, 0.96, 0.9] : [1, 0.82, 0.68], i * 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aBright', new BufferAttribute(bright, 1))
  g.setAttribute('aColor', new BufferAttribute(color, 3))
  return g
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function Sky() {
  const dpr = useThree((s) => s.viewport.dpr)
  const { milky, milkyGeo, stars, dust, starMat, sunMat } = useMemo(() => {
    const milkyGeo = new SphereGeometry(1, 48, 24)
    const milky = new ShaderMaterial({
      uniforms: {
        uGalN: { value: GAL_N },
        uGalC: { value: GAL_C },
        uIntensity: { value: 0.016 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: MILKY_FRAG,
      depthTest: false,
      depthWrite: false,
      side: BackSide, // we are inside the sphere
    })
    const starMat = new ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 }, uIntensity: { value: 1.0 } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    const sunMat = new ShaderMaterial({
      uniforms: {
        uSunDir: { value: SUN_DIR },
        uSize: { value: 0.16 },
        uCore: { value: new Color('#fff6e8') },
        uGlow: { value: new Color('#ffcf9a') },
      },
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    return {
      milky,
      milkyGeo,
      stars: starGeometry(QUALITY.stars),
      dust: dustGeometry(QUALITY.low ? 16000 : 36000),
      starMat,
      sunMat,
    }
  }, [])
  starMat.uniforms.uPixelRatio.value = dpr
  const tmp = useMemo(() => new Vector3(), [])

  // Under a daylit sky (the ground at Starbase or on Mars) the stars and the
  // Milky Way wash out, as they do for any eye or camera exposed for daylight.
  useFrame(({ camera }) => {
    const day = (center: Vector3, R: number, reach: number) => {
      tmp.copy(camera.position).sub(center)
      const alt = tmp.length() - R
      const sun = tmp.normalize().dot(SUN_DIR)
      return (1 - smooth(reach * 0.08, reach, alt)) * smooth(-0.14, 0.12, sun)
    }
    const k = Math.max(day(EARTH_POS, 1, 0.05), 0.92 * day(MARS_POS, MARS_RADIUS, 0.035))
    starMat.uniforms.uIntensity.value = 1 - k
    milky.uniforms.uIntensity.value = 0.016 * (1 - k)
  })

  return (
    <group>
      <mesh geometry={milkyGeo} material={milky} renderOrder={-1000} frustumCulled={false} />
      <points geometry={dust} material={starMat} renderOrder={-999} frustumCulled={false} />
      <points geometry={stars} material={starMat} renderOrder={-999} frustumCulled={false} />
      <mesh renderOrder={-998} frustumCulled={false} material={sunMat}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </group>
  )
}
