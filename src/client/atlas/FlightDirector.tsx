/** @jsxImportSource react */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { Quaternion, Vector3, type Camera, type PerspectiveCamera } from 'three'
import { DESTINATIONS, type DestKey } from './flight'
import { anchors } from './stage'
import { STILL } from '../scene/debug'

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
// The focal point swings to the destination early (ease-out), so the target
// is in view while the camera travels; distance and heading ease in-out.
const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.6)
const easeInOut = (t: number) => t * t * (3 - 2 * t)
const UP = new Vector3(0, 1, 0)

interface Flight {
  t: number
  dur: number
  t0: Vector3
  d0: number
  dir0: Vector3
  lift: number
  fov0: number
}

const DEFAULT_FOV = 40

/** Begin a flight from wherever the rig is now to `focus`. */
function startFlight(c: CameraControls, focus: DestKey, reduced: boolean, minDur = 0, fov0 = DEFAULT_FOV): Flight {
  const t0 = c.getTarget(new Vector3())
  const p0 = c.getPosition(new Vector3())
  const off = p0.clone().sub(t0)
  const d0 = Math.max(off.length(), 1e-6)
  const dest = DESTINATIONS[focus]
  const t1 = dest.target()
  const travel = t1.distanceTo(t0)
  const d1 = dest.cameraPos().distanceTo(t1)
  // Wide-open limits while flying; the destination's apply on landing.
  c.minDistance = 0
  c.maxDistance = Infinity
  c.minPolarAngle = 0
  c.maxPolarAngle = Math.PI
  return {
    t: 0,
    dur: reduced ? 0.001 : Math.max(minDur, Math.min(4.6, 1.8 + Math.log10(1 + travel / Math.max(d1, 1e-3)) * 0.55)),
    t0,
    d0,
    dir0: off.divideScalar(d0),
    lift: Math.log(1 + travel / Math.max(d0, d1, 1e-3)) * 0.55,
    fov0,
  }
}

function fovOf(focus: DestKey): number {
  const f = DESTINATIONS[focus].fov
  return typeof f === 'function' ? f() : (f ?? DEFAULT_FOV)
}

function setFov(camera: Camera, fov: number) {
  const cam = camera as PerspectiveCamera
  if (!cam.isPerspectiveCamera || Math.abs(cam.fov - fov) < 1e-4) return
  cam.fov = fov
  cam.updateProjectionMatrix()
}

function isReady(focus: DestKey) {
  if (focus === 'moon') return anchors.ready.moon
  if (focus === 'mars') return anchors.ready.mars
  if (focus === 'ship') return anchors.ready.ship
  return true
}

