/** @jsxImportSource react */
import { Suspense, useMemo } from 'react'
import type { Matrix4, Texture } from 'three'
import layout from './layout.json'
import { TerrainPatch } from '../terrain/TerrainPatch'
import { Rocks } from '../terrain/Rocks'
import { scatterCraters, type TerrainSpec } from '../terrain/heightfield'
import { MARS_LOOK } from '../planets/surfaceGlsl'
import type { PlanetUniforms } from '../planets/planetMaterial'
import { LandedStarship } from '../ships/Starship'
import { Structures } from './Structures'
import { MarsLanding } from './MarsLanding'
import { useEnv } from '../render/useModel'
import { anchors, BASE_SCALE, MARS_RADIUS } from '../stage'
import { HorizonRidge } from '../terrain/HorizonRidge'
import { MARS_HAZE } from '../planets/MarsBody'

const L = layout.mars
const DEG = Math.PI / 180
const TRACKS = L.tracks

export const MARS_TERRAIN: TerrainSpec = {
  kind: 'mars',
  extent: L.extent,
  flats: L.flats.map(([x, z, r]) => ({ x, z, r })),
  craters: [
    ...L.craters.map(([x, z, r]) => ({ x, z, r, depth: 0.6 })),
    ...scatterCraters(7, 26, L.extent * 0.55, 45, 200).map((c) => ({ ...c, depth: c.depth * 0.55 })),
  ],
  pits: L.pits.map(([x, z, r, depth]) => ({ x, z, r, depth })),
  seed: 3,
  curve: BASE_SCALE / (2 * MARS_RADIUS),
}

// The Mars settlement on its terrain patch. Everything inside the BASE_SCALE
// group is in metres (Blender units); the patch and rocks are built directly
// in stage units.
export function MarsBase({
  map,
  baseToPlanet,
  onPatchUniforms,
  load = true,
}: {
  /** Stream the settlement's models (on first visit). */
  load?: boolean
  map: Texture
  baseToPlanet: Matrix4
  onPatchUniforms?: (u: PlanetUniforms) => void
}) {
  const env = useEnv('mars')
  const ships = useMemo(() => L.ships, [])
  return (
    <group>
      <TerrainPatch
        spec={MARS_TERRAIN}
        radius={MARS_RADIUS}
        map={map}
        look={MARS_LOOK}
        baseToPlanet={baseToPlanet}
        onUniforms={onPatchUniforms}
        tracks={TRACKS}
        env={env}
        envIntensity={0.55}
      />
      <Rocks spec={MARS_TERRAIN} radius={MARS_RADIUS} color="#6e4330" env={env} seed={17} />
      <group scale={BASE_SCALE}>
        {/* Streams in on its own: never holds up the rest of the stage. */}
        {load ? (
        <Suspense fallback={null}>
          <Structures kind="mars" />
          {ships.map((s, i) => (
            <group key={i} position={[s.x, 0, s.z]} rotation-y={s.rot * DEG}>
              <LandedStarship />
            </group>
          ))}
          <HorizonRidge
            planetR={MARS_RADIUS / BASE_SCALE}
            radius={4600}
            minH={180}
            maxH={1050}
            seed={4.2}
            color="#7a4a33"
            haze={() => MARS_HAZE}
            center={() => anchors.marsBase}
            hideBeyond={0.25}
          />
          <MarsLanding pad={L.landing as [number, number]} phase={0} restart />
          <MarsLanding pad={L.launch as [number, number]} phase={27} />
        </Suspense>
        ) : null}
      </group>
    </group>
  )
}
