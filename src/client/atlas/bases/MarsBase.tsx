/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import { surfacePose } from './surface'
import { MARS_RADIUS, anchors } from '../stage'
import { useModel } from '../useModel'

// Blender-built Mars settlement (tools/blender/build_assets.py): landed
// Starships, capsule habitats, a glowing greenhouse, an ISRU tank farm and a
// solar field on a dusted pad. Publishes its world position so the camera can
// frame it as a hero shot (the body rotates under it).
export function MarsBase() {
  const pose = useMemo(() => surfacePose(MARS_RADIUS, 38, 50), [])
  const model = useModel('/models/marsbase.glb')
  const ref = useRef<Group>(null)
  const world = useRef(new Vector3())

  useFrame(() => {
    if (ref.current) {
      anchors.marsBase.copy(ref.current.getWorldPosition(world.current))
      anchors.ready.mars = true
    }
  })

  return (
    <group ref={ref} position={pose.position} quaternion={pose.quaternion} scale={0.2}>
      <primitive object={model} />
    </group>
  )
}