// Drives the camera rig. Flights are our own tween (not the controls'
// damping), re-evaluating the destination EVERY frame, so the camera lands
// exactly on moving targets (the transit ship, the orbiting Moon) with no lag:
//   - the focal point glides from the old target to the new one,
//   - the view distance interpolates in log space (natural zoom), with a
//     pull-back in the middle proportional to the distance travelled
//     (zoom out, travel, zoom in: van Wijk-style),
//   - the view direction slerps.
// Once landed, moving targets are chased rigidly (the visitor's orbit offset
// is kept) and a slow idle drift keeps the shot alive.
export function FlightDirector({
  focus,
  reduced,
  ready,
  onUserInput,
}: {
  focus: DestKey
  reduced: boolean
  ready: boolean
  /** The visitor grabbed the camera (e.g. stops the guided tour). */
  onUserInput?: () => void
}) {
  const ref = useRef<CameraControls>(null)
  const three = useThree()
  const flight = useRef<Flight | null>(null)
  const placed = useRef(false)
  const frames = useRef(0)
  const lastInput = useRef(-1e9)
  const tmp = useRef({
    target: new Vector3(),
    pos: new Vector3(),
    q: new Quaternion(),
    dir: new Vector3(),
    prevShip: new Quaternion(),
    dq: new Quaternion(),
    back: new Vector3(),
  })

  // `?debug`: expose the rig for scripted verification (screenshots/tests).
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) {
      ;(window as unknown as { __atlas?: unknown }).__atlas = { controls: ref.current, anchors, three }
    }
  }, [three])

  // Cancel a flight the moment the visitor grabs the camera.
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const onStart = () => {
      lastInput.current = performance.now()
      onUserInput?.()
      if (flight.current) {
        flight.current = null
        applyLimits(c, focus)
      }
    }
    const onControl = () => {
      lastInput.current = performance.now()
    }
    c.addEventListener('controlstart', onStart)
    c.addEventListener('control', onControl)
    return () => {
      c.removeEventListener('controlstart', onStart)
      c.removeEventListener('control', onControl)
    }
  }, [focus, onUserInput])

  // A new destination: start a flight from wherever the camera is now.
  useEffect(() => {
    const c = ref.current
    if (!c || !placed.current) return
    flight.current = startFlight(c, focus, reduced, 0, (three.camera as PerspectiveCamera).fov)
  }, [focus, reduced, three])

  // Priority -2: after the moving bodies publish their anchors (-3) and
  // before drei's CameraControls applies the rig to the camera (-1), so the
  // camera never lags a frame behind a moving target.
  useFrame(({ camera }, dt) => {
    const c = ref.current
    if (!c) return
    const dest = DESTINATIONS[focus]
    const v = tmp.current
    // The ship's turn since last frame (tracked every frame, flying or not).
    v.dq.copy(anchors.shipQuat).multiply(v.prevShip.invert())
    v.prevShip.copy(anchors.shipQuat)

    if (!placed.current) {
      // First placement waits for the stage to finish loading and for the
      // focus's body to report a live anchor; failsafe after ~4 s. Then an
      // establishing shot: start well back along the view and fly in.
      if (!ready) return
      frames.current += 1
      if (!isReady(focus) && frames.current < 240) return
      const t = dest.target()
      const p = dest.cameraPos()
      const back = focus === 'overview' ? 2.3 : focus === 'earth' ? 3 : 7
      const from = p.clone().sub(t).multiplyScalar(back).add(t)
      if (focus !== 'overview') from.y += p.distanceTo(t) * 1.5
      c.setLookAt(from.x, from.y, from.z, t.x, t.y, t.z, false)
      placed.current = true
      setFov(camera, DEFAULT_FOV)
      flight.current = startFlight(c, focus, reduced || STILL, 4.2)
      return
    }

    const f = flight.current
    if (f) {
      f.t = Math.min(1, f.t + dt / f.dur)
      const k = ease(f.t)
      const t1 = dest.target()
      const p1 = dest.cameraPos()
      const off1 = p1.clone().sub(t1)
      const d1 = Math.max(off1.length(), 1e-6)
      off1.divideScalar(d1)
      v.target.lerpVectors(f.t0, t1, easeOut(f.t))
      const logD = Math.log(f.d0) * (1 - k) + Math.log(d1) * k + f.lift * Math.sin(Math.PI * f.t)
      // Heading: on long hops swing round BEHIND the focal point (a chase
      // view looking down the route at the destination), then settle into
      // the arrival framing; short hops just turn.
      const chase = Math.min(1, Math.max(0, (f.lift - 1.2) / 1.5))
      if (chase > 0) {
        v.back.copy(t1).sub(f.t0)
        if (v.back.lengthSq() < 1e-12) v.back.copy(off1)
        v.back.normalize().negate().addScaledVector(UP, 0.35).normalize()
        const h = f.t < 0.5 ? easeInOut(f.t / 0.5) : easeInOut((f.t - 0.5) / 0.5)
        const a = f.t < 0.5 ? f.dir0 : v.back
        const b = f.t < 0.5 ? v.back : off1
        v.q.setFromUnitVectors(a, b)
        const qk = new Quaternion().slerp(v.q, h)
        v.dir.copy(a).applyQuaternion(qk)
        // blend toward the plain turn for medium hops
        v.q.setFromUnitVectors(f.dir0, off1)
        const plain = f.dir0.clone().applyQuaternion(new Quaternion().slerp(v.q, k))
        v.dir.lerp(plain, 1 - chase).normalize()
      } else {
        v.q.setFromUnitVectors(f.dir0, off1)
        v.dir.copy(f.dir0).applyQuaternion(new Quaternion().slerp(v.q, k))
      }
      v.pos.copy(v.target).addScaledVector(v.dir, Math.exp(logD))
      c.setLookAt(v.pos.x, v.pos.y, v.pos.z, v.target.x, v.target.y, v.target.z, false)
      setFov(camera, f.fov0 + (fovOf(focus) - f.fov0) * easeInOut(f.t))
      if (f.t >= 1) {
        flight.current = null
        applyLimits(c, focus)
      }
      return
    }

    if (dest.chase) {
      // Chase cam: carry the visitor's offset around with the ship's heading
      // (end values, so an in-progress drag is kept, not overwritten).
      c.getTarget(v.target, true)
      c.getPosition(v.pos, true)
      v.pos.sub(v.target).applyQuaternion(v.dq)
      const t = dest.target()
      v.pos.add(t)
      c.setLookAt(v.pos.x, v.pos.y, v.pos.z, t.x, t.y, t.z, false)
    } else if (dest.aim) {
      // hold the camera, turn to keep the action framed (eased by the rig)
      const t = dest.target()
      c.getPosition(v.pos, true)
      c.setLookAt(v.pos.x, v.pos.y, v.pos.z, t.x, t.y, t.z, true)
    } else if (dest.tracks) {
      const t = dest.target()
      c.moveTo(t.x, t.y, t.z, false)
    }
    if (typeof dest.fov === 'function') {
      const cam = camera as PerspectiveCamera
      setFov(camera, cam.fov + (fovOf(focus) - cam.fov) * Math.min(1, dt * 2.5))
    }
    // Idle drift: a slow turntable once the visitor has let go for a while.
    if (dest.drift > 0 && !STILL && !reduced && performance.now() - lastInput.current > 6000) {
      c.rotate(dest.drift * dt, 0, false)
    }
    // Flat sites: never let the camera sink below the ground.
    if (dest.floor !== undefined) {
      c.getPosition(v.pos, true)
      if (v.pos.y < dest.floor) c.setPosition(v.pos.x, dest.floor, v.pos.z, true)
    }
  }, -2)

  return <CameraControls ref={ref} smoothTime={0.35} draggingSmoothTime={0.12} dollySpeed={0.5} />
}

function applyLimits(c: CameraControls, focus: DestKey) {
  const dest = DESTINATIONS[focus]
  c.minDistance = dest.minDistance
  c.maxDistance = dest.maxDistance
  c.minPolarAngle = 0
  c.maxPolarAngle = dest.maxPolar ?? Math.PI
}
