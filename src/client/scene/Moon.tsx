/** @jsxImportSource react */
import { useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader, SRGBColorSpace, Vector3, type Group, type Mesh } from 'three'
import { STILL } from './debug'

// A stylized Moon in a slow, slightly inclined orbit. Distances/sizes are
// artistic (the real Moon sits 60 Earth-radii out); plain opaque material —
// nothing here can flicker. Tidally locked: the same face keeps pointing home.
// The orbit stays FAR outside the camera radius (~4): a close pass would let
// the near plane slice the sphere open (seen once as a "transparent" moon).
interface MoonProps {
  orbitRadius?: number
  radius?: number
  /** Atlas hook: receives the Moon's world position every frame (camera chase). */
  onTick?: (worldPos: Vector3) => void
  onClick?: () => void
  onHover?: (hovering: boolean) => void
  /** Surface furniture (bases): rendered inside the rotating body. */
  children?: React.ReactNode
}

export function Moon({ orbitRadius = 9, radius = 0.5, onTick, onClick, onHover, children }: MoonProps) {
  const pivot = useRef<Group>(null)
  const body = useRef<Mesh>(null)
  const world = useRef(new Vector3())
  const tex = useLoader(TextureLoader, '/textures/moon.jpg')
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8

  useFrame((_, dt) => {
    if (!pivot.current) return
    if (!STILL) {
      pivot.current.rotation.y += dt * 0.02 // slow orbit (~5 min per revolution)
      if (body.current) body.current.rotation.y += dt * 0.02 // tidal lock
    }
    if (onTick && body.current) onTick(body.current.getWorldPosition(world.current))
  })

  return (
    // x = small orbital inclination; initial y sets the starting phase so the
    // Moon begins off to the side rather than dead-center behind the Earth.
    <group ref={pivot} rotation={[0.09, 2.2, 0]}>
      <mesh
        ref={body}
        position={[orbitRadius, 0.4, 0]}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
        onPointerOver={onHover ? (e) => { e.stopPropagation(); onHover(true) } : undefined}
        onPointerOut={onHover ? () => onHover(false) : undefined}
      >
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial map={tex} metalness={0} roughness={1} />
        {children}
      </mesh>
    </group>
  )
}
