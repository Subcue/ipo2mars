import { CatmullRomCurve3, Vector3 } from 'three'

// The Earth<->Mars cycler route, shared by the transit ships and the drawn
// route arc. A closed loop: the outbound leg arcs above the ecliptic, the
// return leg comes home beneath it, so motion is continuous (no teleports).
export const TRANSIT_CURVE = new CatmullRomCurve3(
  [
    new Vector3(1.9, 0.6, 0.9), // Earth departure
    new Vector3(14, 4.5, -7),
    new Vector3(30, 6, -17),
    new Vector3(44.4, 3.6, -26.7), // Mars approach
    new Vector3(30, -2.5, -22),
    new Vector3(13, -3, -9),
  ],
  true,
  'centripetal',
)

export const TRANSIT_PERIOD = 140 // seconds per full circuit
