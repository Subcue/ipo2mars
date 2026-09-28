import { Vector3 } from 'three'
import layout from '../bases/layout.json'

// The Starbase cycle, one keyframed loop in site metres (x east, y up,
// z south; the Pad A mount at the origin). Everything is a pure function of
// the loop time, so the clock can be restarted or jumped at will:
//
//   fueled stack, venting -> QD arm swings away -> ignition -> liftoff and the
//   pitch-over east above the Gulf -> hot staging (far away) -> the booster
//   falls back, landing burn on 13 then 3 engines, and the tower's arms catch
//   it -> set down on the mount -> the ship belly-flops in, flips, burns and
//   is caught -> stacked onto the booster -> QD arm reconnects, propellant
//   loads (frost creeps up the tanks) -> ...and again.
//
// Time is compressed only where nothing is on screen (high on the ascent,
// the long fall back); the pad moments run close to real time.

const SB = layout.starbase
export const OLM_TOP = SB.tower.olmHeight
export const BOOSTER_H = 71
export const BOOSTER_PIN = 63.5
export const SHIP_PIN = 34.6
export const PIN_R = 0.34
export const STACK_TOP = OLM_TOP + BOOSTER_H
/** The ship is caught high on the tower, clear of the booster below (its
 *  final hover flame stops short of the booster's top), then lowered. */
const SHIP_HOVER = STACK_TOP + 9
/** Arm top when resting under a pin at height `pinY`. */
const armUnder = (pinY: number) => pinY - PIN_R
/** Where the arms wait between jobs (open, low on the tower). */
const PARK = 62
/** Arms spread when open (radians). */
export const ARM_OPEN = 0.5

export const LOOP = 150
export const T_IGNITE = 12
export const T_LIFTOFF = 14
const T_STAGE = 50
const T_BOOSTER_IN = 62
const T_LANDBURN = 73
const T_BOOSTER_CATCH = 83
const T_SHIP_IN = 100
const T_FLIP = 112
const T_SHIP_CATCH = 121

export interface Vehicle {
  pos: Vector3
  /** Lean from vertical toward +x (radians; bellyflop = PI/2). */
  tilt: number
  visible: boolean
  /** Engines firing and throttle. */
  engines: number
  throttle: number
}

export interface PadState {
  t: number
  booster: Vehicle
  ship: Vehicle & { stacked: boolean }
  /** Height of the arm tops (y), their spread (0 = closed) and the QD arm
   *  swing (0 = mated to the ship, 1 = stowed along the tower). */
  armTop: number
  armOpen: number
  qd: number
  /** Propellant frost on the tanks, venting, and the ground-level exhaust
   *  (ignition blast and the landing burns). */
  frost: number
  vent: number
  blast: number
  /** Far-away events: hot-staging flash and the boostback burn. */
  staging: number
  boostback: number
  boostbackPos: Vector3
  /** Where the camera should look, and how wide. */
  focus: Vector3
  fov: number
  /** Short label for the phase (UI). */
  phase: string
}

