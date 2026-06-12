/** @jsxImportSource react */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, Stars } from '@react-three/drei'
import { Earth } from '../scene/Earth'
import { Starlink } from '../scene/Starlink'
import { Moon } from '../scene/Moon'
import { Atmosphere } from '../scene/Atmosphere'
import { Sun } from '../scene/Sun'
import { SUN_DIR } from '../scene/sunlight'
import { Mars } from './Mars'
import { MoonBase } from './bases/MoonBase'
import { MarsBase } from './bases/MarsBase'
import { TransitShip } from './ships/TransitShip'
import { LaunchCycle } from './ships/LaunchCycle'
import { anchors, MARS_POS, MARS_RADIUS } from './stage'
import { DESTINATIONS, cameraPosFor, isDestKey, type DestKey } from './flight'
import { Dock } from './ui/Dock'
import { InfoCard } from './ui/InfoCard'

const AXIAL_TILT = 0.41
const DOCK_KEYS: DestKey[] = ['overview', 'earth', 'moon', 'mars', 'ship']

// Drives the camera rig: flies on focus change, chases moving targets, and
// applies per-destination distance clamps.
function FlightDirector({
  focus,
  reduced,
}: {
  focus: DestKey
  reduced: boolean
}) {
  const controls = useRef<CameraControls>(null)
  const last = useRef<DestKey | null>(null)

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const dest = DESTINATIONS[focus]
    const t = dest.target()
    const p = cameraPosFor(dest)
    c.minDistance = dest.minDistance
    c.maxDistance = dest.maxDistance
    // First placement (initial mount or reduced motion): jump. Else: fly.
    const animate = !reduced && last.current !== null
    c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, animate)
    last.current = focus
  }, [focus, reduced])

  useFrame(() => {
    const c = controls.current
    if (!c) return
    const dest = DESTINATIONS[focus]
    if (dest.tracks) {
      const t = dest.target()
      c.moveTo(t.x, t.y, t.z, false)
    }
  })

  return <CameraControls ref={controls} smoothTime={0.9} dollySpeed={0.6} />
}

export function AtlasExperience() {
  const reduced = useMemo(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [focus, setFocus] = useState<DestKey>(() => {
    const f = new URLSearchParams(location.search).get('focus')
    return isDestKey(f) ? f : 'overview'
  })
  const [hovering, setHovering] = useState(false)

  // Shareable: keep ?focus= in sync.
  useEffect(() => {
    const url = new URL(location.href)
    if (focus === 'overview') url.searchParams.delete('focus')
    else url.searchParams.set('focus', focus)
    history.replaceState(null, '', url)
  }, [focus])

  useEffect(() => {
    document.body.style.cursor = hovering ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hovering])

  return (
    <>
      <Canvas
        camera={{ position: [4, 12, 38], fov: 40, near: 0.1, far: 800 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#05060a']} />
        <ambientLight intensity={0.18} />
        {/* Faint cool fill so ship/base dark sides stay readable in space. */}
        <hemisphereLight args={['#2a3c5a', '#0a0c12', 0.14]} />
        <directionalLight
          position={SUN_DIR.clone().multiplyScalar(50)}
          intensity={2.6}
          color="#fff4e0"
        />

        <Suspense fallback={null}>
          <group
            rotation={[AXIAL_TILT, 0, 0]}
            onClick={(e) => {
              e.stopPropagation()
              setFocus('earth')
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHovering(true)
            }}
            onPointerOut={() => setHovering(false)}
          >
            <Earth radius={1} />
            <Starlink count={3000} radius={1} />
          </group>
          <Moon
            orbitRadius={9}
            radius={0.5}
            onTick={(p) => anchors.moon.copy(p)}
            onClick={() => setFocus('moon')}
            onHover={setHovering}
          >
            <MoonBase />
          </Moon>
          <Mars onClick={() => setFocus('mars')} onHover={setHovering}>
            <MarsBase />
          </Mars>
          <TransitShip onClick={() => setFocus('ship')} onHover={setHovering} />
          <LaunchCycle />
        </Suspense>

        <Atmosphere planetRadius={1} />
        <Atmosphere
          planetRadius={MARS_RADIUS}
          center={[MARS_POS.x, MARS_POS.y, MARS_POS.z]}
          color="#ff8a5c"
          strength={0.22}
          falloff={11}
        />
        <Sun />
        <Stars radius={200} depth={60} count={4000} factor={5} saturation={0} fade speed={0} />

        <FlightDirector focus={focus} reduced={reduced} />
      </Canvas>

      <Dock keys={DOCK_KEYS} focus={focus} onSelect={setFocus} />
      <InfoCard focus={focus} />

      <p className="pointer-events-none absolute bottom-6 right-4 z-20 hidden text-right font-mono text-[10px] leading-relaxed text-white/30 sm:block sm:right-6">
        Drag to orbit, scroll to approach.
        <br />
        Stylized vehicles and bases, not official designs.
      </p>
    </>
  )
}
