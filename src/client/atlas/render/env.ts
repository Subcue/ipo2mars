import {
  BackSide,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { SUN_DIR } from '../../scene/sunlight'

// Procedural image-based lighting, one per setting. Metal only looks like
// metal when it has something to reflect: on Mars the steel hulls pick up the
// rust ground and the butterscotch horizon, on the Moon the grey regolith and
// a black sky, in deep space a dim planet-glow "softbox". Applied PER
// MATERIAL to the vehicles and bases only (never scene.environment), so the
// planets' night sides stay truly dark.
export type EnvKind = 'space' | 'mars' | 'moon'

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const COMMON = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun;
float sunGlow(vec3 d, float k) { return pow(max(dot(d, uSun), 0.0), k); }
`

const FRAG: Record<EnvKind, string> = {
  space: /* glsl */ `
${COMMON}
void main() {
  vec3 d = normalize(vDir);
  // dim warm half toward the sun, cool planet-glow softbox below, black above
  vec3 col = vec3(0.012, 0.012, 0.014);
  col += vec3(0.2, 0.17, 0.14) * pow(max(dot(d, uSun) * 0.5 + 0.5, 0.0), 3.0) * 0.45;
  float planet = (1.0 - smoothstep(-0.8, -0.15, d.y));
  col += vec3(0.13, 0.14, 0.16) * planet * 0.6;
  // two soft studio strips so cylinders get long gradient reflections
  col += vec3(0.55) * smoothstep(0.92, 0.99, dot(d, normalize(vec3(-0.7, 0.35, 0.62)))) * 0.4;
  col += vec3(0.5) * smoothstep(0.95, 0.995, dot(d, normalize(vec3(0.2, 0.15, -0.97)))) * 0.3;
  gl_FragColor = vec4(col, 1.0);
}
`,
  mars: /* glsl */ `
${COMMON}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 horizon = vec3(0.92, 0.62, 0.42);
  vec3 zenith = vec3(0.3, 0.2, 0.16);
  vec3 sky = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.4));
  sky += vec3(1.0, 0.82, 0.6) * sunGlow(d, 10.0) * 1.4 + vec3(0.6, 0.66, 0.8) * sunGlow(d, 90.0) * 0.8;
  vec3 flatSun = normalize(vec3(uSun.x, 0.0, uSun.z));
  vec3 flatD = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
  // the ground reads brighter looking down-sun (lit faces) than into the sun
  float lit = 0.72 + 0.28 * (-dot(flatD, flatSun));
  vec3 ground = vec3(0.3, 0.15, 0.075) * lit;
  vec3 col = h >= 0.0 ? sky : mix(horizon * 0.62, ground, smoothstep(0.0, 0.18, -h));
  gl_FragColor = vec4(col * 0.9, 1.0);
}
`,
  moon: /* glsl */ `
${COMMON}
uniform vec3 uEarth;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 flatSun = normalize(vec3(uSun.x, 0.0, uSun.z));
  vec3 flatD = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
  float lit = 0.6 + 0.4 * (-dot(flatD, flatSun));
  vec3 ground = vec3(0.21, 0.205, 0.2) * lit;
  vec3 col = h >= 0.0 ? vec3(0.002, 0.002, 0.003) : mix(vec3(0.05), ground, smoothstep(0.0, 0.12, -h));
  // the Earth hanging in the black sky
  float e = smoothstep(0.9935, 0.9945, dot(d, uEarth));
  col += vec3(0.22, 0.34, 0.55) * e;
  gl_FragColor = vec4(col, 1.0);
}
`,
}

const cache = new Map<string, Texture>()

export function makeEnv(gl: WebGLRenderer, kind: EnvKind, earthDir?: Vector3): Texture {
  const key = kind
  const hit = cache.get(key)
  if (hit) return hit
  const scene = new Scene()
  const mat = new ShaderMaterial({
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uEarth: { value: (earthDir ?? new Vector3(1, 0.1, 0)).clone().normalize() },
    },
    vertexShader: VERT,
    fragmentShader: FRAG[kind],
    side: BackSide,
    depthWrite: false,
  })
  const mesh = new Mesh(new SphereGeometry(50, 64, 32), mat)
  scene.add(mesh)
  const pmrem = new PMREMGenerator(gl)
  const rt = pmrem.fromScene(scene, 0, 0.1, 100)
  pmrem.dispose()
  mesh.geometry.dispose()
  mat.dispose()
  cache.set(key, rt.texture)
  return rt.texture
}
