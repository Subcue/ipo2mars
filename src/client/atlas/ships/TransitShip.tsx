/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Trail } from '@react-three/drei'
import { CatmullRomCurve3, Quaternion, Vector3, type Group } from 'three'
import { Starship } from './Starship'
import { anchors } from '../stage'

const UP = new Vector3(0, 1, 0)
const PERIOD = 140 // seconds per full circuit

// One Starship working the Earth-Mars route on a closed loop: the outbound
// leg arcs above the ecliptic, the return leg comes home beneath it, so the
// motion is continuous (no teleports, no trail streaks).
export function TransitShip({
  onClick,
  onHover,
}: {
  onClick?: () => void
  onHover?: (hovering: boolean) => void
}) {
  const ref = useRef<Group>(null)
  const q = useMemo(() => new Quaternion(), [])

  const curve = useMemo(
    () =>
      new CatmullRomCurve3(
        [
          new Vector3(1.9, 0.6, 0.9), // Earth departure
          new Vector3(14, 4.5, -7),
          new Vector3(30, 6, -17),
          new Vector3(44.4, 3.6, -26.7), // Mars approach
          new Vector3(30, -2.5, -22),
          new Vector3(13, -3, -9),
        ],
        true,
        'centripetal',
      ),
    [],
  )

  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const t = (clock.elapsedTime % PERIOD) / PERIOD
    const pos = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    g.position.copy(pos)
    g.quaternion.copy(q.setFromUnitVectors(UP, tan))
    anchors.ship.copy(pos)
  })

  return (
    <Trail width={0.5} length={6} color="#7db8ff" attenuation={(w) => w * w}>
      <group
        ref={ref}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
        onPointerOver={onHover ? (e) => { e.stopPropagation(); onHover(true) } : undefined}
        onPointerOut={onHover ? () => onHover(false) : undefined}
      >
        <Starship length={0.34} engine />
        {/* generous invisible hitbox: a 0.34-long ship is hard to click */}
        <mesh visible={false}>
          <sphereGeometry args={[0.5, 8, 8]} />
        </mesh>
      </group>
    </Trail>
  )
}
