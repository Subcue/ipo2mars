/** @jsxImportSource react */
import { useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader, SRGBColorSpace, type Mesh } from 'three'
import { MARS_POS, MARS_RADIUS } from './stage'

interface MarsProps {
  onClick?: () => void
  onHover?: (hovering: boolean) => void
  /** Hold the spin still (e.g. while the camera is framing the base). */
  paused?: boolean
  /** Surface furniture (bases): rendered inside the rotating body. */
  children?: React.ReactNode
}

// Texture: Solar System Scope 2k Mars (CC BY 4.0), credited in the README.
export function Mars({ onClick, onHover, paused = false, children }: MarsProps) {
  const tex = useLoader(TextureLoader, '/textures/mars.jpg')
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const body = useRef<Mesh>(null)

  useFrame((_, dt) => {
    if (body.current && !paused) body.current.rotation.y += dt * 0.0025
  })

  return (
    <mesh
      ref={body}
      position={MARS_POS}
      rotation={[0.44, 0, 0]}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
      onPointerOver={onHover ? (e) => { e.stopPropagation(); onHover(true) } : undefined}
      onPointerOut={onHover ? () => onHover(false) : undefined}
    >
      <sphereGeometry args={[MARS_RADIUS, 64, 64]} />
      <meshStandardMaterial map={tex} metalness={0} roughness={1} />
      {children}
    </mesh>
  )
}
