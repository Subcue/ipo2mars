import { Vector3 } from 'three'
import { EARTH_POS, SHIP_LENGTH, anchors, shipCamDir, view } from './stage'
import { SUN_DIR } from '../scene/sunlight'

export type DestKey = 'overview' | 'earth' | 'moon' | 'mars' | 'ship'

const UP = new Vector3(0, 1, 0)

/** Horizontal unit vector of `v` rotated by `deg` about world up. */
function flatDir(v: Vector3, deg = 0): Vector3 {
  const d = new Vector3(v.x, 0, v.z)
  if (d.lengthSq() < 1e-9) d.set(1, 0, 0)
  d.normalize()
  return d.applyAxisAngle(UP, (deg * Math.PI) / 180)
}

/** Portrait screens see a narrow slice horizontally (three's FOV is
 *  vertical): pull the camera back so the subject still fits. */
function fit(): number {
  return Math.pow(Math.min(2, Math.max(1, 1.15 / view.aspect)), 0.8)
}

const portrait = () => view.aspect < 0.9

/** Camera on a spherical offset around a target: horizontal heading `dir`,
 *  elevation `elevDeg`, distance `dist`. */
function orbitPos(target: Vector3, dir: Vector3, elevDeg: number, dist: number): Vector3 {
  const e = (elevDeg * Math.PI) / 180
  const d = dist * fit()
  return target.clone().addScaledVector(dir, Math.cos(e) * d).addScaledVector(UP, Math.sin(e) * d)
}

export interface Destination {
  label: string
  /** Live focal point (moving targets resolve at call time). */
  target: () => Vector3
  /** Arrival camera position. */
  cameraPos: () => Vector3
  /** Whether the target moves: the camera rig chases it every frame. */
  tracks?: boolean
  /** Chase cam: the camera offset also turns with the target's heading. */
  chase?: boolean
  minDistance: number
  maxDistance: number
  /** Keep the camera above the local horizon (surface bases: world up is the
   *  local up there by construction, see stage.ts). */
  maxPolar?: number
  /** Slow idle orbit (rad/s) once the visitor stops interacting. */
  drift: number
  /** Shadow frustum half-size around the target, or 0 for none. */
  shadow: number
  info: { name: string; fact: string; href: string; link: string }
}

// The sun's heading on the ground at the bases (world up = local up there).
const SUN_FLAT = flatDir(SUN_DIR)

/** Earth close-up heading: ~90 degrees off the sun, so the terminator runs
 *  down the middle of the disc (day side glinting, cities lit on the night
 *  side). The launch streak is staged on this side of the planet. */
export const EARTH_VIEW = new Vector3(-0.57, 0.26, 0.78).normalize()

export const DESTINATIONS: Record<DestKey, Destination> = {
  overview: {
    label: 'Overview',
    // Landscape: Earth big in the lower left, Mars up the route to the right.
    // Portrait: Earth low, Mars high, pulled back to fit both.
    target: () => (portrait() ? new Vector3(10.2, 0.75, -6.3) : new Vector3(5.1, 0.38, -3.15)),
    cameraPos: () => (portrait() ? new Vector3(-7.33, 4.57, 6.43) : new Vector3(-1.5, 2.3, 8.55)),
    minDistance: 6,
    maxDistance: 90,
    drift: 0.008,
    shadow: 0,
    info: {
      name: 'The stage',
      fact: 'Earth, the Moon, and Mars, with Starships working the route between them.',
      href: '/spacex-ipo',
      link: 'Why this map exists',
    },
  },
  earth: {
    label: 'Earth',
    target: () => EARTH_POS.clone(),
    cameraPos: () => EARTH_VIEW.clone().multiplyScalar(3.2 * fit()),
    minDistance: 1.25,
    maxDistance: 14,
    drift: 0.008,
    shadow: 0,
    info: {
      name: 'Earth',
      fact: 'Every dot is a real Starlink satellite, live from CelesTrak orbital data. Sunlit ones glint; the rest pass through the night.',
      href: '/starlink',
      link: 'The Starlink mesh',
    },
  },
  moon: {
    label: 'Moon',
    target: () => {
      const toEarth = flatDir(anchors.moon.clone().negate())
      // portrait: aim higher so the Earth over the horizon stays in frame
      return anchors.moonBase.clone().addScaledVector(UP, portrait() ? 0.0032 : 0.0005).addScaledVector(toEarth, 0.004)
    },
    // Look across the outpost toward the Earth hanging over the horizon.
    cameraPos: () => {
      const toEarth = flatDir(anchors.moon.clone().negate())
      return orbitPos(anchors.moonBase, toEarth.clone().negate().applyAxisAngle(UP, portrait() ? 0.07 : 0.3), 8, 0.0125)
    },
    tracks: true,
    minDistance: 0.0016,
    maxDistance: 3,
    maxPolar: Math.PI / 2 - 0.02,
    drift: 0.012,
    shadow: 0.016,
    info: {
      name: 'The Moon',
      fact: 'Starship HLS is the contracted lander; the first crewed landing targets Artemis IV.',
      href: '/moon',
      link: 'The proving ground',
    },
  },
  mars: {
    label: 'Mars',
    target: () => anchors.marsBase.clone().addScaledVector(UP, 0.0004),
    // Late-afternoon light raking across the settlement from the right.
    cameraPos: () => orbitPos(anchors.marsBase, SUN_FLAT.clone().applyAxisAngle(UP, (-128 * Math.PI) / 180), 12, 0.0135),
    tracks: true,
    minDistance: 0.0016,
    maxDistance: 3.5,
    maxPolar: Math.PI / 2 - 0.02,
    drift: 0.01,
    shadow: 0.018,
    info: {
      name: 'Mars',
      fact: 'The stated goal: a self-sustaining city of a million people.',
      href: '/mars',
      link: 'Run the settlement simulator',
    },
  },
  ship: {
    label: 'Ship',
    target: () => anchors.ship.clone().addScaledVector(anchors.shipTan, SHIP_LENGTH * 0.5),
    cameraPos: () => {
      const dir = shipCamDir(anchors.shipTan)
      const lift = new Vector3().crossVectors(anchors.shipTan, dir).normalize()
      return anchors.ship
        .clone()
        .addScaledVector(anchors.shipTan, SHIP_LENGTH * 0.62)
        .addScaledVector(dir, SHIP_LENGTH * 2.5 * fit())
        .addScaledVector(lift, SHIP_LENGTH * 0.45)
    },
    tracks: true,
    chase: true,
    minDistance: SHIP_LENGTH * 0.9,
    maxDistance: SHIP_LENGTH * 40,
    drift: 0,
    shadow: SHIP_LENGTH * 0.75,
    info: {
      name: 'In transit',
      fact: 'A Starship on the long arc between Earth and Mars. Stylized, not an official design.',
      href: '/mars#simulator',
      link: 'How many ships does it take',
    },
  },
}

export function isDestKey(v: string | null): v is DestKey {
  return v === 'overview' || v === 'earth' || v === 'moon' || v === 'mars' || v === 'ship'
}
