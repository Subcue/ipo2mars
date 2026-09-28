/** @jsxImportSource react */
import { useEffect, useMemo } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  MeshStandardMaterial,
  TextureLoader,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { flatAt, GEO_GLSL, groundHeight, SITE_EXTENT } from './geo'
import layout from '../bases/layout.json'
import { coastDetail } from './detail'
import { SITE_HAZE } from './state'
import { SPHERE_UV } from '../render/glsl'
import { EARTH_QUAT, SITE_QUAT, SITE_SCALE, STARBASE_POS } from '../stage'
import { QUALITY } from '../quality'
import { STILL } from '../../scene/debug'

// The ground at Starbase: one displaced spherical cap (base-local, planet
// centre at (0, -R, 0)) that is land, beach, surf and open Gulf all at once.
// Per pixel it finds the analytic shoreline (geo.ts), shades sand, dunes,
// scrub, tidal flats, lagoons and graded pads, or water: murky green in the
// surf, Gulf blue offshore, with directional swell, breaking foam lines, a wet
// swash band and the sky/sun reflected by the standard PBR lighting. Far from
// the pads it becomes the Earth texture, so from orbit it is just Texas.

const R = 1
const L = layout.starbase

function buildGeometry(): BufferGeometry {
  const rings = QUALITY.terrainRings
  const segs = QUALITY.terrainSegs
  const s = SITE_SCALE
  const count = 1 + rings * segs
  const pos = new Float32Array(count * 3)
  const flat = new Float32Array(count)
  const put = (i: number, xm: number, zm: number) => {
    const h = groundHeight(xm, zm)
    flat[i] = flatAt(xm, zm)
    const x = xm * s
    const z = zm * s
    const inv = 1 / Math.sqrt(x * x + R * R + z * z)
    const rr = R + h * s
    pos[i * 3] = x * inv * rr
    pos[i * 3 + 1] = R * inv * rr - R
    pos[i * 3 + 2] = z * inv * rr
  }
  put(0, 0, 0)
  for (let r = 1; r <= rings; r++) {
    const rad = SITE_EXTENT * Math.pow(r / rings, 2)
    for (let k = 0; k < segs; k++) {
      const a = ((k + (r % 2) * 0.5) / segs) * Math.PI * 2
      put(1 + (r - 1) * segs + k, Math.cos(a) * rad, Math.sin(a) * rad)
    }
  }
  const idx: number[] = []
  for (let k = 0; k < segs; k++) idx.push(0, 1 + ((k + 1) % segs), 1 + k)
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs
    const b0 = 1 + r * segs
    for (let k = 0; k < segs; k++) {
      const k1 = (k + 1) % segs
      idx.push(a0 + k, a0 + k1, b0 + k1)
      idx.push(a0 + k, b0 + k1, b0 + k)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aFlat', new BufferAttribute(flat, 1))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

const FRAG_HEAD = /* glsl */ `
varying vec3 vBase;
varying vec3 vPlanetDir;
varying vec3 vTX;
varying vec3 vTZ;
varying float vFlat;
uniform float uTime;
uniform float uDetail;
uniform sampler2D uDay;
uniform sampler2D uOcean;
uniform sampler2D uDetailTex;
uniform vec3 uHazeColor;
uniform float uHazeK;
${GEO_GLSL}
${SPHERE_UV}
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
float fbm2(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn2(p);
    p = p * 2.03 + vec2(17.1, 5.3);
    a *= 0.5;
  }
  return s;
}
`

// Computed once at the top of main(): zones, albedo, roughness, the slope of
// the surface detail (base axes) and foam.
const FRAG_ZONES = /* glsl */ `
  vec2 gp = vBase.xz;
  float gfw = max(length(fwidth(gp)), 1e-3);
  float gr = length(gp);
  float gs = shoreDist(gp);
  float farW = max(smoothstep(4500.0, 10000.0, gr), 1.0 - uDetail);
  vec2 puv = sphereUv(normalize(vPlanetDir));
  vec3 texCol = pow(texture2D(uDay, puv).rgb, vec3(2.2));
  float oceanTex = texture2D(uOcean, puv).g;
  float n1 = vn2(gp / 37.0);
  float n2 = vn2(gp / 9.0 + 3.1);
  // baked coastal detail at three scales, rotated to hide the repeat
  vec2 dSlope = vec2(0.0);
  float dAlb = 0.0;
  float dVeg = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 64.0 * pow(0.23, fi);
    float a = fi * 1.31 + 0.2;
    mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec4 tx = texture2D(uDetailTex, R * gp / sc + vec2(0.31, 0.77) * fi);
    dSlope += transpose(R) * ((tx.rg - 0.5) * 4.0) * (0.3 + 0.2 * fi);
    dAlb += (tx.b - 0.5) * (1.0 - 0.25 * fi);
    dVeg = max(dVeg, tx.a * (1.0 - 0.35 * fi));
  }
  // --- land -----------------------------------------------------------------
  float dune = smoothstep(50.0, 90.0, -gs) * (1.0 - smoothstep(280.0, 450.0, -gs));
  float plain = smoothstep(300.0, 520.0, -gs);
  float pad = smoothstep(0.55, 0.92, vFlat);
  vec3 sand = vec3(0.5, 0.41, 0.27) * (0.9 + 0.18 * n2);
  vec3 mud = mix(vec3(0.3, 0.26, 0.19), vec3(0.2, 0.18, 0.13), smoothstep(0.3, 0.7, n1));
  vec3 land = mix(sand, mud, plain) * (0.86 + 0.5 * dAlb);
  // scrub and grass: clumped by the detail, thicker on the dunes and in
  // swathes across the plain, none on the graded ground
  float vegZone = (dune * 0.85 + plain * 0.8 * smoothstep(0.45, 0.66, fbm2(gp / 220.0 + 4.0))) * (1.0 - pad);
  float vegHere = clamp(dVeg * vegZone * 1.5, 0.0, 1.0);
  vec3 vegCol = mix(vec3(0.085, 0.08, 0.035), vec3(0.2, 0.17, 0.09), clamp(0.5 + dAlb * 1.5, 0.0, 1.0));
  land = mix(land, vegCol, vegHere);
  vec3 concrete = vec3(0.34, 0.32, 0.29) * (0.9 + 0.14 * n2) * (0.92 + 0.25 * dAlb);
  land = mix(land, concrete, pad);
  // Highway 4: asphalt, a dashed yellow centre line
  float roadD = abs(gp.y - ${L.road[1].toFixed(1)});
  float road = (1.0 - smoothstep(4.2, 5.4, roadD)) * step(${L.road[0].toFixed(1)}, gp.x) * step(gp.x, ${L.road[2].toFixed(1)});
  float dash = step(0.45, fract(gp.x / 11.0)) * (1.0 - smoothstep(0.08, 0.16, roadD)) * clamp(2.0 / gfw - 0.5, 0.0, 1.0);
  land = mix(land, mix(vec3(0.045, 0.045, 0.047) * (0.9 + 0.2 * n2), vec3(0.55, 0.42, 0.08), dash), road);
  // lagoons out on the tidal plain (never on the graded ground)
  float lf = fbm2(gp / 700.0 + 9.0);
  float lagoon = plain * (1.0 - pad) * (1.0 - smoothstep(0.23, 0.25, lf)) * smoothstep(1600.0, 2600.0, gr);
  // the flooded flat between the highway and the beach road viewpoint
  {
    vec2 lq = (gp - vec2(${L.lagoon[0].toFixed(1)}, ${L.lagoon[1].toFixed(1)})) / vec2(${L.lagoon[2].toFixed(1)}, ${L.lagoon[3].toFixed(1)});
    float le = length(lq) + (fbm2(gp / 60.0 + 3.0) - 0.5) * 0.5 + (vn2(gp / 14.0) - 0.5) * 0.12;
    lagoon = max(lagoon, (1.0 - smoothstep(0.86, 0.9, le)) * (1.0 - pad));
  }
  // the swash band on the beach, and damp mud ringing each lagoon
  float wet = smoothstep(-30.0, -3.0, gs) * (1.0 - step(0.0, gs));
  wet = max(wet, plain * (1.0 - pad) * (1.0 - smoothstep(0.25, 0.33, lf)) * 0.75 * smoothstep(1300.0, 2300.0, gr));
  land = mix(land, vec3(0.16, 0.125, 0.08), wet * 0.85);
  float landRough = mix(mix(mix(0.93, 0.35, wet), 0.85, pad), 0.7, road);
  vec2 lgrad = dSlope * mix(1.0, 0.25, pad) * (1.0 - wet * 0.7);
  // --- water ----------------------------------------------------------------
  float waterN = max(smoothstep(-gfw, gfw, gs), lagoon);
  float water = mix(waterN, oceanTex, farW);
  float deep = smoothstep(0.0, 1400.0, gs);
  vec3 waterCol = mix(vec3(0.05, 0.07, 0.045), vec3(0.006, 0.028, 0.045), deep);
  waterCol = mix(waterCol, vec3(0.03, 0.04, 0.035), lagoon);
  // swell rolling in from the east-southeast, steepening in the surf
  vec2 wgrad = vec2(0.0);
  float t = uTime;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float lam = 46.0 * pow(0.63, fi);
    float ang = 3.14159 + (fi - 3.0) * 0.31 + sin(fi * 2.3) * 0.2;
    vec2 d = vec2(cos(ang), sin(ang));
    float k = 6.2832 / lam;
    float w = sqrt(9.81 * k);
    float fade = clamp(lam / (gfw * 5.0) - 0.6, 0.0, 1.0);
    float ph = dot(d, gp) * k - w * t + fi * 1.7;
    wgrad += d * (0.16 * cos(ph)) * fade;
  }
  wgrad *= mix(1.0, 0.25, lagoon);
  // breaking lines in the surf zone and the swash at the waterline
  float surf = smoothstep(0.0, 14.0, gs) * (1.0 - smoothstep(70.0, 190.0, gs));
  float lines = sin((gs + t * 3.1) * 6.2832 / 27.0 + vn2(vec2(gp.y / 45.0, t * 0.07)) * 3.4);
  float foam = smoothstep(0.72, 0.97, lines * 0.5 + 0.5 + (n2 - 0.5) * 0.45) * surf;
  foam += (1.0 - smoothstep(0.0, 11.0, gs)) * step(0.0, gs) * (0.45 + 0.55 * vn2(gp / 2.3 - 7.7));
  foam *= clamp(14.0 / gfw - 0.5, 0.0, 1.0) * (1.0 - farW) * (1.0 - lagoon);
  // --- combine ----------------------------------------------------------------
  vec3 farLand = texCol * vec3(1.06, 1.04, 0.98);
  vec3 farSea = texCol * vec3(0.72, 0.86, 1.0);
  vec3 gAlbedo = mix(mix(land, farLand, farW), mix(waterCol, farSea, farW), water);
  gAlbedo = mix(gAlbedo, vec3(0.75, 0.76, 0.74), clamp(foam, 0.0, 1.0) * water);
  float gRough = mix(mix(landRough, 0.93, farW), mix(0.055 + clamp(gfw * 0.004, 0.0, 0.3) + lagoon * 0.12, 0.36, farW), water);
  gRough = mix(gRough, 0.85, clamp(foam, 0.0, 1.0) * water);
  vec2 gSlope = mix(lgrad, wgrad * (1.0 - farW), water);
`

export function StarbaseGround({ env, visible }: { env: Texture; visible: boolean }) {
  const [day, ocean] = useLoader(TextureLoader, ['/textures/earth.jpg', '/textures/earth-specular.jpg'])
  const geo = useMemo(buildGeometry, [])
  const { material, uniforms } = useMemo(() => {
    const uniforms = {
      uTime: { value: 0 },
      uDetail: { value: 1 },
      uDay: { value: day },
      uOcean: { value: ocean },
      uDetailTex: { value: coastDetail() },
      uHazeColor: { value: SITE_HAZE.color },
      uHazeK: { value: 0 },
      uBaseToPlanet: {
        value: new Matrix4()
          .makeRotationFromQuaternion(EARTH_QUAT.clone().invert())
          .multiply(new Matrix4().makeTranslation(STARBASE_POS.x, STARBASE_POS.y, STARBASE_POS.z))
          .multiply(new Matrix4().makeRotationFromQuaternion(SITE_QUAT)),
      },
    }
    const m = new MeshStandardMaterial({ roughness: 1, metalness: 0, envMap: env, envMapIntensity: 1 })
    m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          `attribute float aFlat;
varying float vFlat;
varying vec3 vBase;
varying vec3 vPlanetDir;
varying vec3 vTX;
varying vec3 vTZ;
uniform mat4 uBaseToPlanet;
void main() {`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vBase = position / ${SITE_SCALE.toExponential()};
vPlanetDir = (uBaseToPlanet * vec4(position, 1.0)).xyz;
vFlat = aFlat;
vTX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
vTZ = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${FRAG_HEAD}\nvoid main() {\n${FRAG_ZONES}`)
        .replace('#include <map_fragment>', 'diffuseColor.rgb = gAlbedo;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
normal = normalize(normal - (vTX * gSlope.x + vTZ * gSlope.y));`,
        )
        .replace(
          '#include <fog_fragment>',
          `if (uHazeK > 0.0) {
  float hz = 1.0 - exp(-length(vViewPosition) * uHazeK);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, hz);
}`,
        )
    }
    m.customProgramCacheKey = () => 'starbase-ground'
    return { material: m, uniforms }
  }, [day, ocean, env])
  useEffect(() => () => geo.dispose(), [geo])

  useFrame(({ clock, camera }) => {
    uniforms.uTime.value = STILL ? 12 : clock.elapsedTime % 3600
    const d = camera.position.distanceTo(STARBASE_POS)
    uniforms.uDetail.value = 1 - smoothstep(0.03, 0.12, d)
    // aerial perspective: ~25 km visibility near the ground, none from orbit
    uniforms.uHazeK.value = (1.3e-4 / SITE_SCALE) * (1 - smoothstep(0.02, 0.2, d))
    SITE_HAZE.k.value = uniforms.uHazeK.value
  })

  return <mesh geometry={geo} material={material} receiveShadow visible={visible} />
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
