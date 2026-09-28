// One coarse device tier for the atlas. Phones and small/low-core machines
// get fewer atmosphere samples, smaller shadow maps and a lighter star field;
// the look is the same, just cheaper.
const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
const small = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 820
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
const low = coarse || small || cores <= 4

export const QUALITY = {
  low,
  dpr: (low ? [1, 1.5] : [1, 2]) as [number, number],
  shadowSize: low ? 1024 : 2048,
  atmoSteps: low ? 8 : 12,
  atmoLightSteps: low ? 3 : 4,
  stars: low ? 5500 : 11000,
  rocks: low ? 700 : 1800,
  terrainRings: low ? 180 : 320,
  terrainSegs: low ? 256 : 448,
  surfaceOctaves: low ? 3 : 5,
  terrainOctaves: low ? 5 : 7,
}
