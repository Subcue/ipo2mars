/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  QuadraticBezierCurve3,
  Quaternion,
  Vector3,
  type Group,
  type Sprite,
} from 'three'
import { Starship, Booster, Flame } from './Starship'
import { glowTexture } from './Plume'

const UP = new Vector3(0, 1, 0)

// Launch-and-recovery loop near Earth (stage radius 1), on a fixed world-space
// pad on the sunlit, camera-facing hemisphere:
//   idle -> full-stack ascent -> staging -> ship burns on toward orbit while
//   the booster arcs back and lands on its flame -> quiet pad -> again.
const T = {
  liftoff: 3,
  staging: 10,
  shipGone: 17,
  boosterDown: 18.5,
  loop: 26,
}

const easeInQuad = (x: number) => x * x
const easeOutQuad = (x: number) => 1 - (1 - x) * (1 - x)

export function LaunchCycle() {
  const stack = useRef<Group>(null) // booster (+ship until staging)
  const shipRef = useRef<Group>(null) // free-flying ship after staging
  const flameRef = useRef<Group>(null)
  const padGlow = useRef<Sprite>(null) // scorch glow on the pad during burn
  const q = useMemo(() => new Quaternion(), [])
  const padTex = useMemo(() => glowTexture(), [])

  const geom = useMemo(() => {
    // Pad on the lit front: lat 8°, lon 35°.
    const n = new Vector3(
      Math.cos((8 * Math.PI) / 180) * Math.cos((35 * Math.PI) / 180),
      Math.sin((8 * Math.PI) / 180),
      Math.cos((8 * Math.PI) / 180) * Math.sin((35 * Math.PI) / 180),
    )
    const pad = n.clone().multiplyScalar(1.001)
    const east = new Vector3().crossVectors(UP, n).normalize()
    const staging = pad.clone().addScaledVector(n, 0.42).addScaledVector(east, 0.3)
    const orbitOut = pad.clone().addScaledVector(n, 0.55).addScaledVector(east, 1.1)
    const ascent = new QuadraticBezierCurve3(
      pad,
      pad.clone().addScaledVector(n, 0.3).addScaledVector(east, 0.05),
      staging,
    )
    const shipLeg = new QuadraticBezierCurve3(
      staging,
      staging.clone().addScaledVector(n, 0.12).addScaledVector(east, 0.45),
      orbitOut,
    )
    const descent = new QuadraticBezierCurve3(
      staging,
      pad.clone().addScaledVector(n, 0.34).addScaledVector(east, -0.12),
      pad,
    )
    return { n, pad, ascent, shipLeg, descent }
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime % T.loop
    const { n, pad, ascent, shipLeg, descent } = geom
    const stk = stack.current
    const ship = shipRef.current
    const flame = flameRef.current
    const pg = padGlow.current
    if (!stk || !ship || !flame) return

    // Default orientations: along the surface normal.
    if (t < T.liftoff) {
      // On the pad, ship mated on top of the booster.
      stk.visible = true
      stk.position.copy(pad)
      stk.quaternion.copy(q.setFromUnitVectors(UP, n))
      ship.visible = true
      ship.position.copy(pad.clone().addScaledVector(n, 0.115))
      ship.quaternion.copy(stk.quaternion)
      flame.visible = false
      if (pg) pg.material.opacity = 0
    } else if (t < T.staging) {
      // Full-stack ascent.
      const k = easeInQuad((t - T.liftoff) / (T.staging - T.liftoff))
      const pos = ascent.getPoint(k)
      const tan = ascent.getTangent(k)
      stk.visible = true
      stk.position.copy(pos)
      stk.quaternion.copy(q.setFromUnitVectors(UP, tan))
      ship.visible = true
      ship.position.copy(pos.clone().addScaledVector(tan, 0.115))
      ship.quaternion.copy(stk.quaternion)
      flame.visible = true
      flame.position.copy(pos)
      flame.quaternion.copy(stk.quaternion)
      flame.scale.setScalar(1 + Math.sin(clock.elapsedTime * 37) * 0.18)
      // Scorch glow on the pad, brightest at the base, gone by mid-ascent.
      if (pg) pg.material.opacity = Math.max(0, 1 - k * 1.7) * 0.9
    } else {
      // After staging: the ship burns outward...
      const ks = Math.min((t - T.staging) / (T.shipGone - T.staging), 1)
      if (ks < 1) {
        const pos = shipLeg.getPoint(easeOutQuad(ks))
        const tan = shipLeg.getTangent(easeOutQuad(ks))
        ship.visible = true
        ship.position.copy(pos)
        ship.quaternion.copy(q.setFromUnitVectors(UP, tan))
        // shrink away in the last stretch
        const fade = ks > 0.8 ? Math.max(1 - (ks - 0.8) / 0.2, 0.001) : 1
        ship.scale.setScalar(fade)
      } else {
        ship.visible = false
        ship.scale.setScalar(1)
      }

      // ...while the booster comes home tail-first on its flame.
      const kb = Math.min((t - T.staging) / (T.boosterDown - T.staging), 1)
      const pos = descent.getPoint(easeOutQuad(kb))
      stk.visible = true
      stk.position.copy(pos)
      stk.quaternion.copy(q.setFromUnitVectors(UP, n)) // tail-first, upright
      const burning = kb > 0.25 && kb < 0.98
      flame.visible = burning
      if (burning) {
        flame.position.copy(pos)
        flame.quaternion.copy(stk.quaternion)
        flame.scale.setScalar(0.8 + Math.sin(clock.elapsedTime * 41) * 0.22)
      }
      // Touchdown glow swells as the booster settles onto the pad.
      if (pg) pg.material.opacity = burning ? Math.max(0, (kb - 0.45) / 0.55) * 0.8 : 0
    }
  })

  return (
    <group>
      {/* pad marker */}
      <mesh position={geom.pad} quaternion={q.clone().setFromUnitVectors(UP, geom.n)}>
        <cylinderGeometry args={[0.035, 0.035, 0.003, 20]} />
        <meshStandardMaterial color="#6f7682" roughness={0.85} />
      </mesh>
      {/* Additive scorch glow; opacity driven each frame by the burn state. */}
      <sprite ref={padGlow} position={geom.pad.clone().addScaledVector(geom.n, 0.02)} scale={[0.3, 0.3, 1]}>
        <spriteMaterial
          map={padTex}
          color="#ff8a3c"
          blending={AdditiveBlending}
          depthWrite={false}
          transparent
          opacity={0}
          toneMapped={false}
        />
      </sprite>
      <group ref={stack}>
        <Booster length={0.115} />
      </group>
      <group ref={shipRef}>
        <Starship length={0.1} engine />
      </group>
      <group ref={flameRef}>
        <Flame size={0.075} />
      </group>
    </group>
  )
}
