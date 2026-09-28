/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, NormalBlending, type Group, type Sprite } from 'three'
import { LandedStarship } from '../ships/Starship'
import { Plume } from '../ships/Plume'
import { glowTexture } from '../render/textures'
import { anchors } from '../stage'
import { STILL } from '../../scene/debug'

// The settlement is busy: a Starship drops onto the free pad on its landing
// burn, kicking up a dust ring, sits a while, then lifts off again. Metres,
// inside the base's BASE_SCALE group.
const LOOP = 52
const T_TOUCH = 11
const T_LIFT = 28
const T_GONE = 42
// sea-level Raptors: three centre engines (model metres, lifted on legs)
const ENGINES = [30, 150, 270].map((d) => {
  const a = (d * Math.PI) / 180
  return [1.05 * Math.cos(a), 2.9, -1.05 * Math.sin(a)] as [number, number, number]
})
const DUST = Array.from({ length: 9 }, (_, i) => (i / 9) * Math.PI * 2)

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

export function MarsLanding({ pad: [PX, PZ], phase = 0, restart = false }: { pad: [number, number]; phase?: number; restart?: boolean }) {
  const ship = useRef<Group>(null)
  const burn = useRef<Group>(null)
  const dust = useRef<(Sprite | null)[]>([])
  const tex = useMemo(() => glowTexture(), [])
  const dustColor = useMemo(() => new Color('#a8764f'), [])
  // The cycle (re)starts when the camera arrives, so a visitor always gets
  // the descent: the ship drops into frame a couple of seconds after landing.
  const start = useRef(-1e9)
  const near = useRef(false)

  useFrame(({ clock, camera }) => {
    const s = ship.current
    const b = burn.current
    if (!s || !b) return
    const close = camera.position.distanceTo(anchors.marsBase) < 0.12
    if (restart && close && !near.current && clock.elapsedTime - start.current > LOOP * 0.8) start.current = clock.elapsedTime + 1.5
    near.current = close
    const t = STILL ? T_TOUCH + 4 : (((clock.elapsedTime - start.current + phase) % LOOP) + LOOP) % LOOP
    let y = 0
    let thrust = 0
    let kick = 0
    if (t < T_TOUCH) {
      // decelerating descent on the landing burn
      const k = 1 - t / T_TOUCH
      y = 520 * Math.pow(k, 2.4)
      thrust = 0.55 + 0.45 * smooth(0.6, 1, 1 - k)
      kick = smooth(T_TOUCH - 3.5, T_TOUCH, t)
    } else if (t < T_LIFT) {
      y = 0
      kick = 1 - smooth(T_TOUCH, T_TOUCH + 4, t)
    } else if (t < T_GONE) {
      const k = (t - T_LIFT) / (T_GONE - T_LIFT)
      y = 900 * Math.pow(k, 2.2)
      thrust = t < T_LIFT + 0.6 ? smooth(T_LIFT, T_LIFT + 0.6, t) : 1
      kick = smooth(T_LIFT - 0.2, T_LIFT + 0.8, t) * (1 - smooth(T_LIFT + 2, T_LIFT + 6, t))
    }
    const visible = t < T_GONE
    s.visible = visible
    s.position.set(PX, y, PZ)
    b.visible = visible && thrust > 0.01
    b.scale.setScalar(0.75 + 0.35 * thrust)
    // dust ring: rolls outward along the ground, fading
    DUST.forEach((a, i) => {
      const d = dust.current[i]
      if (!d) return
      const spread = 30 + 70 * kick + (i % 3) * 10
      d.position.set(PX + Math.cos(a) * spread, 6 + 10 * kick, PZ + Math.sin(a) * spread)
      const sc = 40 + 90 * kick
      d.scale.set(sc, sc * 0.55, 1)
      d.material.opacity = 0.42 * kick * (y < 120 || t >= T_LIFT ? 1 : 0)
      d.visible = d.material.opacity > 0.01
    })
    if (visible) anchors.shadowsDirty = y > 0
  })

  return (
    <group>
      <group ref={ship} position={[PX, 0, PZ]} rotation-y={0.6}>
        <LandedStarship />
        <group ref={burn}>
          {ENGINES.map((p, i) => (
            <group key={i} position={p}>
              <Plume length={26} width={7} intensity={1.1} diamonds={0.7} halo={11} core="#fff4ea" outer="#a08cff" />
            </group>
          ))}
        </group>
      </group>
      {DUST.map((_, i) => (
        <sprite key={i} ref={(el) => (dust.current[i] = el)} visible={false}>
          <spriteMaterial map={tex} color={dustColor} blending={NormalBlending} depthWrite={false} transparent opacity={0} />
        </sprite>
      ))}
    </group>
  )
}
