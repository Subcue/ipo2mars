/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Trail } from '@react-three/drei'
import { Quaternion, Vector3, type Group } from 'three'
import { Starship } from './Starship'
import { anchors } from '../stage'
import { TRANSIT_CURVE, TRANSIT_PERIOD } from './route'

const UP = new Vector3(0, 1, 0)

// A Starship working the Earth-Mars cycler. `phase` (0..1) offsets it along the
// shared route so several ships can ride it at once; the `primary` ship is the
// one the camera follows and writes its position to the anchors.
export function TransitShip({
  onClick,
  onHover,
  phase = 0,
  primary = true,
  length = 0.34,
}: {
  onClick?: () => void
  onHover?: (hovering: boolean) => void
  phase?: number
  primary?: boolean
  length?: number
}) {
  const ref = useRef<Group>(null)
  const q = useMemo(() => new Quaternion(), [])

  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const t = ((clock.elapsedTime / TRANSIT_PERIOD + phase) % 1 + 1) % 1
    const pos = TRANSIT_CURVE.getPointAt(t)
    const tan = TRANSIT_CURVE.getTangentAt(t)
    g.position.copy(pos)
    g.quaternion.copy(q.setFromUnitVectors(UP, tan))
    if (primary) {
      anchors.ship.copy(pos)
      anchors.shipTan.copy(tan)
      anchors.ready.ship = true
    }
  })

  return (
    <Trail width={0.11 * (length / 0.34)} length={8} color="#8fc0ff" attenuation={(w) => w * w * w}>
      <group
        ref={ref}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
        onPointerOver={onHover ? (e) => { e.stopPropagation(); onHover(true) } : undefined}
        onPointerOut={onHover ? () => onHover(false) : undefined}
      >
        <Starship length={length} engine />
        {/* generous invisible hitbox: a short ship is hard to click */}
        <mesh visible={false}>
          <sphereGeometry args={[0.5, 8, 8]} />
        </mesh>
      </group>
    </Trail>
  )
}
