import { NOISE, SPHERE_UV } from '../render/glsl'

// Procedural surface detail shared by the Moon/Mars spheres and the terrain
// patches under the bases, so the two always agree where they meet.
//
// Craters live in a 3D cell lattice (the surface is a sphere, so every
// crater is a sphere/sphere intersection: a circle on the ground) at several
// octaves, each faded out once its cells get smaller than a few pixels.
// Heights come with ANALYTIC gradients (crater profiles and value noise are
// differentiated in closed form), so the bent normals are exact at any view
// angle: no screen-space derivative streaks at grazing angles, no textures to
// run out of as the camera closes in.
export const SURFACE_GLSL = /* glsl */ `
${NOISE}
${SPHERE_UV}
// value noise with its gradient (iq): (value, d/dp)
vec4 vnoiseD(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  vec3 du = 6.0 * f * (1.0 - f);
  float a = hash13(i);
  float b = hash13(i + vec3(1.0, 0.0, 0.0));
  float c = hash13(i + vec3(0.0, 1.0, 0.0));
  float d = hash13(i + vec3(1.0, 1.0, 0.0));
  float e = hash13(i + vec3(0.0, 0.0, 1.0));
  float f1 = hash13(i + vec3(1.0, 0.0, 1.0));
  float g = hash13(i + vec3(0.0, 1.0, 1.0));
  float h = hash13(i + vec3(1.0, 1.0, 1.0));
  float k1 = b - a;
  float k2 = c - a;
  float k3 = e - a;
  float k4 = a - b - c + d;
  float k5 = a - c - e + g;
  float k6 = a - b - e + f1;
  float k7 = -a + b + c - d + e - f1 - g + h;
  float v = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  vec3 dv = du * vec3(
    k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
    k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
    k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  return vec4(v, dv);
}
// p in cell units, the 8 cells nearest p. Returns (height, d height / dp) in
// cell units; rim collects a "fresh ejecta" term for albedo.
vec4 craterCellsD(vec3 p, float seed, float density, inout float rim) {
  vec3 b = floor(p - 0.5);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    vec3 c = b + vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
    vec3 r3 = hash33(c + seed);
    if (r3.x > density) continue;
    vec3 ctr = c + 0.2 + 0.6 * r3.yzx;
    float rad = 0.1 + 0.36 * pow(hash13(c * 1.37 + seed), 1.7);
    // old craters are softened: shallower bowls, lower rims
    float fresh = 0.3 + 0.7 * pow(r3.z, 1.5);
    vec3 dp = p - ctr;
    float dist = length(dp);
    float d = dist / rad;
    if (d > 1.9) continue;
    float inside = step(d, 1.0);
    float ex = exp(-pow((d - 1.0) / 0.32, 2.0));
    float prof = inside * (d * d - 1.0) * 0.42 + 0.11 * ex;
    float dprof = inside * 0.84 * d - 0.11 * ex * 2.0 * (d - 1.0) / (0.32 * 0.32);
    acc.x += rad * prof * fresh;
    acc.yzw += dprof * fresh * dp / max(dist, 1e-5);
    rim += (rad * exp(-pow((d - 1.05) / 0.28, 2.0)) - inside * (1.0 - d * d) * rad * 0.35) * fresh;
  }
  return acc;
}
// dir: unit planet-local direction, R: radius, fw: pixel footprint (unit
// sphere units). Outputs: grad = slope of the detail height (planet space),
// alb = albedo modulation.
void surfaceDetail(vec3 dir, float R, float fw, float craterAmt, float density, float roughAmt,
                   int octaves, float cell0, out vec3 grad, out float alb) {
  grad = vec3(0.0);
  alb = 0.0;
  float cell = cell0;
  for (int k = 0; k < 8; k++) {
    if (k >= octaves) break;
    float vis = clamp((0.22 * cell - fw) / (0.14 * cell), 0.0, 1.0);
    if (vis > 0.0) {
      float rim = 0.0;
      vec4 cr = craterCellsD(dir / cell, float(k) * 17.0 + 3.0, density, rim);
      grad += cr.yzw * craterAmt * vis;
      alb += rim * 1.3 * craterAmt * vis;
      vec4 n = vnoiseD(dir / cell * 2.7 + float(k) * 7.0);
      grad += n.yzw * (2.7 * 0.06) * roughAmt * vis;
      alb += (n.x - 0.5) * 0.14 * vis;
    }
    cell *= 0.43;
  }
}
`

export interface SurfaceLook {
  /** Crater relief strength (0 = none). */
  craters: number
  /** Fraction of lattice cells holding a crater. */
  density: number
  /** Fine noise relief. */
  rough: number
  /** Albedo modulation strength. */
  albedo: number
  /** Bump multiplier (slope -> normal). */
  bump: number
  /** Largest crater cell, unit-sphere units. */
  cell0: number
}

export const MOON_LOOK: SurfaceLook = { craters: 1, density: 0.46, rough: 1, albedo: 0.2, bump: 1, cell0: 0.05 }
export const MARS_LOOK: SurfaceLook = { craters: 0.4, density: 0.28, rough: 0.9, albedo: 0.16, bump: 1, cell0: 0.04 }
