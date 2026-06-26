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
  /** World positions of the surface bases, written each frame for the hero
   *  framing (the base sits on a slowly rotating/orbiting body). Seeded with
   *  the t=0 world point; refined every frame once the body loads. */
  marsBase: new Vector3(46.31, 3.19, -27.5),
  moonBase: new Vector3(-5.05, 1.16, -6.79),
  /** Set true once each body has written a live world anchor. The camera waits
   *  on these before its first placement — the bodies load async (Suspense),
   *  and the base "hero" offset is derived from the live surface normal. */
  ready: { moon: false, mars: false, ship: false },
}
