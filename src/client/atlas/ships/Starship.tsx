/** @jsxImportSource react */
import { useModel } from '../useModel'

// Blender-built stylized vehicles (original designs, not official models).
// Source of truth: tools/blender/build_assets.py -> public/models/*.glb.
// Both models are unit-height along +Y with the tail at y=0; `length` scales.

export function Starship({ length = 0.3, engine = false }: { length?: number; engine?: boolean }) {
  const model = useModel('/models/starship.glb')
  return (
    <group scale={length}>
      <primitive object={model} />
      {engine ? (
        <mesh position={[0, -0.012, 0]}>
          <sphereGeometry args={[0.075, 10, 10]} />
          <meshBasicMaterial color="#9fd0ff" toneMapped={false} transparent opacity={0.9} />
        </mesh>
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

// Pulsing landing/ascent flame, pointing down from y=0. Procedural on purpose:
// it animates by scale every frame.
export function Flame({ size = 0.1, intensity = 1 }: { size?: number; intensity?: number }) {
  return (
    <mesh position={[0, -size / 2, 0]} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[size * 0.32, size, 10]} />
      <meshBasicMaterial color="#ffb36b" toneMapped={false} transparent opacity={0.85 * intensity} />
    </mesh>
  )
}
