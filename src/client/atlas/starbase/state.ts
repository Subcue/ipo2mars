import { Color } from 'three'
import { newPadState, LOOP } from './sequence'

// Live Starbase state shared between the launch sequence (which writes it at
// frame priority -3) and the camera (flight.ts reads the focus and lens at -2).
export const pad = newPadState()

/** Loop clock: `start` is the clock time at loop t = 0. Jumps are requested
 *  by the UI and applied by the sequence on its next frame. */
export const padClock = {
  start: -1e9,
  running: false,
  request: null as number | null,
  jump(t: number) {
    this.request = ((t % LOOP) + LOOP) % LOOP
  },
}

/** Aerial perspective for everything at the site (display-space colour, per
 *  stage unit), driven by the ground each frame. */
export const SITE_HAZE = { k: { value: 0 }, color: new Color('#c3cfdb') }

/** Site origin height (metres): the graded pads stand this proud of the plain. */
export const PAD_GRADE = 1.6
