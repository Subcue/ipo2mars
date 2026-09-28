/** @jsxImportSource react */
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { ACESFilmicToneMapping, Vector3 } from 'three'
import { Atmosphere, MARS_AIR } from '../scene/Atmosphere'
import { EarthBody } from './planets/EarthBody'
import { Refuel } from './orbit/Refuel'
import { MarsBody } from './planets/MarsBody'
import { MoonBody } from './planets/MoonBody'
import { TransitShip } from './ships/TransitShip'
import { TransitRoute } from './ships/TransitRoute'
import { FleetStream, FleetWingmen } from './ships/Fleet'
import { LaunchStreak } from './ships/LaunchStreak'
import { OverviewLabels } from './ui/Labels'
import { anchors, MARS_POS, MARS_RADIUS, STARBASE_POS, view } from './stage'
import { DESTINATIONS, isDestKey, type DestKey } from './flight'
import { FlightDirector } from './FlightDirector'
import { Sky } from './render/Sky'
import { SunGlare } from './render/SunGlare'
import { SunLight, type ShadowFocus } from './render/SunLight'
import { QUALITY } from './quality'
import { Dock } from './ui/Dock'
import { InfoCard } from './ui/InfoCard'
import { Loader } from './ui/Loader'
import { TourCaption, useTour } from './ui/Tour'

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
// Earth's air at real scale heights, for views from low orbit.
const EARTH_NEAR_AIR = { top: 1.008, hR: 0.00133, hM: 0.00042 }
// east at Starbase (world -X; see stage.ts EARTH_QUAT)
const EAST = new Vector3(-1, 0, 0)
const DOCK_KEYS: DestKey[] = ['overview', 'earth', 'starbase', 'refuel', 'moon', 'mars', 'ship']

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
  const tour = useTour(setFocus)
  // any pick by the visitor (dock, map label, a click on a body) ends the tour
  const pick = (k: DestKey) => {
    tour.stop()
    setFocus(k)
  }
  // Heavy surface assets load when a stop is first visited (and, on
  // desktop, in the background once the stage is up), never all at startup.
  const [wanted, setWanted] = useState<Partial<Record<DestKey, true>>>(() => ({ [focus]: true }))
  useEffect(() => setWanted((w) => (w[focus] ? w : { ...w, [focus]: true })), [focus])
  useEffect(() => {
    if (!ready || QUALITY.low) return
    const id = setTimeout(() => setWanted((w) => ({ ...w, starbase: true, refuel: true, moon: true, mars: true })), 5000)
    return () => clearTimeout(id)
  }, [ready])
  useEffect(() => {
    if (tour.playing) setWanted((w) => ({ ...w, starbase: true, refuel: true, moon: true, mars: true }))
  }, [tour.playing])

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
    return d.shadow > 0 ? { center: d.shadowCenter ?? d.target, radius: d.shadow, dynamic: !!d.tracks && focus === 'ship' } : null
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
          <EarthBody onClick={() => pick('earth')} onHover={setHovering} loadSite={!!wanted.starbase} />
          <Refuel load={!!wanted.refuel} />
          <MoonBody onClick={() => pick('moon')} onHover={setHovering} paused={focus === 'moon'} loadBase={!!wanted.moon} />
          <MarsBody onClick={() => pick('mars')} onHover={setHovering} loadBase={!!wanted.mars} />
          {focus === 'overview' ? <TransitRoute /> : null}
          <FleetStream visible={overview} />
          <FleetWingmen />
          <TransitShip onClick={() => pick('ship')} onHover={setHovering} primary beacon={overview ? 1 : 0} />
          <TransitShip phase={0.36} primary={false} beacon={overview ? 0.8 : 0} />
          <TransitShip phase={0.68} primary={false} beacon={overview ? 0.8 : 0} />
          {focus === 'earth' ? <LaunchStreak pad={STARBASE_POS} east={EAST} /> : null}
          <OverviewLabels visible={overview && ready} onSelect={pick} />
          <SceneReady onReady={() => setReady(true)} />
        </Suspense>

        <Atmosphere
          planetRadius={1}
          steps={QUALITY.atmoSteps}
          lightSteps={QUALITY.atmoLightSteps}
          fade={() => anchors.airFade.earth}
          near={EARTH_NEAR_AIR}
          nearBlend={() => anchors.earthNear}
        />
        <Atmosphere
          planetRadius={MARS_RADIUS}
          center={[MARS_POS.x, MARS_POS.y, MARS_POS.z]}
          params={MARS_AIR}
          steps={QUALITY.atmoSteps}
          lightSteps={QUALITY.atmoLightSteps}
          fade={() => anchors.airFade.mars}
        />

        <SunGlare />
        <FlightDirector focus={focus} reduced={reduced} ready={ready} onUserInput={tour.stop} />
      </Canvas>

      <Loader ready={ready} />
      <TourCaption text={tour.caption} playing={tour.playing} step={tour.step} />
      <Dock
        keys={DOCK_KEYS}
        focus={focus}
        onSelect={pick}
        touring={tour.playing}
        onTour={tour.playing ? tour.stop : tour.play}
      />
      <InfoCard focus={focus} />

      <p className="pointer-events-none absolute bottom-6 right-4 z-20 hidden text-right font-mono text-[10px] leading-relaxed text-white/30 sm:block sm:right-6">
        Drag to orbit, scroll to approach.
        <br />
        Stylized vehicles and bases, not official designs.
      </p>
    </>
  )
}
