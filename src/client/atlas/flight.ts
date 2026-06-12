import { Vector3 } from 'three'
import { EARTH_POS, MARS_POS, anchors } from './stage'

export type DestKey = 'overview' | 'earth' | 'moon' | 'mars' | 'ship'

export interface Destination {
  label: string
  /** Live focal point (moving bodies resolve at call time). */
  target: () => Vector3
  /** Whether the target moves: the camera rig chases it every frame. */
  tracks?: boolean
  /** Approach offset direction (normalized-ish) and distance. */
  approach: Vector3
  distance: number
  minDistance: number
  maxDistance: number
  /** Optional custom arrival camera position (overrides approach math). */
  cameraPos?: () => Vector3
  info: { name: string; fact: string; href: string; link: string }
}

export const DESTINATIONS: Record<DestKey, Destination> = {
  overview: {
    label: 'Overview',
    target: () => new Vector3(16, 1, -10),
    approach: new Vector3(-0.55, 0.45, 1),
    distance: 34,
    minDistance: 10,
    maxDistance: 90,
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
    approach: new Vector3(0.35, 0.28, 1),
    distance: 3.4,
    minDistance: 1.35,
    maxDistance: 12,
    info: {
      name: 'Earth',
      fact: 'Every dot is a real Starlink satellite, live from CelesTrak orbital data.',
      href: '/starlink',
      link: 'The Starlink mesh',
    },
  },
  moon: {
    label: 'Moon',
    target: () => anchors.moon.clone(),
    tracks: true,
    approach: new Vector3(0.5, 0.35, 1),
    distance: 1.7,
    minDistance: 0.8,
    maxDistance: 6,
    info: {
      name: 'The Moon',
      fact: 'Starship HLS is the contracted lander; the first crewed landing targets Artemis IV.',
      href: '/moon',
      link: 'The proving ground',
    },
  },
  mars: {
    label: 'Mars',
    target: () => MARS_POS.clone(),
    approach: new Vector3(0.5, 0.3, 0.81),
    distance: 2.3,
    minDistance: 0.95,
    maxDistance: 8,
    info: {
      name: 'Mars',
      fact: 'The stated goal: a self-sustaining city of a million people.',
      href: '/mars',
      link: 'Run the settlement simulator',
    },
  },
  ship: {
    label: 'Ship',
    target: () => anchors.ship.clone(),
    tracks: true,
    approach: new Vector3(0.6, 0.4, 1),
    distance: 0.9,
    minDistance: 0.3,
    maxDistance: 4,
    // Side-on arrival: offset perpendicular to the velocity, lifted a touch.
    cameraPos: () => {
      const side = new Vector3(0, 1, 0).cross(anchors.shipTan)
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0)
      return side.normalize().multiplyScalar(0.9).addScaledVector(new Vector3(0, 1, 0), 0.25).add(anchors.ship)
    },
    info: {
      name: 'In transit',
      fact: 'A Starship on the long arc between Earth and Mars. Stylized, not an official design.',
      href: '/mars#simulator',
      link: 'How many ships does it take',
    },
  },
}

/** Camera position for a destination: custom hook or target + approach offset. */
export function cameraPosFor(dest: Destination): Vector3 {
  if (dest.cameraPos) return dest.cameraPos()
  const t = dest.target()
  return dest.approach.clone().normalize().multiplyScalar(dest.distance).add(t)
}

export function isDestKey(v: string | null): v is DestKey {
  return v === 'overview' || v === 'earth' || v === 'moon' || v === 'mars' || v === 'ship'
}
