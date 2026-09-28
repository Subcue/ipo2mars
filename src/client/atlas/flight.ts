import { Vector3 } from 'three'
import { BASE_SCALE, EARTH_POS, REFUEL_FWD, REFUEL_QUAT, REFUEL_UP, SHIP_LENGTH, SITE_SCALE, STARBASE_POS, anchors, shipCamDir, siteToWorld, view } from './stage'
import { SUN_DIR } from '../scene/sunlight'
import { pad, PAD_GRADE } from './starbase/state'

export type DestKey = 'overview' | 'earth' | 'starbase' | 'refuel' | 'moon' | 'mars' | 'ship'

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
  /** Lowest world Y the camera may take (flat sites where the camera looks
   *  up at tall things, so a polar limit would be too strict). */
  floor?: number
  /** Vertical field of view (degrees); 40 unless set. Long lenses compress
   *  a launch site the way launch photographers shoot it. */
  fov?: number | (() => number)
  /** The camera holds its position and turns to keep the (moving) target in
   *  view, instead of travelling with it. */
  aim?: boolean
  /** Slow idle orbit (rad/s) once the visitor stops interacting. */
  drift: number
  /** Shadow frustum half-size around the target, or 0 for none. */
  shadow: number
  /** Centre of the shadow frustum when it should not follow the target. */
  shadowCenter?: () => Vector3
  info: { name: string; fact: string; href: string; link: string }
}

// The sun's heading on the ground at the bases (world up = local up there).
const SUN_FLAT = flatDir(SUN_DIR)

/** Earth close-up heading: above North America with north up the screen
 *  (the view lies in the plane of world up and the Earth's axis), Starbase
 *  low on the disc where the ascent streak climbs out over the Gulf, and the
 *  evening terminator slicing through, cities lit beyond it. */
export const EARTH_VIEW = new Vector3(0, 0.9, -0.44).normalize()

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
      fact: 'Earth, the Moon and Mars, with fleets of Starships working the route between them.',
      href: '/spacex-ipo',
      link: 'Why this map exists',
    },
  },
  earth: {
    label: 'Earth',
    target: () => EARTH_POS.clone(),
    cameraPos: () => EARTH_VIEW.clone().multiplyScalar(3.6 * fit()),
    minDistance: 1.25,
    maxDistance: 14,
    drift: 0.008,
    shadow: 0,
    info: {
      name: 'Earth',
      fact: 'Every dot is a real Starlink satellite, live from CelesTrak orbital data. Watch for a launch climbing out of Starbase over the Gulf.',
      href: '/starlink',
      link: 'The Starlink mesh',
    },
  },
  starbase: {
    label: 'Starbase',
    // From the flats south-southwest of the pad: the morning sun rakes in
    // from the right, the Gulf is on the right, and the ascent climbs away
    // to the right over the water. The camera holds its place and turns to
    // follow the action (the launch sequence says where and how wide).
    target: () => siteToWorld(new Vector3(pad.focus.x, pad.focus.y + PAD_GRADE, pad.focus.z)),
    cameraPos: () => siteToWorld(new Vector3(-Math.sin(0.36), 0, Math.cos(0.36)).multiplyScalar(1000 * fit()).setY(9)),
    aim: true,
    fov: () => pad.fov,
    shadowCenter: () => siteToWorld(new Vector3(-20, 70, 0)),
    minDistance: 60 * SITE_SCALE,
    maxDistance: 2.5,
    floor: STARBASE_POS.y + 4 * SITE_SCALE,
    drift: 0.006,
    shadow: 420 * SITE_SCALE,
    info: {
      name: 'Starbase',
      fact: 'Boca Chica, Texas. Super Heavy lifts off on 33 Raptors, then flies home and the tower catches it out of the air. So does the ship.',
      href: '/spacex-ipo',
      link: 'Why reuse is the business',
    },
  },
  refuel: {
    label: 'Refuel',
    // From the sunward side, a little above the pair: the ships in full sun,
    // the day side curving away below them to its thin blue limb.
    target: () => anchors.refuel.clone().addScaledVector(REFUEL_UP, 6 * SITE_SCALE),
    cameraPos: () =>
      anchors.refuel
        .clone()
        .add(new Vector3(-0.25, 0.32, -1).applyQuaternion(REFUEL_QUAT).normalize().multiplyScalar(175 * SITE_SCALE * fit()))
        .addScaledVector(REFUEL_FWD, -10 * SITE_SCALE),
    tracks: true,
    fov: 34,
    minDistance: 35 * SITE_SCALE,
    maxDistance: 1.2,
    drift: 0.01,
    shadow: 95 * SITE_SCALE,
    info: {
      name: 'Orbital refueling',
      fact: 'A tanker docks tail-to-tail with a depot 450 km up and pumps its propellant across. Several loads fill a Starship for the Moon or Mars.',
      href: '/moon',
      link: 'Why refilling is the key',
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
      fact: 'An outpost built on Starship landers, which set down on thrusters high on the hull. The long rail is a mass driver, an old idea for flinging lunar-made cargo into space.',
      href: '/moon',
      link: 'The proving ground',
    },
  },
  mars: {
    label: 'Mars',
    // Across the starport toward the domed city: landed Starships near and
    // far, one coming in on its landing burn, the glass dome beyond, the
    // afternoon sun rimming everything from the right.
    target: () => anchors.marsBase.clone().add(new Vector3(-300, 45, 90).multiplyScalar(BASE_SCALE)),
    cameraPos: () =>
      orbitPos(
        anchors.marsBase.clone().add(new Vector3(-300, 45, 90).multiplyScalar(BASE_SCALE)),
        SUN_FLAT.clone().applyAxisAngle(UP, (-128 * Math.PI) / 180),
        7,
        900 * BASE_SCALE,
      ),
    tracks: true,
    minDistance: 0.0016,
    maxDistance: 3.5,
    maxPolar: Math.PI / 2 - 0.02,
    drift: 0.01,
    shadow: 0.018,
    info: {
      name: 'Mars',
      fact: 'A fleet on the pads, a glass dome over a park, the plant that makes propellant for the trip home. The stated goal: a self-sustaining city of a million.',
      href: '/mars',
      link: 'Run the settlement simulator',
    },
  },
  ship: {
    label: 'Fleet',
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
      name: 'The fleet',
      fact: 'Transfer windows open every 26 months, so ships leave for Mars together. Stylized, not official designs.',
      href: '/mars#simulator',
      link: 'How many ships does it take',
    },
  },
}

export function isDestKey(v: string | null): v is DestKey {
  return v === 'overview' || v === 'earth' || v === 'starbase' || v === 'refuel' || v === 'moon' || v === 'mars' || v === 'ship'
}
