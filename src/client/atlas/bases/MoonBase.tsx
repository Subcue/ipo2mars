/** @jsxImportSource react */
import { Suspense, useMemo } from 'react'
import type { Matrix4, Texture } from 'three'
import layout from './layout.json'
import { TerrainPatch } from '../terrain/TerrainPatch'
import { Rocks } from '../terrain/Rocks'
import { scatterCraters, type TerrainSpec } from '../terrain/heightfield'
import { MOON_LOOK } from '../planets/surfaceGlsl'
import type { PlanetUniforms } from '../planets/planetMaterial'
import { LunarLander } from '../ships/Starship'
import { Structures } from './Structures'
import { useEnv } from '../render/useModel'
import { BASE_SCALE, MOON_RADIUS } from '../stage'

const L = layout.moon
const DEG = Math.PI / 180
const TRACKS = L.tracks

export const MOON_TERRAIN: TerrainSpec = {
  kind: 'moon',
  extent: L.extent,
  flats: L.flats.map(([x, z, r]) => ({ x, z, r })),
  craters: [
    ...L.craters.map(([x, z, r]) => ({ x, z, r, depth: 1 })),
    ...scatterCraters(29, 160, L.extent * 0.55, 40, 260),
  ],
  seed: 5,
  curve: BASE_SCALE / (2 * MOON_RADIUS),
}

// The lunar outpost at the Moon's (local) north pole: its up is world +Y, and
// the Earth always hangs just over its -X horizon (the Moon is tidally
// locked; see stage.ts).
export function MoonBase({
  map,
  baseToPlanet,
  onPatchUniforms,
}: {
  map: Texture
  baseToPlanet: Matrix4
  onPatchUniforms?: (u: PlanetUniforms) => void
}) {
  const env = useEnv('moon')
  const landers = useMemo(() => L.hls, [])
  return (
    <group>
      <TerrainPatch
        spec={MOON_TERRAIN}
        radius={MOON_RADIUS}
        map={map}
        look={MOON_LOOK}
        baseToPlanet={baseToPlanet}
        onUniforms={onPatchUniforms}
        tracks={TRACKS}
        env={env}
        envIntensity={0.3}
      />
      <Rocks spec={MOON_TERRAIN} radius={MOON_RADIUS} color="#8a8783" env={env} seed={23} />
      <group scale={BASE_SCALE}>
        {/* Streams in on its own: never holds up the rest of the stage. */}
        <Suspense fallback={null}>
          <Structures kind="moon" />
          {landers.map((s, i) => (
            <group key={i} position={[s.x, 0, s.z]} rotation-y={s.rot * DEG}>
              <LunarLander />
            </group>
          ))}
        </Suspense>
      </group>
    </group>
  )
}