export function newPadState(): PadState {
  const v = (): Vehicle => ({ pos: new Vector3(), tilt: 0, visible: true, engines: 0, throttle: 0 })
  return {
    t: 0,
    booster: v(),
    ship: { ...v(), stacked: true },
    armTop: PARK,
    armOpen: ARM_OPEN,
    qd: 0,
    frost: 1,
    vent: 1,
    blast: 0,
    staging: 0,
    boostback: 0,
    boostbackPos: new Vector3(),
    focus: new Vector3(0, 55, 0),
    fov: 24,
    phase: 'Propellant load',
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k

/** The ascent (site metres) at time since liftoff `tau`: vertical off the
 *  pad, then a gravity turn east over the Gulf, compressed after the tower
 *  is cleared. Returns the lean too. */
export function ascent(tau: number, out: Vector3): number {
  const vert = Math.min(tau, 12)
  let y = OLM_TOP + 0.5 * 4.2 * vert * vert
  let x = 0
  let lean = 0
  if (tau > 12) {
    const u = tau - 12
    y += 50 * u + 14 * u * u
    x = 0.9 * u * u * u
    lean = Math.atan2(2.7 * u * u, 50 + 28 * u)
  }
  out.set(x, y, 0)
  return lean
}

/** Fill `s` with the pad at loop time `t` (seconds). */
export function padAt(t: number, s: PadState): PadState {
  t = ((t % LOOP) + LOOP) % LOOP
  s.t = t
  const b = s.booster
  const sh = s.ship
  b.visible = true
  sh.visible = true
  b.engines = 0
  b.throttle = 0
  sh.engines = 0
  sh.throttle = 0
  s.blast = 0
  s.staging = 0
  s.boostback = 0
  b.tilt = 0
  sh.tilt = 0
  s.fov = 24

  // --- the booster ------------------------------------------------------------
  if (t < T_LIFTOFF) {
    b.pos.set(0, OLM_TOP, 0)
    if (t >= T_IGNITE) {
      b.engines = 33
      b.throttle = smooth(T_IGNITE, T_LIFTOFF, t)
      s.blast = smooth(T_IGNITE, T_IGNITE + 1.2, t)
    }
  } else if (t < T_STAGE) {
    b.tilt = ascent(t - T_LIFTOFF, b.pos)
    b.engines = 33
    b.throttle = 1
    s.blast = 1 - smooth(T_LIFTOFF + 6, T_LIFTOFF + 14, t)
  } else if (t < T_BOOSTER_IN) {
    // flipped and falling back, far off: only the boostback burn shows
    b.visible = false
    const k = clamp01((t - T_STAGE) / (T_BOOSTER_IN - T_STAGE))
    ascent(T_STAGE - T_LIFTOFF, b.pos)
    b.pos.x *= 1 - 0.25 * k
    b.pos.y += 900 * Math.sin(k * Math.PI) - 2500 * k
    s.boostbackPos.copy(b.pos)
    s.boostback = smooth(T_STAGE + 1.2, T_STAGE + 2, t) * (1 - smooth(T_STAGE + 6.5, T_STAGE + 7.5, t))
  } else if (t < T_LANDBURN) {
    // falling fast, grid fins steering it home toward the tower
    const k = (t - T_BOOSTER_IN) / (T_LANDBURN - T_BOOSTER_IN)
    b.pos.set(300 * (1 - 0.35 * k), 4500 - 290 * (t - T_BOOSTER_IN), 0)
    b.tilt = -0.06 * (1 - k)
  } else if (t < T_BOOSTER_CATCH) {
    // landing burn: 13 engines, then the centre 3, into the arms
    const k = (t - T_LANDBURN) / (T_BOOSTER_CATCH - T_LANDBURN)
    const hover = OLM_TOP + 2
    b.pos.set(195 * Math.pow(1 - k, 2), hover + (1310 - hover) * Math.pow(1 - k, 2.25), 0)
    b.tilt = -0.07 * Math.sin(k * Math.PI) * (1 - k)
    b.engines = k < 0.7 ? 13 : 3
    b.throttle = k < 0.7 ? 1 : 0.8
    s.blast = smooth(0.82, 1, k) * 0.6
  } else if (t < T_BOOSTER_CATCH + 2.5) {
    // hover while the arms close, engines cut, it settles onto the arms
    b.pos.set(0, OLM_TOP + 2, 0)
    if (t < T_BOOSTER_CATCH + 2) {
      b.engines = 3
      b.throttle = 0.72
      s.blast = 0.6
    } else {
      b.pos.y -= 0.3 * smooth(T_BOOSTER_CATCH + 2, T_BOOSTER_CATCH + 2.5, t)
    }
  } else {
    // on the arms, then set down on the mount (and it stays there)
    const down = smooth(90, 96, t)
    b.pos.set(0, mix(OLM_TOP + 1.7, OLM_TOP, down), 0)
  }

  // --- the ship --------------------------------------------------------------
  sh.stacked = t < T_STAGE || t >= 124
  if (t < T_STAGE) {
    sh.pos.copy(b.pos)
    sh.tilt = b.tilt
    if (t > T_LIFTOFF) sh.visible = true
  } else if (t < T_SHIP_IN) {
    // on to orbit (a dimming spark), then out of the picture
    sh.visible = false
    if (t < T_STAGE + 6) {
      ascent(T_STAGE - T_LIFTOFF + (t - T_STAGE) * 1.6, sh.pos)
      sh.engines = 6
      sh.throttle = 1
    }
  } else if (t < T_FLIP) {
    // back from orbit, falling belly-first
    const k = (t - T_SHIP_IN) / (T_FLIP - T_SHIP_IN)
    sh.pos.set(420 * (1 - 0.3 * k), 3000 - 2400 * k, 0)
    sh.tilt = Math.PI / 2 - 0.05 * Math.sin(t * 1.7)
  } else if (t < T_SHIP_CATCH) {
    // the flip on three engines, then the landing burn into the arms
    const k = (t - T_FLIP) / (T_SHIP_CATCH - T_FLIP)
    const hover = SHIP_HOVER
    sh.pos.set(294 * Math.pow(1 - k, 2), hover + (600 - hover) * Math.pow(1 - k, 1.9), 0)
    const f = smooth(0, 0.3, k)
    sh.tilt = (Math.PI / 2) * (1 - f) - 0.18 * Math.sin(Math.PI * smooth(0.18, 0.45, k)) * (1 - smooth(0.45, 0.7, k))
    sh.engines = 3
    sh.throttle = k < 0.3 ? 1 : 0.85
  } else if (t < T_SHIP_CATCH + 1.6) {
    sh.pos.set(0, SHIP_HOVER, 0)
    if (t < T_SHIP_CATCH + 1.1) {
      sh.engines = 3
      sh.throttle = 0.7
    } else {
      sh.pos.y -= 0.3 * smooth(T_SHIP_CATCH + 1.1, T_SHIP_CATCH + 1.6, t)
    }
  } else {
    const down = smooth(124, 131, t)
    sh.pos.set(0, mix(SHIP_HOVER - 0.3, STACK_TOP, down), 0)
  }

  // --- the arms and the QD arm -----------------------------------------------
  // catch heights: the pins come to rest 0.3 m lower than they hover
  const bCatch = armUnder(OLM_TOP + 1.7 + BOOSTER_PIN)
  const sCatch = armUnder(SHIP_HOVER - 0.3 + SHIP_PIN)
  if (t < 64) {
    s.armTop = PARK
    s.armOpen = ARM_OPEN
  } else if (t < T_BOOSTER_CATCH) {
    s.armTop = mix(PARK, bCatch, smooth(64, 74, t))
    s.armOpen = ARM_OPEN
  } else if (t < T_BOOSTER_CATCH + 2.5) {
    s.armTop = bCatch
    s.armOpen = ARM_OPEN * (1 - smooth(T_BOOSTER_CATCH, T_BOOSTER_CATCH + 2.2, t))
  } else if (t < 97) {
    // carry it down onto the mount
    s.armTop = armUnder(b.pos.y + BOOSTER_PIN)
    s.armOpen = 0
  } else if (t < T_SHIP_CATCH) {
    s.armOpen = ARM_OPEN * smooth(97, 99, t)
    s.armTop = mix(armUnder(OLM_TOP + BOOSTER_PIN) - 0.4 * smooth(97, 98, t), sCatch, smooth(99.5, 106, t))
  } else if (t < T_SHIP_CATCH + 1.6) {
    s.armTop = sCatch
    s.armOpen = ARM_OPEN * (1 - smooth(T_SHIP_CATCH, T_SHIP_CATCH + 1.3, t))
  } else if (t < 131) {
    // lower it onto the booster
    s.armTop = armUnder(sh.pos.y + SHIP_PIN)
    s.armOpen = 0
  } else {
    s.armOpen = ARM_OPEN * smooth(131, 133, t)
    s.armTop = mix(armUnder(STACK_TOP + SHIP_PIN) - 0.4 * smooth(131, 132, t), PARK, smooth(133, 141, t))
  }
  s.qd = t < 8 ? 0 : t < 134 ? smooth(8, 10.5, t) : 1 - smooth(134, 138, t)

  // --- propellant, venting, far-off events --------------------------------------
  s.frost = t < T_LIFTOFF + 8 ? 1 - 0.4 * smooth(T_LIFTOFF, T_LIFTOFF + 8, t) : t > 136 ? smooth(137, 149, t) : 0
  s.vent = t < T_IGNITE - 1 ? 1 : t > 138 ? smooth(138, 142, t) : 0
  s.staging = smooth(T_STAGE - 0.2, T_STAGE, t) * (1 - smooth(T_STAGE + 0.4, T_STAGE + 2.4, t))

  // --- the camera: where to look, and the lens -----------------------------------
  // (the rig eases toward these, so they only need to be continuous)
  const f = s.focus
  const lead = new Vector3()
  if (t < T_LIFTOFF) {
    f.set(0, 68, 0)
  } else if (t < 58) {
    // ride the climb up to a high, wide frame on the plume trail
    ascent(Math.max(0, Math.min(t, T_STAGE) - T_LIFTOFF), lead)
    const k = smooth(T_LIFTOFF, T_LIFTOFF + 22, t)
    f.set(mix(0, Math.min(lead.x, 5500), k * 0.85), mix(68, Math.min(lead.y * 0.8 + 40, 3200), smooth(T_LIFTOFF + 1, T_LIFTOFF + 24, t)), 0)
    s.fov = mix(24, 44, smooth(T_LIFTOFF + 3, T_LIFTOFF + 16, t))
  } else if (t < T_BOOSTER_IN) {
    // down from the trail to where the booster will appear
    const k = smooth(58, T_BOOSTER_IN, t)
    f.set(mix(4600, 260, k), mix(3200, 1500, k), 0)
    s.fov = mix(44, 34, k)
  } else if (t < T_BOOSTER_CATCH + 2) {
    // follow it down (capped, it falls into the frame from above) and
    // close in on the arms for the catch
    const k = smooth(T_LANDBURN - 2, T_BOOSTER_CATCH - 1, t)
    f.set(mix(b.pos.x * 0.85, 0, k), mix(Math.min(b.pos.y + 20, 1500), 84, k), 0)
    s.fov = mix(mix(34, 22, smooth(T_BOOSTER_IN, T_BOOSTER_IN + 3, t)), 15, smooth(T_LANDBURN, T_BOOSTER_CATCH - 0.5, t))
  } else if (t < T_SHIP_IN) {
    // the booster in the arms, set down; then widen a little and look up
    const k = smooth(96, T_SHIP_IN, t)
    f.set(0, mix(84, 400, k), 0)
    s.fov = mix(mix(15, 18, smooth(T_BOOSTER_CATCH + 3, 90, t)), 30, k)
  } else if (t < T_SHIP_CATCH + 2) {
    const k = smooth(T_FLIP - 1, T_SHIP_CATCH - 0.5, t)
    f.set(mix(sh.pos.x * 0.85, 0, k), mix(Math.min(sh.pos.y + 20, 1400), 118, k), 0)
    s.fov = mix(30, 15, smooth(T_FLIP + 1, T_SHIP_CATCH - 0.5, t))
  } else {
    // restack, then back out to the whole pad
    const k = smooth(131, 141, t)
    f.set(0, mix(mix(118, 100, smooth(124, 131, t)), 68, k), 0)
    s.fov = mix(15, 24, k)
  }

  s.phase =
    t < T_IGNITE
      ? 'Propellant load'
      : t < T_LIFTOFF + 10
        ? 'Liftoff'
        : t < T_STAGE + 4
          ? 'Ascent and hot staging'
          : t < T_BOOSTER_CATCH + 3
            ? 'Booster return and catch'
            : t < 97
              ? 'Booster set on the mount'
              : t < T_SHIP_CATCH + 2
                ? 'Ship return and catch'
                : t < 136
                  ? 'Restack'
                  : 'Propellant load'
  return s
}

/** Named moments the visitor can jump to (loop seconds). */
export const MOMENTS = [
  { label: 'Liftoff', t: 6 },
  { label: 'Booster catch', t: 66 },
  { label: 'Ship catch', t: 104 },
  { label: 'Restack', t: 122 },
] as const
