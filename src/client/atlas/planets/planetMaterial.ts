import {
  Color,
  Matrix3,
  Matrix4,
  MeshStandardMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { SURFACE_GLSL, type SurfaceLook } from './surfaceGlsl'

const MAX_TRACKS = 20

export interface PlanetUniforms {
  uR: { value: number }
  uLookA: { value: Vector4 }
  uLookB: { value: Vector2 }
  uPatchDir: { value: Vector3 }
  uPatchCos: { value: number }
  uHazeColor: { value: Color }
  uHazeK: { value: number }
  uBaseToPlanet: { value: Matrix4 }
  /** Planet-space -> object-space rotation (identity for the sphere). */
  uPlanetToObj: { value: Matrix3 }
}

interface PatchOpts {
  /** Metres -> stage units (positions arrive in stage units). */
  scale: number
  /** Vehicle tracks, base-local metres: [x1, z1, x2, z2]. */
  tracks: number[][]
  /** Baked ground-detail slopes (terrain/detailTexture.ts). */
  detail: Texture
}

interface Opts {
  map: Texture
  radius: number
  look: SurfaceLook
  octaves: number
  /** Terrain patch mode: positions are base-local, the planet map is
   *  sampled by direction (the patch has no UVs), graded ground (aFlat)
   *  loses its craters, and rover tracks are drawn in. */
  patch?: PatchOpts
}

// MeshStandardMaterial + procedural surface detail (surfaceGlsl.ts):
// crater/noise bump and albedo variation that keep resolving as the camera
// closes in, a hole where the terrain patch takes over, and an aerial haze
// term (Mars) applied where three's fog would be.
export function makePlanetMaterial({ map, radius, look, octaves, patch }: Opts) {
  const uniforms: PlanetUniforms = {
    uR: { value: radius },
    uLookA: { value: new Vector4(look.craters, look.density, look.rough, look.albedo) },
    uLookB: { value: new Vector2(look.bump, look.cell0) },
    uPatchDir: { value: new Vector3(0, 1, 0) },
    uPatchCos: { value: 2 }, // > 1: no hole
    uHazeColor: { value: new Color(0, 0, 0) },
    uHazeK: { value: 0 },
    uBaseToPlanet: { value: new Matrix4() },
    uPlanetToObj: { value: new Matrix3() },
  }
  const tracks = (patch?.tracks ?? []).slice(0, MAX_TRACKS)
  const trackU = { value: Array.from({ length: MAX_TRACKS }, (_, i) => new Vector4(...(tracks[i] ?? [0, 0, 0, 0]))) }
  const m = new MeshStandardMaterial({ map, roughness: 1, metalness: 0 })
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.uniforms.uTracks = trackU
    if (patch) shader.uniforms.uDetail = { value: patch.detail }
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `varying vec3 vPlanetPos;
uniform mat4 uBaseToPlanet;
uniform mat3 uPlanetToObj;
varying vec3 vP2V0;
varying vec3 vP2V1;
varying vec3 vP2V2;
${patch ? 'attribute float aFlat;\nvarying float vFlat;\nvarying vec3 vBase;' : ''}
void main() {`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
// planet space -> view space, for the analytic detail slope
vP2V0 = normalMatrix * uPlanetToObj[0];
vP2V1 = normalMatrix * uPlanetToObj[1];
vP2V2 = normalMatrix * uPlanetToObj[2];`,
      )
      .replace(
        '#include <begin_vertex>',
        patch
          ? `#include <begin_vertex>
vPlanetPos = (uBaseToPlanet * vec4(position, 1.0)).xyz;
vFlat = aFlat;
vBase = position / ${patch.scale.toExponential()};`
          : '#include <begin_vertex>\nvPlanetPos = position;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec3 vPlanetPos;
uniform float uR;
uniform vec4 uLookA;
uniform vec2 uLookB;
uniform vec3 uPatchDir;
uniform float uPatchCos;
uniform vec3 uHazeColor;
uniform float uHazeK;
varying vec3 vP2V0;
varying vec3 vP2V1;
varying vec3 vP2V2;
${patch ? `varying float vFlat;\nvarying vec3 vBase;\nuniform vec4 uTracks[${MAX_TRACKS}];\nuniform sampler2D uDetail;\nuniform mat4 uBaseToPlanet;` : 'const float vFlat = 0.0;'}
${SURFACE_GLSL}
void main() {
  vec3 pdir = normalize(vPlanetPos);
  bool cut = dot(pdir, uPatchDir) > uPatchCos;
  // The hole under the terrain patch: bail out before any detail work (log
  // depth disables early-z, so hidden fragments would pay full price).
  if (cut) discard;
  float fwp = length(fwidth(pdir));
  float wild = 1.0 - vFlat * 0.92;
  vec3 sdGrad = vec3(0.0);
  float sdAlb = 0.0;
  ${
    patch
      ? `{
    // baked ground detail at four scales (base-local metres), each rotated
    // to hide the repeat; slopes rotate back into base axes (R^T)
    vec2 q = vBase.xz;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float sc = 260.0 * pow(0.26, fi);
      float a = fi * 1.13 + 0.4;
      mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
      vec4 t = texture2D(uDetail, R * q / sc + vec2(0.37, 0.71) * fi);
      vec2 sl = transpose(R) * ((t.rg - 0.5) * 4.0);
      float amp = (0.95 - 0.12 * fi) * wild * uLookA.x;
      sdGrad += vec3(sl.x, 0.0, sl.y) * amp;
      sdAlb += (t.b - 0.5) * (0.9 - 0.15 * fi) * wild;
    }
    sdGrad = mat3(uBaseToPlanet) * sdGrad;
  }`
      : `surfaceDetail(pdir, uR, fwp, uLookA.x * wild, uLookA.y, uLookA.z * wild, ${octaves}, uLookB.y, sdGrad, sdAlb);`
  }`,
      )
      .replace(
        '#include <map_fragment>',
        patch
          ? `diffuseColor *= texture2D(map, sphereUv(pdir));
diffuseColor.rgb *= clamp(1.0 + sdAlb * uLookA.w, 0.45, 1.6);
{
  // rover tracks: twin ruts in a faint disturbed band, faded before they
  // get thinner than a pixel
  vec2 q = vBase.xz;
  float aa = clamp(1.6 - fwidth(q.x) * 2.2, 0.0, 1.0);
  float tr = 0.0;
  for (int i = 0; i < ${MAX_TRACKS}; i++) {
    vec4 t = uTracks[i];
    vec2 ba = t.zw - t.xy;
    float L2 = dot(ba, ba);
    if (L2 < 1.0) continue;
    vec2 pa = q - t.xy;
    float hh = clamp(dot(pa, ba) / L2, 0.0, 1.0);
    float d = length(pa - ba * hh);
    float ruts = ((1.0 - smoothstep(0.2, 0.7, abs(d - 1.4))) + (1.0 - smoothstep(0.2, 0.7, abs(d - 4.6))) * 0.6) * aa;
    float band = (1.0 - smoothstep(2.0, 9.0, d)) * 0.5;
    tr = max(tr, max(ruts, band));
  }
  diffuseColor.rgb *= 1.0 - tr * 0.22;
}`
          : `#include <map_fragment>
diffuseColor.rgb *= clamp(1.0 + sdAlb * uLookA.w, 0.45, 1.6);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // tilt the normal by the detail slope (analytic, planet -> view space)
  vec3 G = mat3(vP2V0, vP2V1, vP2V2) * sdGrad;
  normal = normalize(normal - (G - normal * dot(G, normal)) * uLookB.x);
}`,
      )
      .replace(
        '#include <fog_fragment>',
        `if (uHazeK > 0.0) {
  float hz = 1.0 - exp(-length(vViewPosition) * uHazeK);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, hz);
}`,
      )
  }
  m.customProgramCacheKey = () => `planet-${patch ? 'p' : 's'}-${octaves}`
  return { material: m, uniforms }
}
