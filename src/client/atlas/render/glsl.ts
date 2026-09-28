// Shared GLSL snippets for the atlas shaders. Everything is deterministic
// (hash-based, no textures), so surfaces never shimmer between frames.

/** Hash + 3D value noise + fbm. `fbm3` takes an octave count (constant loop
 *  bound with an early break, valid in GLSL ES 3.0). */
export const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i);
  float b = hash13(i + vec3(1.0, 0.0, 0.0));
  float c = hash13(i + vec3(0.0, 1.0, 0.0));
  float d = hash13(i + vec3(1.0, 1.0, 0.0));
  float e = hash13(i + vec3(0.0, 0.0, 1.0));
  float g = hash13(i + vec3(1.0, 0.0, 1.0));
  float h = hash13(i + vec3(0.0, 1.0, 1.0));
  float k = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float fbm3(vec3 p, int octaves) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * vnoise(p);
    p = p * 2.03 + vec3(17.1, 5.3, 11.7);
    a *= 0.5;
  }
  return s;
}
`

/** Equirectangular UV of a unit direction, matching three's SphereGeometry. */
export const SPHERE_UV = /* glsl */ `
vec2 sphereUv(vec3 d) {
  float u = atan(d.z, -d.x) / 6.28318530718;
  return vec2(fract(u), 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265359);
}
`

/** Ray/sphere intersection: (tNear, tFar), tNear > tFar when missed. */
export const RAY_SPHERE = /* glsl */ `
vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
`
