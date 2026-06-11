/** @jsxImportSource react */
import { useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader, SRGBColorSpace, type Mesh } from 'three'
import { STILL } from './debug'

export function Earth({ radius = 1 }: { radius?: number }) {
  const [day, clouds] = useLoader(TextureLoader, [
    '/textures/earth.jpg',
    '/textures/earth-clouds.png',
  ])
  day.colorSpace = SRGBColorSpace
  // Anisotropic filtering removes grazing-angle texture shimmer on rotation.
  for (const t of [day, clouds]) t.anisotropy = 8

  const earthRef = useRef<Mesh>(null)
  const cloudRef = useRef<Mesh>(null)

  // Earth spins beneath the (inertial) constellation; clouds drift a touch faster.
  useFrame((_, dt) => {
    if (STILL) return
    if (earthRef.current) earthRef.current.rotation.y += dt * 0.012
    if (cloudRef.current) cloudRef.current.rotation.y += dt * 0.016
  })

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[radius, 96, 96]} />
        <meshStandardMaterial map={day} metalness={0} roughness={1} />
      </mesh>
      {/* Cloud shell a clear 2% above the surface (no z-fight with the ground). */}
      <mesh ref={cloudRef} scale={radius * 1.02}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial map={clouds} transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  )
}
