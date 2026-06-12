/** @jsxImportSource react */
import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { Earth } from './Earth'
import { Starlink } from './Starlink'
import { Moon } from './Moon'
import { Atmosphere } from './Atmosphere'
import { STILL } from './debug'
import { SUN_DIR } from './sunlight'

// Earth's axial tilt (~23.5°) applied to the shared frame so the globe and the
// orbital planes lean together.
const AXIAL_TILT = 0.41

const BASE_DISTANCE = 4.0

// three.js fov is VERTICAL, so portrait screens crop the globe horizontally and
// it overflows phone viewports. Pull the camera back as the aspect narrows so
// the Earth stays comfortably framed on mobile; desktop (aspect > 1.15) is
// untouched. OrbitControls picks the new radius up and keeps auto-rotating.
function ResponsiveFraming() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => {
    const aspect = size.width / size.height
    camera.position.setLength(BASE_DISTANCE * Math.max(1, 1.15 / aspect))
  }, [camera, size])
  return null
}

export function Experience() {
  return (
    <Canvas
      camera={{ position: [0, 0.35, 4.0], fov: 38, near: 1, far: 600 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#05060a']} />
      <ResponsiveFraming />
      {/* One sun: low ambient so the night side is real, city lights carry it. */}
      <ambientLight intensity={0.18} />
      <directionalLight
        position={SUN_DIR.clone().multiplyScalar(50)}
        intensity={2.6}
        color="#fff4e0"
      />

      <Suspense fallback={null}>
        <group rotation={[AXIAL_TILT, 0, 0]}>
          <Earth radius={1} />
          <Starlink count={3000} radius={1} />
        </group>
        <Moon orbitRadius={9} radius={0.5} />
      </Suspense>

      {/* Soft atmospheric halo — camera-facing, fades into space on its own. */}
      <Atmosphere planetRadius={1} />

      <Stars radius={200} depth={60} count={4000} factor={5} saturation={0} fade speed={0} />

      <OrbitControls autoRotate={!STILL} autoRotateSpeed={0.32} enableZoom={false} enablePan={false} />
    </Canvas>
  )
}
