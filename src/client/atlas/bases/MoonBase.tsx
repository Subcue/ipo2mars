/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import { surfacePose } from './surface'
import { MOON_RADIUS, anchors } from '../stage'
import { useModel } from '../useModel'

// Blender-built lunar outpost (tools/blender/build_assets.py): regolith-bermed
// domes, tunnels, an HLS-style lander, comms tower, solar field and rover.
// Publishes its world position so the camera can frame it as a hero shot.
export function MoonBase() {
  const pose = useMemo(() => surfacePose(MOON_RADIUS, 17, -175), [])
  const model = useModel('/models/moonbase.glb')
  const ref = useRef<Group>(null)
  const world = useRef(new Vector3())

  useFrame(() => {
    if (ref.current) {
      anchors.moonBase.copy(ref.current.getWorldPosition(world.current))
      anchors.ready.moon = true
    }
  })

  return (
    <group ref={ref} position={pose.position} quaternion={pose.quaternion} scale={0.17}>
      <primitive object={model} />
    </group>
  )
}
