import { Matrix4, Quaternion, Vector3 } from 'three'
import { SUN_DIR } from '../scene/sunlight'

// Stage-scale layout (NOT real scale): Earth (radius 1) at the origin, the
// Moon on a flat orbit a little below Earth's equator, Mars parked far out so
// camera flights feel like travel.
export const EARTH_POS = new Vector3(0, 0, 0)

/** Starbase, Boca Chica (Texas): latitude, longitude in degrees. */
const STARBASE_LAT = 25.997
const STARBASE_LON = -97.157

/** East, up and north at a latitude/longitude, in the object space of three's
 *  SphereGeometry with an equirectangular map (u = 0 at 180 W). */
export function geoFrame(latDeg: number, lonDeg: number) {
  const lat = (latDeg * Math.PI) / 180
  const phi = ((lonDeg + 180) * Math.PI) / 180
  const up = new Vector3(-Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat))
  const north = new Vector3(Math.cos(phi) * Math.sin(lat), Math.cos(lat), -Math.sin(phi) * Math.sin(lat))
  const east = new Vector3(Math.sin(phi), 0, Math.cos(phi))
  return { up, north, east }
}

/** The atlas Earth does not spin: it is turned so Starbase sits at the top of
 *  the globe with local up = world +Y, north = +Z and east = -X. The launch
 *  site is then a surface base like the others (world up is its up), the sun
 *  stands 24 degrees high in the west-northwest (a late-afternoon launch), and
 *  the Earth close-up (flight.ts EARTH_VIEW) sees North America north-up. */
export const EARTH_QUAT = (() => {
  const { up, north, east } = geoFrame(STARBASE_LAT, STARBASE_LON)
  const m = new Matrix4().makeBasis(east.clone().negate(), up, north).transpose()
  return new Quaternion().setFromRotationMatrix(m)
})()

/** Site frame at Starbase: base-local metres (x east, y up, z south, the
 *  convention of every base layout) -> world directions. East is world -X. */
export const SITE_QUAT = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)

/** Starbase's direction in the Earth mesh's object space (patch hole). */
export const STARBASE_DIR_OBJ = geoFrame(STARBASE_LAT, STARBASE_LON).up

/** World position of the launch site (the top of the globe). */
export const STARBASE_POS = new Vector3(0, 1, 0)

/** Site metres (base-local) -> world position. */
export function siteToWorld(v: Vector3, out = new Vector3()): Vector3 {
  return out.copy(v).applyQuaternion(SITE_QUAT).multiplyScalar(SITE_SCALE).add(STARBASE_POS)
}

/** Metres -> stage units at Starbase and for the vehicles in low orbit. Finer
 *  than the other bases so the Gulf horizon sits kilometres away. */
export const SITE_SCALE = 5.0e-6

// Low-orbit refueling: 450 km up (stage 0.07), 18 degrees from Starbase
// toward the sun, over the bright day side: blue sea and cloud below, the
// sunlit limb and black space beyond.
const ANTI_SUN_H = new Vector3(-SUN_DIR.x, 0, -SUN_DIR.z).normalize()
const REFUEL_ARC = (-18 * Math.PI) / 180
/** Local up at the depot (the Earth is straight "below" it). */
export const REFUEL_UP = new Vector3(0, Math.cos(REFUEL_ARC), 0).addScaledVector(ANTI_SUN_H, Math.sin(REFUEL_ARC)).normalize()
export const REFUEL_POS = REFUEL_UP.clone().multiplyScalar(1.07)
/** Along the docked pair (the orbit direction); the sun lies across it. */
export const REFUEL_FWD = new Vector3().crossVectors(new Vector3(0, 1, 0), ANTI_SUN_H).normalize()
/** Scene frame: x along the pair, y up, z away from the sun. */
export const REFUEL_QUAT = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(REFUEL_FWD, REFUEL_UP, new Vector3().crossVectors(REFUEL_FWD, REFUEL_UP)),
)
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
  /** Centre of the docked pair in low orbit. */
  refuel: new Vector3(0, 1.07, 0),
  moonBase: new Vector3(9, MOON_ORBIT.y + MOON_RADIUS, 0),
  /** Set once each moving thing has written a live anchor; the camera waits
   *  on these before its first placement (bodies load async via Suspense). */
  ready: { moon: false, mars: false, ship: false },
  /** Something that casts shadows moved this frame (static shadow maps
   *  otherwise refresh only now and then; see SunLight). */
  shadowsDirty: false,
  /** Shell atmosphere strength (1 = full); the ground skies take over near
   *  the surface (render/GroundSky.tsx). */
  airFade: { earth: 1, mars: 1 } as Record<'earth' | 'mars', number>,
  /** 0 far from Earth .. 1 in low orbit: Earth's shell air goes real-scale. */
  earthNear: 0,
}
