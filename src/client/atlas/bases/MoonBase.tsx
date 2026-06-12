/** @jsxImportSource react */
import { useMemo } from 'react'
import { surfacePose } from './surface'
import { MOON_RADIUS } from '../stage'
import { useModel } from '../useModel'

// Blender-built lunar outpost (tools/blender/build_assets.py): ribbed domes,
// tunnels, comms dish, lit windows. Unit-ish footprint; scaled to the Moon.
export function MoonBase() {
  const pose = useMemo(() => surfacePose(MOON_RADIUS, 17, -175), [])
  const model = useModel('/models/moonbase.glb')

  return (
    <group position={pose.position} quaternion={pose.quaternion} scale={0.12}>
      <primitive object={model} />
    </group>
  )
}
