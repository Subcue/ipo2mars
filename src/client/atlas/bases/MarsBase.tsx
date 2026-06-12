/** @jsxImportSource react */
import { useMemo } from 'react'
import { surfacePose } from './surface'
import { MARS_RADIUS } from '../stage'

// Stylized Mars settlement (original design): dust-toned habitats, a glowing
// greenhouse, and a solar field on a cleared pad. Rides the rotating surface.
export function MarsBase() {
  const pose = useMemo(() => surfacePose(MARS_RADIUS, 38, 50), [])

  return (
    <group position={pose.position} quaternion={pose.quaternion}>
      {/* cleared pad */}
      <mesh position={[0, 0.002, 0]}>
        <cylinderGeometry args={[0.07, 0.078, 0.004, 28]} />
        <meshStandardMaterial color="#8a5a44" roughness={0.95} />
      </mesh>
      {/* habitat domes */}
      <mesh position={[0.02, 0.004, 0.01]}>
        <sphereGeometry args={[0.024, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e3d3c6" roughness={0.6} />
      </mesh>
      <mesh position={[-0.018, 0.004, 0.018]}>
        <sphereGeometry args={[0.017, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d9c6b6" roughness={0.6} />
      </mesh>
      {/* greenhouse: the one thing that glows green on a red planet */}
      <mesh position={[-0.004, 0.004, -0.022]}>
        <sphereGeometry args={[0.019, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#9fe8c8"
          emissive="#54e8a4"
          emissiveIntensity={0.85}
          roughness={0.3}
        />
      </mesh>
      {/* solar field */}
      <group position={[0.046, 0.006, -0.02]} rotation={[0, -0.5, 0]}>
        <mesh rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.03, 0.001, 0.014]} />
          <meshStandardMaterial color="#16243f" roughness={0.35} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.02]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.03, 0.001, 0.014]} />
          <meshStandardMaterial color="#16243f" roughness={0.35} metalness={0.5} />
        </mesh>
      </group>
      {/* habitat windows */}
      <mesh position={[0.02, 0.016, 0.026]}>
        <sphereGeometry args={[0.0035, 8, 8]} />
        <meshStandardMaterial color="#ffd9a0" emissive="#ffc46b" emissiveIntensity={2.2} />
      </mesh>
    </group>
  )
}
