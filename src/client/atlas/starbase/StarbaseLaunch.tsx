/** @jsxImportSource react */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, Matrix4, Vector3, type Group, type Object3D, type PointLight, type Sprite, type Texture } from 'three'
import layout from '../bases/layout.json'
import { MODELS, useModel } from '../render/useModel'
import type { ModelContext } from '../render/materials'
import { glowTexture } from '../render/textures'
import { Plume, type PlumeLive } from '../ships/Plume'
import { anchors, SITE_SCALE, siteToWorld, STARBASE_POS } from '../stage'
import { QUALITY } from '../quality'
import { STILL } from '../../scene/debug'
import { ascent as ascentAt, BOOSTER_H, LOOP, OLM_TOP, padAt } from './sequence'
import { pad, padClock, SITE_HAZE } from './state'
import { Smoke } from './Smoke'

// Pad A in motion: the stack, the returning booster and ship, the catch arms,
// the QD arm, the flames and their light, and the exhaust clouds. All in
// site metres under the SITE_SCALE group; the sequence (sequence.ts) says
// where everything is, this makes it so.

const SB = layout.starbase
const [TX, TZ] = SB.padA.tower
const TOWER_W = SB.tower.width
const CARRIAGE_W = TOWER_W + 2.4
const CARRIAGE_H = 10
const HINGE = SB.tower.armHinge
const QD_Y = OLM_TOP + BOOSTER_H + 2.4
const WIND = new Vector3(-2.2, 0, -1.4)
const DEG90 = Math.PI / 2

// Raptor exits for the landing burns (model metres, three.js axes)
const SHIP_SL = [30, 150, 270].map((d) => {
  const a = (d * Math.PI) / 180
  return [1.05 * Math.cos(a), 0.3, -1.05 * Math.sin(a)] as [number, number, number]
})

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

