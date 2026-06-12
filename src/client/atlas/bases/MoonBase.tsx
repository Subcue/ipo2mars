/** @jsxImportSource react */
import { useMemo } from 'react'
import { surfacePose } from './surface'
import { MOON_RADIUS } from '../stage'

// Stylized lunar outpost (original design, not an official concept): a cluster
// of white habitat domes on a landing apron, with warm lit windows. Lives
// inside the Moon's rotating mesh, so it rides the surface.
export function MoonBase() {
  const pose = useMemo(() => surfacePose(MOON_RADIUS, 17, -175), [])

  return (
    <group position={pose.position} quaternion={pose.quaternion}>
      {/* landing apron */}
      <mesh position={[0, 0.002, 0]}>
        <cylinderGeometry args={[0.05, 0.055, 0.004, 24]} />
        <meshStandardMaterial color="#9a9aa4" roughness={0.9} />
      </mesh>
      {/* habitat domes */}
      <mesh position={[0.012, 0.004, 0.008]}>
        <sphereGeometry args={[0.02, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e9eaf0" roughness={0.55} />
      </mesh>
      <mesh position={[-0.014, 0.004, -0.002]}>
        <sphereGeometry args={[0.015, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#dfe1e8" roughness={0.55} />
      </mesh>
      <mesh position={[-0.002, 0.004, -0.02]}>
        <sphereGeometry args={[0.011, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d4d7df" roughness={0.55} />
      </mesh>
      {/* connecting tube */}
      <mesh position={[-0.001, 0.006, 0.003]} rotation={[0, 0.5, Math.PI / 2]}>
        <cylinderGeometry args={[0.004, 0.004, 0.026, 10]} />
        <meshStandardMaterial color="#c9ccd6" roughness={0.6} />
      </mesh>
      {/* lit windows: signs of life on the night side */}
      <mesh position={[0.012, 0.013, 0.019]}>
        <sphereGeometry args={[0.0035, 8, 8]} />
        <meshStandardMaterial color="#ffd9a0" emissive="#ffc46b" emissiveIntensity={2.4} />
      </mesh>
      <mesh position={[-0.02, 0.009, -0.01]}>
        <sphereGeometry args={[0.0025, 8, 8]} />
        <meshStandardMaterial color="#ffd9a0" emissive="#ffc46b" emissiveIntensity={2.4} />
      </mesh>
      {/* comms mast */}
      <mesh position={[0.03, 0.018, -0.018]}>
        <cylinderGeometry args={[0.0012, 0.0018, 0.036, 8]} />
        <meshStandardMaterial color="#b9bdc8" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  )
}
