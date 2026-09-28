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
import { useEnv } from '../render/useModel'
import { BASE_SCALE, MARS_RADIUS } from '../stage'

const L = layout.mars
const DEG = Math.PI / 180
const TRACKS = L.tracks

export const MARS_TERRAIN: TerrainSpec = {
  kind: 'mars',
  extent: L.extent,
  flats: L.flats.map(([x, z, r]) => ({ x, z, r })),
  craters: [
    ...L.craters.map(([x, z, r]) => ({ x, z, r, depth: 0.8 })),
    ...scatterCraters(7, 70, L.extent * 0.55, 45, 220),
  ],
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
}: {
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
        <Suspense fallback={null}>
          <Structures kind="mars" />
          {ships.map((s, i) => (
            <group key={i} position={[s.x, 0, s.z]} rotation-y={s.rot * DEG}>
              <LandedStarship />
            </group>
          ))}
        </Suspense>
      </group>
    </group>
  )
}