export function StarbaseLaunch({ env, active }: { env: Texture; active: boolean }) {
  const frostB = useMemo(() => ({ value: 1 }), [])
  const frostS = useMemo(() => ({ value: 1 }), [])
  const soot = useMemo(() => ({ value: 0.5 }), [])
  const glowB = useMemo(() => ({ value: 0 }), [])
  const glowS = useMemo(() => ({ value: 0 }), [])
  const boosterCtx = useMemo<ModelContext>(
    () => ({
      env,
      envIntensity: 1,
      frost: frostB,
      frostBands: [5, 41, 44, 61],
      dustU: soot,
      dustColor: new Color('#231e19'),
      dustHeight: 24,
      engineGlow: glowB,
      haze: SITE_HAZE,
    }),
    [env, frostB, soot, glowB],
  )
  const shipCtx = useMemo<ModelContext>(
    () => ({ env, envIntensity: 1, frost: frostS, frostBands: [3, 18, 21, 30], engineGlow: glowS, haze: SITE_HAZE }),
    [env, frostS, glowS],
  )
  const armCtx = useMemo<ModelContext>(() => ({ env, envIntensity: 0.8, haze: SITE_HAZE }), [env])
  const booster = useModel(MODELS.booster, boosterCtx)
  const ship = useModel(MODELS.starship, shipCtx)
  const mz = useModel(MODELS.mechazilla, armCtx)
  const parts = useMemo(() => {
    const get = (n: string) => mz.getObjectByName(n) as Object3D
    return { carriage: get('carriage'), armN: get('arm_n'), armS: get('arm_s'), qd: get('qd_arm') }
  }, [mz])

  const site = useRef<Group>(null)
  const boosterG = useRef<Group>(null)
  const shipG = useRef<Group>(null)
  const light = useRef<PointLight>(null)
  const shipLight = useRef<PointLight>(null)
  const dot = useRef<Sprite>(null)
  const shipDot = useRef<Sprite>(null)
  const flash = useRef<Sprite>(null)
  const bbDot = useRef<Sprite>(null)
  const tex = useMemo(() => glowTexture(), [])
  const bPlume = useMemo<PlumeLive>(() => ({ length: 0, width: 0, intensity: 0, halo: 0 }), [])
  const sPlume = useMemo<PlumeLive>(() => ({ length: 0, width: 0, intensity: 0, halo: 0 }), [])
  const smoke = useMemo(() => new Smoke(QUALITY.low ? 260 : 460, SITE_SCALE), [])
  useEffect(() => () => smoke.dispose(), [smoke])
  const sim = useRef({ near: false, lastTrail: new Vector3(0, -1e9, 0), shipTrail: new Vector3(0, -1e9, 0), prevT: -1, rnd: 1 })
  const tmp = useMemo(() => ({ v: new Vector3(), w: new Vector3(), m: new Matrix4(), inv: new Matrix4(), up: new Vector3() }), [])

  // `?debug`: let scripts jump the loop (screenshots of each moment)
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __pad: padClock, __smoke: smoke })
  }, [smoke])

  useFrame(({ clock, camera }, dt) => {
    const g = site.current
    const bg = boosterG.current
    const sg = shipG.current
    if (!g || !bg || !sg) return
    const now = clock.elapsedTime
    const S = sim.current
    // --- the loop clock: restart just before ignition when the camera arrives
    const near = active && camera.position.distanceTo(STARBASE_POS) < 0.03
    if (near && !S.near) {
      const t = (((now - padClock.start) % LOOP) + LOOP) % LOOP
      if (!padClock.running || t > 11) {
        padClock.start = now - 4
        smoke.clear()
      }
      padClock.running = true
    }
    S.near = near
    if (padClock.request !== null) {
      padClock.start = now - padClock.request
      padClock.request = null
      padClock.running = true
      smoke.clear()
      S.lastTrail.set(0, -1e9, 0)
    }
    const t = STILL ? 30 : padClock.running ? now - padClock.start : 4
    const s = padAt(t, pad)
    if (s.t < S.prevT) smoke.clear()
    S.prevT = s.t

    // --- vehicles ----------------------------------------------------------
    const b = s.booster
    bg.visible = b.visible
    bg.position.copy(b.pos)
    bg.rotation.set(0, 0, -b.tilt)
    const sh = s.ship
    if (sh.stacked) {
      tmp.v.set(0, BOOSTER_H, 0).applyAxisAngle(tmp.up.set(0, 0, 1), -b.tilt)
      sg.position.copy(b.pos).add(tmp.v)
      sg.rotation.set(0, DEG90, -b.tilt, 'ZYX')
      sg.visible = b.visible
    } else {
      sg.position.copy(sh.pos)
      sg.rotation.set(0, DEG90, -sh.tilt, 'ZYX')
      sg.visible = sh.visible
    }
    frostB.value = s.frost
    frostS.value = s.frost
    glowB.value = b.engines > 0 ? b.throttle : 0
    glowS.value = sh.engines > 0 ? sh.throttle : 0

    // --- arms --------------------------------------------------------------
    parts.carriage.position.set(TX, s.armTop - CARRIAGE_H, TZ)
    parts.armN.position.set(TX + CARRIAGE_W / 2, s.armTop, TZ - HINGE)
    parts.armN.rotation.set(0, s.armOpen, 0)
    parts.armS.position.set(TX + CARRIAGE_W / 2, s.armTop, TZ + HINGE)
    parts.armS.rotation.set(0, -s.armOpen, 0)
    parts.qd.position.set(TX + TOWER_W / 2 - 0.4, QD_Y, TZ)
    parts.qd.rotation.set(0, s.qd * DEG90, 0)

    // --- flames --------------------------------------------------------------
    const alt = b.pos.y - OLM_TOP
    if (b.engines >= 33) {
      const hi = smooth(200, 9000, alt)
      bPlume.length = (105 + 380 * hi) * (0.55 + 0.45 * b.throttle)
      bPlume.width = 17 + 55 * hi
      bPlume.intensity = 2.1 * b.throttle
      bPlume.halo = 70 + 180 * hi
    } else if (b.engines > 0) {
      bPlume.length = b.engines > 3 ? 52 : 30
      bPlume.width = b.engines > 3 ? 11 : 5.5
      bPlume.intensity = 1.2 * b.throttle
      bPlume.halo = b.engines > 3 ? 34 : 18
    } else {
      bPlume.intensity = 0
    }
    if (sh.engines > 0 && !sh.stacked && sh.visible) {
      const hover = sh.throttle < 0.8
      sPlume.length = hover ? 7 : 24
      sPlume.width = hover ? 2 : 4
      sPlume.intensity = 1.1 * sh.throttle
      sPlume.halo = hover ? 8 : 12
    } else {
      sPlume.intensity = 0
    }
    // a bright point that holds its size when the rocket is kilometres away
    const far = smooth(400, 3000, camera.position.distanceTo(siteToWorld(b.pos, tmp.w)) / SITE_SCALE)
    if (dot.current) {
      dot.current.visible = b.visible && b.engines > 0
      dot.current.position.copy(b.pos)
      const k = 0.012 + 0.03 * far
      dot.current.scale.set(k, k, 1)
      dot.current.material.opacity = Math.min(1, b.throttle) * (0.35 + 0.65 * far)
    }
    if (shipDot.current) {
      const fly = !sh.visible && sh.engines > 0
      shipDot.current.visible = fly
      if (fly) {
        shipDot.current.position.copy(sh.pos)
        shipDot.current.scale.set(0.022, 0.022, 1)
      }
    }
    if (flash.current) {
      flash.current.visible = s.staging > 0.01
      if (flash.current.visible) {
        ascentAt(50 - 14, flash.current.position)
        const k = 0.03 + 0.1 * s.staging
        flash.current.scale.set(k, k, 1)
        flash.current.material.opacity = s.staging
      }
    }
    if (bbDot.current) {
      bbDot.current.visible = s.boostback > 0.01
      bbDot.current.position.copy(s.boostbackPos)
      bbDot.current.scale.set(0.018, 0.018, 1)
      bbDot.current.material.opacity = s.boostback
    }
    // the flames light the pad, the tower and the clouds
    const lit = b.engines > 0 ? b.throttle * (b.engines >= 33 ? 1 : b.engines > 3 ? 0.55 : 0.3) * (1 - smooth(150, 700, alt)) : 0
    if (light.current) {
      light.current.position.copy(b.pos).add(tmp.v.set(0, -8, 0))
      light.current.intensity = lit * 3.2e-6 * (0.9 + 0.1 * Math.sin(now * 53) * Math.sin(now * 17))
    }
    const slit = sPlume.intensity > 0 ? 0.4 * sh.throttle : 0
    if (shipLight.current) {
      shipLight.current.position.copy(sh.pos).add(tmp.v.set(0, -6, 0))
      shipLight.current.intensity = slit * 3.2e-6
    }

    // --- clouds ----------------------------------------------------------------
    const d = STILL ? 0 : Math.min(dt, 0.05)
    const rnd = () => {
      S.rnd = (Math.imul(S.rnd, 1664525) + 1013904223) >>> 0
      return S.rnd / 4294967295
    }
    const rate = QUALITY.low ? 0.55 : 1
    // the ignition blast and the column of exhaust off the flame plate
    if (s.blast > 0.01 && alt < 260) {
      const n = Math.floor(52 * s.blast * rate * d + rnd())
      const push = 1 - smooth(20, 260, alt)
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2
        const r = 4 + rnd() * 9
        const v = (18 + rnd() * 32) * push
        const billow = rnd() < 0.3
        smoke.emit({
          x: Math.cos(a) * r,
          y: 2 + rnd() * 8,
          z: Math.sin(a) * r,
          vx: Math.cos(a) * v,
          vy: billow ? 6 + rnd() * 10 : 1 + rnd() * 5,
          vz: Math.sin(a) * v,
          s0: 7 + rnd() * 7,
          s1: 42 + rnd() * 48,
          life: 18 + rnd() * 16,
          drag: 0.42,
          rise: billow ? 1.6 : 0.55,
          alpha: 0.95,
          tone: 0.78 + rnd() * 0.22,
        })
      }
    }
    // the ascent trail, spaced along the path, widening with altitude
    if (b.visible && b.engines >= 33 && b.throttle > 0.5 && alt > 25) {
      const spacing = Math.max(7, alt * 0.02)
      const tail = tmp.w.set(0, -14, 0).applyAxisAngle(tmp.up.set(0, 0, 1), -b.tilt).add(b.pos)
      if (S.lastTrail.y < -1e8) S.lastTrail.copy(tail)
      let dist = S.lastTrail.distanceTo(tail)
      let guard = 0
      while (dist > spacing && guard++ < 40) {
        S.lastTrail.lerp(tail, spacing / dist)
        dist = S.lastTrail.distanceTo(tail)
        const h = S.lastTrail.y
        smoke.emit({
          x: S.lastTrail.x + (rnd() - 0.5) * 4,
          y: h,
          z: S.lastTrail.z + (rnd() - 0.5) * 4,
          vx: (rnd() - 0.5) * 3,
          vy: -2 - rnd() * 3,
          vz: (rnd() - 0.5) * 3,
          s0: 5 + h * 0.004,
          s1: 26 + h * 0.012 + rnd() * 10,
          life: 26 + rnd() * 16,
          drag: 0.25,
          rise: 0.15,
          alpha: 0.85,
          tone: 0.98,
        })
      }
    } else {
      S.lastTrail.set(0, -1e9, 0)
    }
    // landing burns: the booster's plume on the mount, the ship's exhaust
    if (b.visible && b.engines > 0 && b.engines < 33 && alt < 220) {
      const n = Math.floor(26 * rate * d * (1 - smooth(60, 220, alt)) + rnd())
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2
        const v = 14 + rnd() * 26
        smoke.emit({
          x: Math.cos(a) * 6,
          y: 3 + rnd() * 5,
          z: Math.sin(a) * 6,
          vx: Math.cos(a) * v,
          vy: 2 + rnd() * 6,
          vz: Math.sin(a) * v,
          s0: 6 + rnd() * 5,
          s1: 30 + rnd() * 26,
          life: 12 + rnd() * 8,
          drag: 0.5,
          rise: 0.9,
          alpha: 0.8,
          tone: 0.8 + rnd() * 0.2,
        })
      }
    }
    // cryogenic venting: white vapour that tumbles off and sinks
    if (s.vent > 0.01 && b.visible) {
      const n = Math.floor(10 * s.vent * rate * d + rnd())
      const vents = [8, 36, 62, 74, 96, 118]
      for (let i = 0; i < n; i++) {
        const y = OLM_TOP + vents[Math.floor(rnd() * vents.length)]
        const a = rnd() * Math.PI * 2
        smoke.emit({
          x: Math.cos(a) * 5,
          y,
          z: Math.sin(a) * 5,
          vx: Math.cos(a) * (2 + rnd() * 2),
          vy: -0.5,
          vz: Math.sin(a) * (2 + rnd() * 2),
          s0: 1.5,
          s1: 7 + rnd() * 6,
          life: 5 + rnd() * 3,
          drag: 0.8,
          rise: -0.35,
          alpha: 0.5,
          tone: 1.05,
        })
      }
    }
    const heat = (x: number, y: number, z: number) => {
      let h = 0
      if (lit > 0) {
        const dx = x - b.pos.x
        const dy = y - (b.pos.y - 10)
        const dz = z - b.pos.z
        h += lit * Math.exp(-Math.sqrt(dx * dx + dy * dy + dz * dz) / 26)
      }
      return h
    }
    smoke.step(d, WIND, heat, 0.4)
    g.updateMatrixWorld()
    tmp.inv.copy(g.matrixWorld).invert()
    smoke.update(camera, tmp.inv)
    if (b.visible && (b.pos.y > OLM_TOP + 0.01 || s.t > 80)) anchors.shadowsDirty = true
    if (s.armOpen > 0 && s.armOpen < 0.5) anchors.shadowsDirty = true
  }, -3)

  const sprite = (ref: React.RefObject<Sprite | null>, color: string) => (
    <sprite ref={ref} visible={false} renderOrder={8}>
      <spriteMaterial map={tex} color={color} blending={AdditiveBlending} depthWrite={false} transparent sizeAttenuation={false} toneMapped={false} />
    </sprite>
  )

  return (
    <group ref={site}>
      <primitive object={mz} />
      <group ref={boosterG}>
        <primitive object={booster} />
        <group position={[0, 0.1, 0]}>
          <Plume length={1} width={1} live={bPlume} diamonds={0.55} core="#fff3dc" outer="#ff9a4a" order={7} />
        </group>
      </group>
      <group ref={shipG}>
        <primitive object={ship} />
        {SHIP_SL.map((p, i) => (
          <group key={i} position={p}>
            <Plume length={1} width={1} live={sPlume} diamonds={0.5} core="#fff4ea" outer="#ffa45e" order={7} />
          </group>
        ))}
      </group>
      <primitive object={smoke.mesh} />
      {sprite(dot, '#ffd9a0')}
      {sprite(shipDot, '#e8eeff')}
      {sprite(flash, '#fff2d8')}
      {sprite(bbDot, '#ffcf96')}
      <pointLight ref={light} color="#ffb46e" intensity={0} distance={1400 * SITE_SCALE} decay={2} />
      <pointLight ref={shipLight} color="#ffba7a" intensity={0} distance={500 * SITE_SCALE} decay={2} />
    </group>
  )
}
