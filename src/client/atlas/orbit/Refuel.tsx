/** @jsxImportSource react */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Euler, Matrix4, Quaternion, Vector3, type Group } from 'three'
import { MODELS, useEnv, useModel } from '../render/useModel'
import type { ModelContext } from '../render/materials'
import { Plume, type PlumeLive } from '../ships/Plume'
import { anchors, REFUEL_POS, REFUEL_QUAT, SITE_SCALE } from '../stage'
import { Smoke } from '../starbase/Smoke'
import { STILL } from '../../scene/debug'

// Ship-to-ship propellant transfer in low orbit, the step that makes Mars (and
// the Moon) possible: a depot holds station 450 km up while a tanker comes in
// tail-first on puffs of cold-gas thrust, docks aft-to-aft, pumps its load
// across (frost creeps over the depot's tanks as they fill), undocks, backs
// away and burns for home; then the next one arrives. Scene frame (metres,
// under SITE_SCALE): x along the pair, y away from Earth, z away from the sun.

export const REFUEL_LOOP = 64
const T_DOCK = 20
const T_UNDOCK = 46
const HALF_GAP = 0.6
const ZERO = new Vector3()
const UP = new Vector3(0, 1, 0)

export const refuel = {
  phase: 'Approach',
  /** Propellant moved this visit, 0..1. */
  transfer: 0,
  /** Tanker number (each loop is the next tanker). */
  tanker: 1,
  clock: { start: -1e9, running: false, request: null as number | null },
  /** Restart the visit at loop time `t` (the tour uses it). */
  jump(t: number) {
    this.clock.request = t
  },
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

// RCS pods (model metres, three.js axes; see ship_details in the Blender
// script): aft jets point down the hull past the tail, nose jets outboard.
// A plume's axis is its local -Y.
const RCS_AFT: [[number, number, number], [number, number, number]][] = [62, 118].map((deg) => {
  const a = (deg * Math.PI) / 180
  return [[4.7 * Math.cos(a), 6.2, -4.7 * Math.sin(a)], [0, 0, 0]]
})
const RCS_NOSE: [[number, number, number], [number, number, number]][] = [62, 118].map((deg) => {
  const a = (deg * Math.PI) / 180
  return [[4.7 * Math.cos(a), 31.8, -4.7 * Math.sin(a)], [0, 0, (deg < 90 ? 1 : -1) * Math.PI / 2]]
})

// vacuum Raptor exits (model metres, three.js axes)
const RVAC = [90, 210, 330].map((deg) => {
  const a = (deg * Math.PI) / 180
  return [3.02 * Math.cos(a), 0.05, -3.02 * Math.sin(a)] as [number, number, number]
})

function Pair({ active }: { active: boolean }) {
  const env = useEnv('orbit')
  const frost = useMemo(() => ({ value: 0 }), [])
  const glow = useMemo(() => ({ value: 0 }), [])
  const depotCtx = useMemo<ModelContext>(() => ({ env, envIntensity: 1.1, frost, frostBands: [2, 12, 13, 30] }), [env, frost])
  const tankerCtx = useMemo<ModelContext>(() => ({ env, envIntensity: 1.1, engineGlow: glow }), [env, glow])
  const depot = useModel(MODELS.depot, depotCtx)
  const tanker = useModel(MODELS.starship, tankerCtx)
  const tankerG = useRef<Group>(null)
  const scene = useRef<Group>(null)
  const burn = useMemo<PlumeLive>(() => ({ length: 0, width: 0, intensity: 0, halo: 0 }), [])
  const rcsAft = useMemo<PlumeLive>(() => ({ length: 0, width: 0, intensity: 0, halo: 0 }), [])
  const rcsNose = useMemo<PlumeLive>(() => ({ length: 0, width: 0, intensity: 0, halo: 0 }), [])
  const smoke = useMemo(() => new Smoke(180, SITE_SCALE), [])
  useEffect(() => () => smoke.dispose(), [smoke])
  const sim = useRef({ near: false, rnd: 7, prevT: 0 })
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __refuel: refuel })
  }, [])
  const inv = useMemo(() => new Matrix4(), [])
  const tmpE = useMemo(() => new Euler(), [])
  const tmpQ = useMemo(() => new Quaternion(), [])

  useFrame(({ clock, camera }, dt) => {
    const tg = tankerG.current
    const g = scene.current
    if (!tg || !g) return
    const S = sim.current
    const now = clock.elapsedTime
    const C = refuel.clock
    const near = active && camera.position.distanceTo(REFUEL_POS) < 0.02
    if (near && !S.near) {
      const t = (((now - C.start) % REFUEL_LOOP) + REFUEL_LOOP) % REFUEL_LOOP
      if (!C.running || t > T_UNDOCK) {
        C.start = now - 4
        smoke.clear()
      }
      C.running = true
    }
    S.near = near
    if (C.request !== null) {
      C.start = now - C.request
      C.request = null
      C.running = true
      smoke.clear()
    }
    const raw = STILL ? 30 : C.running ? now - C.start : 4
    const t = ((raw % REFUEL_LOOP) + REFUEL_LOOP) % REFUEL_LOOP
    if (t < S.prevT) smoke.clear()
    S.prevT = t
    refuel.tanker = 1 + (Math.max(0, Math.floor(raw / REFUEL_LOOP)) % 9)

    // --- the tanker: approach tail-first, dock, transfer, back off, burn away
    let x: number
    let y = 0
    let z = 0
    let roll = 0
    let yaw = 0
    if (t < T_DOCK) {
      const k = t / T_DOCK
      x = -HALF_GAP - 900 * Math.pow(1 - k, 3.2) - 3 * Math.pow(1 - k, 1.2)
      y = 6 * Math.pow(1 - k, 2) * Math.sin(k * 5)
      z = -9 * Math.pow(1 - k, 2)
      roll = 0.12 * Math.pow(1 - k, 2) * Math.sin(k * 7)
      refuel.phase = k < 0.75 ? 'Tanker approach' : 'Final approach'
    } else if (t < T_UNDOCK) {
      // contact, a little bounce, hard dock
      const b = t - T_DOCK
      x = -HALF_GAP - 0.25 * Math.exp(-b * 2.2) * Math.abs(Math.sin(b * 5))
      refuel.phase = t < T_DOCK + 3 ? 'Docking' : 'Propellant transfer'
    } else {
      // back off on cold gas, swing broadside (engines pointed clear of the
      // depot), then burn away
      const b = t - T_UNDOCK
      // (turning about local up, nose away from the camera on the sun side)
      yaw = 1.1 * smooth(4, 9, b)
      const coast = Math.min(b, 9)
      x = -HALF_GAP - 1.2 * coast * coast * 0.5 - 2 * coast
      const burn = Math.max(0, b - 10)
      const run = 7 * burn * burn
      x -= run * Math.cos(yaw)
      z = run * Math.sin(yaw)
      y = -6 * smooth(0, 9, b) - 0.4 * run
      roll = 0.15 * smooth(2, 9, b)
      refuel.phase = b < 5 ? 'Undocking' : 'Tanker departs'
    }
    tg.position.set(x, y, z)
    // nose along -x, heat shield toward Earth; on departure, yawed about up
    tmpE.set(roll, -Math.PI / 2, Math.PI / 2, 'ZYX')
    tg.quaternion.setFromAxisAngle(UP, yaw).multiply(tmpQ.setFromEuler(tmpE))
    refuel.transfer = smooth(T_DOCK + 4, T_UNDOCK - 3, t)
    // frost creeps over the filling tanks, and sublimates off again in sunlight
    frost.value = 0.3 + 0.7 * refuel.transfer * (1 - smooth(T_UNDOCK + 6, REFUEL_LOOP, t))
    // departure burn, then gone
    const fire = t > T_UNDOCK + 10 && t < REFUEL_LOOP - 1 ? smooth(T_UNDOCK + 10, T_UNDOCK + 10.8, t) * (1 - smooth(REFUEL_LOOP - 3, REFUEL_LOOP - 1, t)) : 0
    burn.length = 34
    burn.width = 11
    burn.intensity = 0.16 * fire
    burn.halo = 4
    glow.value = fire
    tg.visible = x > -700

    // --- cold-gas jets: pulses of braking on the approach, the push-off at
    // undock, attitude taps up front; a boil-off vent while the tanks fill
    const d = STILL ? 0 : Math.min(dt, 0.05)
    const pulse = (a: number, b: number, rate: number, duty: number) =>
      t > a && t < b && ((now * rate) % 1) < duty ? 1 : 0
    const brake = pulse(6, T_DOCK - 0.4, 0.9, 0.35)
    const push = pulse(T_UNDOCK, T_UNDOCK + 3, 1.6, 0.5)
    const tap = pulse(4, T_DOCK - 1, 0.37, 0.12)
    rcsAft.intensity = 0.5 * Math.max(brake, push)
    rcsNose.intensity = 0.5 * tap
    for (const j of [rcsAft, rcsNose]) {
      j.length = 6
      j.width = 1.3
      j.halo = 0
    }
    const rnd = () => {
      S.rnd = (Math.imul(S.rnd, 1664525) + 1013904223) >>> 0
      return S.rnd / 4294967295
    }
    if (t > T_DOCK + 4 && t < T_UNDOCK && rnd() < d * 2.5) {
      const side = rnd() < 0.5 ? 1 : -1
      smoke.emit({ x: HALF_GAP + 40, y: side * 4.6, z: 0, vy: side * 9, vz: (rnd() - 0.5) * 3, s0: 0.3, s1: 3.5, life: 0.8, drag: 0, alpha: 0.35, tone: 1.1 })
    }
    smoke.step(d, ZERO, () => 0, -1e9)
    g.updateMatrixWorld()
    inv.copy(g.matrixWorld).invert()
    smoke.update(camera, inv)

    g.getWorldPosition(anchors.refuel)
    if (t < T_DOCK + 2 || t > T_UNDOCK) anchors.shadowsDirty = true
  }, -3)

  return (
    <group ref={scene}>
      {/* the depot, nose along +x, tail at the docking plane */}
      <group position={[HALF_GAP, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <primitive object={depot} />
      </group>
      <group ref={tankerG}>
        <primitive object={tanker} />
        {RVAC.map((p, i) => (
          <group key={i} position={p}>
            <Plume length={1} width={1} live={burn} core="#fbf6ff" outer="#a9a2ff" />
          </group>
        ))}
        {/* RCS: aft pods fire tailward (braking into the dock), nose pods sideways */}
        {RCS_AFT.map(([p, r], i) => (
          <group key={`a${i}`} position={p} rotation={r}>
            <Plume length={1} width={1} live={rcsAft} core="#ffffff" outer="#cfe0ff" order={7} />
          </group>
        ))}
        {RCS_NOSE.map(([p, r], i) => (
          <group key={`n${i}`} position={p} rotation={r}>
            <Plume length={1} width={1} live={rcsNose} core="#ffffff" outer="#cfe0ff" order={7} />
          </group>
        ))}
      </group>
      <primitive object={smoke.mesh} />
    </group>
  )
}

export function Refuel({ load }: { load: boolean }) {
  const root = useRef<Group>(null)
  useFrame(({ camera }) => {
    if (root.current) root.current.visible = camera.position.distanceTo(REFUEL_POS) < 0.3
  })
  return (
    <group ref={root} position={REFUEL_POS} quaternion={REFUEL_QUAT} visible={false}>
      <group scale={SITE_SCALE}>
        {load ? (
          <Suspense fallback={null}>
            <Pair active />
          </Suspense>
        ) : null}
      </group>
    </group>
  )
}
