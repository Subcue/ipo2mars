/** @jsxImportSource react */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { Earth } from './Earth'
import { Starlink } from './Starlink'
import { Atmosphere } from './Atmosphere'
import { STILL } from './debug'

// Earth's axial tilt (~23.5°) applied to the shared frame so the globe and the
// orbital planes lean together.
const AXIAL_TILT = 0.41

export function Experience() {
  return (
    <Canvas
      camera={{ position: [0, 0.35, 4.0], fov: 38, near: 1, far: 600 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#05060a']} />
      <ambientLight intensity={0.42} />
      <directionalLight position={[5, 2.5, 3]} intensity={1.8} color="#fff6e8" />

      <Suspense fallback={null}>
        <group rotation={[AXIAL_TILT, 0, 0]}>
          <Earth radius={1} />
          <Starlink count={3000} radius={1} />
        </group>
      </Suspense>

      {/* Soft atmospheric halo — camera-facing, fades into space on its own. */}
      <Atmosphere planetRadius={1} />

      <Stars radius={200} depth={60} count={4000} factor={5} saturation={0} fade speed={0} />

      <OrbitControls autoRotate={!STILL} autoRotateSpeed={0.32} enableZoom={false} enablePan={false} />
    </Canvas>
  )
}
