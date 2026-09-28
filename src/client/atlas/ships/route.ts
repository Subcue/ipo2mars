import { CatmullRomCurve3, Vector3 } from 'three'

// The Earth<->Mars cycler route, shared by the transit ships and the drawn
// route arc. A closed loop: the outbound leg arcs above the ecliptic, the
// return leg comes home beneath it, so motion is continuous (no teleports).
export const TRANSIT_CURVE = new CatmullRomCurve3(
  [
    new Vector3(1.3, 0.4, 0.75), // Earth departure
    new Vector3(10.4, 3.4, -5.2),
    new Vector3(22.2, 4.4, -12.6),
    new Vector3(32.4, 3.1, -19.7), // Mars approach
    new Vector3(22.2, -1.9, -16.3),
    new Vector3(9.6, -2.2, -6.7),
  ],
  true,
  'centripetal',
)

export const TRANSIT_PERIOD = 120 // seconds per full circuit

/** Route parameter (0..1, arc-length) for a uniform clock phase `tau`: ships
 *  crawl near Earth (0) and Mars (~0.5) and hurry through deep space, so a
 *  planet behind the follow camera drifts past instead of whipping by. */
export function routeParam(tau: number): number {
  const k = 0.72
  const s = tau - (k / (4 * Math.PI)) * Math.sin(4 * Math.PI * tau)
  return ((s % 1) + 1) % 1
}
