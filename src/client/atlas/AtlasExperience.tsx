/** @jsxImportSource react */
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'
import { Earth } from '../scene/Earth'
import { Starlink } from '../scene/Starlink'
import { Atmosphere, MARS_AIR } from '../scene/Atmosphere'
import { MarsBody } from './planets/MarsBody'
import { MoonBody } from './planets/MoonBody'
import { TransitShip } from './ships/TransitShip'
import { TransitRoute } from './ships/TransitRoute'
import { LaunchStreak } from './ships/LaunchStreak'
import { OverviewLabels } from './ui/Labels'
import { MARS_POS, MARS_RADIUS, view } from './stage'
import { DESTINATIONS, EARTH_VIEW, isDestKey, type DestKey } from './flight'
import { FlightDirector } from './FlightDirector'
import { Sky } from './render/Sky'
import { SunLight, type ShadowFocus } from './render/SunLight'
import { QUALITY } from './quality'
import { Dock } from './ui/Dock'
import { InfoCard } from './ui/InfoCard'
import { Loader } from './ui/Loader'

const AXIAL_TILT = 0.41

/** Keeps stage `view.aspect` in sync for the aspect-aware framing. */
function ViewShape() {
  const size = useThree((s) => s.size)
  view.aspect = size.width / Math.max(1, size.height)
  return null
}

/** Mounts only once the main Suspense boundary has resolved. */
function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady()
  }, [onReady])
  return null
}
const DOCK_KEYS: DestKey[] = ['overview', 'earth', 'moon', 'mars', 'ship']

export function AtlasExperience() {
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [focus, setFocus] = useState<DestKey>(() => {
    const f = new URLSearchParams(location.search).get('focus')
    return isDestKey(f) ? f : 'overview'
  })
  const [hovering, setHovering] = useState(false)
  const [ready, setReady] = useState(false)
  // Adaptive resolution: step the pixel ratio down on GPUs that can't hold
  // ~50 fps (the surface views are the heavy ones), back up when they can.
  const [dpr, setDpr] = useState(() => Math.min(QUALITY.dpr[1], window.devicePixelRatio || 1))
  const overview = focus === 'overview'

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

  const shadowFocus = useMemo<ShadowFocus | null>(() => {
    const d = DESTINATIONS[focus]
    return d.shadow > 0 ? { center: d.target, radius: d.shadow, dynamic: !!d.tracks && focus === 'ship' } : null
  }, [focus])

  return (
    <>
      <Canvas
        camera={{ position: [-9.5, 5.2, 10.5], fov: 40, near: 1e-5, far: 20000 }}
        dpr={dpr}
        shadows="soft"
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          logarithmicDepthBuffer: true,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.0
        }}
      >
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => setDpr((d) => Math.max(1, +(d - 0.25).toFixed(2)))}
          onIncline={() => setDpr((d) => Math.min(QUALITY.dpr[1], window.devicePixelRatio || 1, +(d + 0.25).toFixed(2)))}
          onFallback={() => setDpr(1)}
        />
        <color attach="background" args={['#020306']} />
        <ViewShape />
        <ambientLight intensity={0.02} />
        <SunLight focus={shadowFocus} />
        <Sky />

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
          <MoonBody onClick={() => setFocus('moon')} onHover={setHovering} paused={focus === 'moon'} />
          <MarsBody onClick={() => setFocus('mars')} onHover={setHovering} />
          {focus === 'overview' ? <TransitRoute /> : null}
          <TransitShip onClick={() => setFocus('ship')} onHover={setHovering} primary beacon={overview ? 1 : 0} />
          <TransitShip phase={0.36} primary={false} beacon={overview ? 0.8 : 0} />
          <TransitShip phase={0.68} primary={false} beacon={overview ? 0.8 : 0} />
          {focus === 'earth' ? <LaunchStreak viewDir={EARTH_VIEW} /> : null}
          <OverviewLabels visible={overview && ready} onSelect={setFocus} />
          <SceneReady onReady={() => setReady(true)} />
        </Suspense>

        <Atmosphere planetRadius={1} steps={QUALITY.atmoSteps} lightSteps={QUALITY.atmoLightSteps} />
        <Atmosphere
          planetRadius={MARS_RADIUS}
          center={[MARS_POS.x, MARS_POS.y, MARS_POS.z]}
          params={MARS_AIR}
          steps={QUALITY.atmoSteps}
          lightSteps={QUALITY.atmoLightSteps}
        />

        <FlightDirector focus={focus} reduced={reduced} ready={ready} />
      </Canvas>

      <Loader ready={ready} />
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
