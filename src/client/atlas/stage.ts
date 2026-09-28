import { Quaternion, Vector3 } from 'three'
import { SUN_DIR } from '../scene/sunlight'

// Stage-scale layout (NOT real scale): Earth (radius 1) at the origin, the
// Moon on a flat orbit a little below Earth's equator, Mars parked far out so
// camera flights feel like travel.
export const EARTH_POS = new Vector3(0, 0, 0)
export const MARS_POS = new Vector3(34, 2.5, -21)
export const MARS_RADIUS = 0.62
/** Mars's axial tilt on the stage (radians, about world X). */
export const MARS_TILT = 0.44
export const MOON_RADIUS = 0.5

/** The Moon's orbit: flat (in the world XZ plane) so a base at its north pole
 *  always has world +Y as its local up, and dropped slightly below Earth so
 *  from that base the Earth always hangs just above the horizon. */
export const MOON_ORBIT = { radius: 9, y: -1.15, speed: 0.02, phase: 2.2 }

/** Transit Starship length in stage units (tiny next to a planet, on purpose). */
export const SHIP_LENGTH = 0.03

/** Follow-camera heading for a ship flying along `tan`: perpendicular to the
 *  velocity, swung 50 degrees off the sun so the key light rakes across the
 *  hull (never a back-lit silhouette, never flat front light). Smooth along
 *  the whole route, so the ship's roll (TransitShip) can depend on it too. */
export function shipCamDir(tan: Vector3, out = new Vector3()): Vector3 {
  out.copy(SUN_DIR).addScaledVector(tan, -SUN_DIR.dot(tan))
  if (out.lengthSq() < 1e-6) out.set(0, 1, 0).addScaledVector(tan, -tan.y)
  out.normalize()
  return out.applyAxisAngle(tan, 0.87)
}

/** Live viewport shape (kept in sync by the canvas): framing adapts to it. */
export const view = { aspect: 1.6 }

/** Metres -> stage units for the surface bases and landed vehicles. */
export const BASE_SCALE = 2.0e-5

// Live world positions of MOVING things, written each frame by their
// components and read by the flight director (camera chase) and pickers.
export const anchors = {
  moon: new Vector3(9, MOON_ORBIT.y, 0),
  ship: new Vector3(20, 2, -12),
  /** Transit ship velocity direction, for side-on follow framing. */
  shipTan: new Vector3(1, 0, 0),
  /** Transit ship orientation, so the follow camera can turn with it. */
  shipQuat: new Quaternion(),
  /** World positions of the surface bases (their local up is world +Y). */
  marsBase: new Vector3(34, 3.12, -21),
  moonBase: new Vector3(9, MOON_ORBIT.y + MOON_RADIUS, 0),
  /** Set once each moving thing has written a live anchor; the camera waits
   *  on these before its first placement (bodies load async via Suspense). */
  ready: { moon: false, mars: false, ship: false },
  /** Something that casts shadows moved this frame (static shadow maps
   *  otherwise refresh only now and then; see SunLight). */
  shadowsDirty: false,
}
