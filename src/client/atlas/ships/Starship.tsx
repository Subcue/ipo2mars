/** @jsxImportSource react */
import { useModel } from '../useModel'
import { Plume } from './Plume'

// Blender-built stylized vehicles (original designs, not official models).
// Source of truth: tools/blender/build_assets.py -> public/models/*.glb.
// Both models are unit-height along +Y with the tail at y=0; `length` scales.

export function Starship({ length = 0.3, engine = false }: { length?: number; engine?: boolean }) {
  const model = useModel('/models/starship.glb')
  return (
    <group scale={length}>
      <primitive object={model} />
      {/* Vacuum Raptor plume firing from the engine bells at the tail. */}
      {engine ? (
        <group position={[0, 0.012, 0]}>
          <Plume scale={0.13} />
        </group>
      ) : null}
    </group>
  )
}

export function Booster({ length = 0.34 }: { length?: number }) {
  const model = useModel('/models/booster.glb')
  return (
    <group scale={length}>
      <primitive object={model} />
    </group>
  )
}

// Atmospheric launch / landing flame, pointing down -Y from y=0. Built on the
// same additive Plume so it matches the engine look; warmer and tighter than
// the vacuum plume. Procedural on purpose: it pulses every frame.
export function Flame({ size = 0.1, intensity = 1 }: { size?: number; intensity?: number }) {
  return <Plume scale={size} intensity={intensity} vacuum={false} core="#fff1cf" outer="#ff7a2e" />
}
