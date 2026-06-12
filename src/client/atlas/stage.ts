import { Vector3 } from 'three'

// Stage-scale layout (NOT real scale): Earth at origin, the Moon on its
// existing orbit, Mars parked far out so camera flights feel like travel.
export const EARTH_POS = new Vector3(0, 0, 0)
export const MARS_POS = new Vector3(46, 3, -28)
export const MARS_RADIUS = 0.62
export const MOON_RADIUS = 0.5

// Live world positions of MOVING bodies, written each frame by their
// components and read by the flight director (camera chase) and pickers.
export const anchors = {
  moon: new Vector3(9, 0.4, 0),
  ship: new Vector3(20, 2, -12),
  /** Transit ship velocity direction, for side-on follow framing. */
  shipTan: new Vector3(1, 0, 0),
}
