/** @jsxImportSource react */

// Stylized Starship (original low-poly design, not an official model):
// steel body + nose cone + fins, built along +Y with the engine at y=0.
// `length` is the overall height in stage units.
export function Starship({ length = 0.3, engine = false }: { length?: number; engine?: boolean }) {
  const r = length * 0.085
  const body = length * 0.68
  const nose = length * 0.32

  return (
    <group>
      {/* body */}
      <mesh position={[0, body / 2, 0]}>
        <cylinderGeometry args={[r, r, body, 14]} />
        <meshStandardMaterial color="#cfd4dc" metalness={0.85} roughness={0.35} />
      </mesh>
      {/* nose */}
      <mesh position={[0, body + nose / 2, 0]}>
        <coneGeometry args={[r, nose, 14]} />
        <meshStandardMaterial color="#c4cad4" metalness={0.85} roughness={0.4} />
      </mesh>
      {/* fins */}
      {[0, Math.PI].map((a) => (
        <group key={`top-${a}`} rotation={[0, a, 0]}>
          <mesh position={[r * 1.25, body * 0.92, 0]} rotation={[0, 0, -0.5]}>
            <boxGeometry args={[r * 1.6, length * 0.1, r * 0.3]} />
            <meshStandardMaterial color="#aab1bd" metalness={0.8} roughness={0.45} />
          </mesh>
          <mesh position={[r * 1.35, body * 0.12, 0]} rotation={[0, 0, -0.35]}>
            <boxGeometry args={[r * 2.0, length * 0.13, r * 0.34]} />
            <meshStandardMaterial color="#aab1bd" metalness={0.8} roughness={0.45} />
          </mesh>
        </group>
      ))}
      {/* engine glow */}
      {engine ? (
        <mesh position={[0, -length * 0.03, 0]}>
          <sphereGeometry args={[r * 0.9, 10, 10]} />
          <meshBasicMaterial color="#9fd0ff" toneMapped={false} transparent opacity={0.9} />
        </mesh>
      ) : null}
    </group>
  )
}

// Stylized booster: shorter, no nose, small grid-fin hints near the top.
export function Booster({ length = 0.34 }: { length?: number }) {
  const r = length * 0.075
  return (
    <group>
      <mesh position={[0, length / 2, 0]}>
        <cylinderGeometry args={[r, r, length, 14]} />
        <meshStandardMaterial color="#b9bfc9" metalness={0.85} roughness={0.4} />
      </mesh>
      {[0, Math.PI / 2].map((a) => (
        <group key={`gf-${a}`} rotation={[0, a, 0]}>
          <mesh position={[r * 1.15, length * 0.93, 0]}>
            <boxGeometry args={[r * 0.9, length * 0.05, r * 0.5]} />
            <meshStandardMaterial color="#8e95a1" metalness={0.7} roughness={0.5} />
          </mesh>
          <mesh position={[-r * 1.15, length * 0.93, 0]}>
            <boxGeometry args={[r * 0.9, length * 0.05, r * 0.5]} />
            <meshStandardMaterial color="#8e95a1" metalness={0.7} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// Pulsing landing/ascent flame, pointing down from y=0.
export function Flame({ size = 0.1, intensity = 1 }: { size?: number; intensity?: number }) {
  return (
    <mesh position={[0, -size / 2, 0]} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[size * 0.32, size, 10]} />
      <meshBasicMaterial color="#ffb36b" toneMapped={false} transparent opacity={0.85 * intensity} />
    </mesh>
  )
}
