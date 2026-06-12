/** @jsxImportSource react */
import { useMemo } from 'react'
import { surfacePose } from './surface'
import { MARS_RADIUS } from '../stage'
import { useModel } from '../useModel'

// Blender-built Mars settlement (tools/blender/build_assets.py): ribbed
// habitats, a glowing greenhouse vault, and a solar field on a cleared pad.
export function MarsBase() {
  const pose = useMemo(() => surfacePose(MARS_RADIUS, 38, 50), [])
  const model = useModel('/models/marsbase.glb')

  return (
    <group position={pose.position} quaternion={pose.quaternion} scale={0.16}>
      <primitive object={model} />
    </group>
  )
}
