/** @jsxImportSource react */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Matrix4, Vector3, type Group } from 'three'
import { LunarLander } from '../ships/Starship'
import { Plume, type PlumeLive } from '../ships/Plume'
import { Smoke } from '../starbase/Smoke'
import { anchors, BASE_SCALE } from '../stage'
import { STILL } from '../../scene/debug'

// A Starship lander comes down on the outpost's far pad. It lands on the
// thrusters mounted high on its hull (so the main engines never dig a crater
// under it): they fire from 38 m up, and when they get close the regolith
// sprays out along the ground in sheets, ballistically, with no air to hold
// it up. It sits a while, then lifts off on the same thrusters and climbs out.
// Metres, inside the base's BASE_SCALE group.
const LOOP = 60
const T_TOUCH = 15
const T_LIFT = 37
const T_GONE = 52
const THRUSTERS = [45, 135, 225, 315].map((d) => {
  const a = (d * Math.PI) / 180
  return [5.25 * Math.cos(a), 38.0, -5.25 * Math.sin(a)] as [number, number, number]
})
const ZERO = new Vector3()

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

export function MoonLanding({ pad: [PX, PZ] }: { pad: [number, number] }) {
  const ship = useRef<Group>(null)
  const root = useRef<Group>(null)
  const burn = useMemo<PlumeLive>(() => ({ length: 0, width: 0, intensity: 0, halo: 0 }), [])
  // no sky on the Moon: dust is lit by the sun and a little ground bounce
  const smoke = useMemo(() => new Smoke(260, BASE_SCALE).setLighting(new Color(2.8, 2.7, 2.55), new Color(0.07, 0.07, 0.07)), [])
  useEffect(() => () => smoke.dispose(), [smoke])
  const start = useRef(-1e9)
  const near = useRef(false)
  const seed = useRef(3)
  const inv = useMemo(() => new Matrix4(), [])

  useFrame(({ clock, camera }, dt) => {
    const s = ship.current
    const r = root.current
    if (!s || !r) return
    const close = camera.position.distanceTo(anchors.moonBase) < 0.1
    if (close && !near.current && clock.elapsedTime - start.current > LOOP * 0.8) start.current = clock.elapsedTime + 1
    near.current = close
    const t = STILL ? T_TOUCH + 4 : (((clock.elapsedTime - start.current) % LOOP) + LOOP) % LOOP
    let y = 0
    let thrust = 0
    if (t < T_TOUCH) {
      const k = 1 - t / T_TOUCH
      y = 900 * Math.pow(k, 2.3)
      thrust = 0.6 + 0.4 * smooth(0.55, 1, 1 - k)
    } else if (t < T_LIFT) {
      y = 0
    } else if (t < T_GONE) {
      const k = (t - T_LIFT) / (T_GONE - T_LIFT)
      y = 1200 * Math.pow(k, 2.1)
      thrust = t < T_LIFT + 0.8 ? smooth(T_LIFT, T_LIFT + 0.8, t) : 1
    }
    s.visible = t < T_GONE
    s.position.set(PX, y, PZ)
    burn.length = 26
    burn.width = 4.2
    burn.intensity = 0.9 * thrust
    burn.halo = 9
    // regolith spray: sheets of dust flung out along the ground
    const d = STILL ? 0 : Math.min(dt, 0.05)
    const reach = y + 38
    if (thrust > 0 && reach < 110) {
      const k = 1 - smooth(45, 110, reach)
      const rnd = () => {
        seed.current = (Math.imul(seed.current, 1664525) + 1013904223) >>> 0
        return seed.current / 4294967295
      }
      const n = Math.floor(120 * k * d + rnd())
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2
        const v = 70 + rnd() * 90
        smoke.emit({
          x: PX + Math.cos(a) * (5 + rnd() * 8),
          y: 0.6 + rnd() * 1.2,
          z: PZ + Math.sin(a) * (5 + rnd() * 8),
          vx: Math.cos(a) * v,
          vy: 1.5 + rnd() * 4,
          vz: Math.sin(a) * v,
          s0: 1.2,
          s1: 4 + rnd() * 3,
          life: 0.9 + rnd() * 0.7,
          drag: 0,
          rise: -1.6,
          alpha: 0.3,
          tone: 0.8,
        })
      }
    }
    smoke.step(d, ZERO, () => 0, 0)
    r.updateMatrixWorld()
    inv.copy(r.matrixWorld).invert()
    smoke.update(camera, inv)
    if (s.visible && y > 0) anchors.shadowsDirty = true
  })

  return (
    <group ref={root}>
      <group ref={ship} position={[PX, 0, PZ]} rotation-y={0.9}>
        <LunarLander />
        {THRUSTERS.map((p, i) => (
          <group key={i} position={p}>
            <Plume length={1} width={1} live={burn} diamonds={0.1} core="#f7f3ff" outer="#9b8cff" order={7} />
          </group>
        ))}
      </group>
      <primitive object={smoke.mesh} />
    </group>
  )
}
