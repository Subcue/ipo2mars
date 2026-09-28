/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Matrix4, Quaternion, Vector3, type Group, type Sprite } from 'three'
import { Starship } from './Starship'
import { anchors, SHIP_LENGTH, shipCamDir } from '../stage'
import { TRANSIT_CURVE, TRANSIT_PERIOD, routeParam } from './route'
import { STILL } from '../../scene/debug'
import { glowTexture } from '../render/textures'

// A Starship working the Earth-Mars cycler. `phase` (0..1) offsets it along
// the shared route so several ships ride it at once; the `primary` ship is the
// one the camera follows and it publishes its pose to the stage anchors.
//
// Orientation: nose along the velocity, and rolled so the side the follow
// camera sits on shows the classic three-quarter view (heat shield and bare
// steel split down the middle, flaps catching the light).
export function TransitShip({
  onClick,
  onHover,
  phase = 0,
  primary = true,
  length = SHIP_LENGTH,
  beacon = 0,
}: {
  onClick?: () => void
  onHover?: (hovering: boolean) => void
  phase?: number
  primary?: boolean
  length?: number
  /** 0..1: a screen-size glint so the ship reads on the overview map. */
  beacon?: number
}) {
  const ref = useRef<Group>(null)
  const glint = useRef<Sprite>(null)
  const tex = useMemo(() => glowTexture(), [])
  const tmp = useMemo(
    () => ({ m: new Matrix4(), q: new Quaternion(), side: new Vector3(), x: new Vector3(), z: new Vector3() }),
    [],
  )

  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const time = STILL ? 30 : clock.elapsedTime
    const t = routeParam(time / TRANSIT_PERIOD + phase)
    const pos = TRANSIT_CURVE.getPointAt(t)
    const tan = TRANSIT_CURVE.getTangentAt(t)
    // Rolled so the follow camera looks at the sunlit stainless lee side
    // (20 degrees off square): the black flaps stand out in plan against the
    // steel, with a sliver of heat shield along one edge.
    shipCamDir(tan, tmp.side)
    tmp.x.copy(tmp.side).applyAxisAngle(tan, -1.22)
    tmp.z.crossVectors(tmp.x, tan).normalize()
    tmp.x.crossVectors(tan, tmp.z).normalize()
    tmp.m.makeBasis(tmp.x, tan, tmp.z)
    g.position.copy(pos)
    g.quaternion.setFromRotationMatrix(tmp.m)
    if (glint.current) {
      const m = glint.current.material
      m.opacity += (beacon - m.opacity) * 0.08
      glint.current.visible = m.opacity > 0.01
    }
    if (primary) {
      anchors.ship.copy(pos)
      anchors.shipTan.copy(tan)
      anchors.shipQuat.copy(g.quaternion)
      anchors.ready.ship = true
    }
  }, -3)

  return (
    <group
      ref={ref}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
      onPointerOver={onHover ? (e) => { e.stopPropagation(); onHover(true) } : undefined}
      onPointerOut={onHover ? () => onHover(false) : undefined}
    >
      <Starship length={length} firing={1} />
      <sprite ref={glint} scale={[0.022, 0.022, 1]} renderOrder={8}>
        <spriteMaterial
          map={tex}
          color="#ffd7a8"
          blending={AdditiveBlending}
          depthWrite={false}
          transparent
          opacity={0}
          sizeAttenuation={false}
          toneMapped={false}
        />
      </sprite>
      {/* generous invisible hitbox: a small ship is hard to click */}
      <mesh visible={false} position={[0, length * 0.5, 0]}>
        <sphereGeometry args={[length * 1.2, 8, 8]} />
      </mesh>
    </group>
  )
}
