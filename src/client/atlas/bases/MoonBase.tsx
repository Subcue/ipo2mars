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
import { anchors, BASE_SCALE, MOON_RADIUS } from '../stage'
import { MoonLanding } from './MoonLanding'
import { MassDriver } from './MassDriver'
import { HorizonRidge } from '../terrain/HorizonRidge'
import { Color } from 'three'

const NO_HAZE = { color: new Color(0, 0, 0), k: 0 }

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
  strips: L.strips.map(([x0, z0, x1, z1, w]) => ({ x0, z0, x1, z1, w })),
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
  load = true,
}: {
  /** Stream the settlement's models (on first visit). */
  load?: boolean
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
        {load ? (
        <Suspense fallback={null}>
          <Structures kind="moon" />
          {landers.map((s, i) => (
            <group key={i} position={[s.x, 0, s.z]} rotation-y={s.rot * DEG}>
              <LunarLander />
            </group>
          ))}
          <MoonLanding pad={L.landing as [number, number]} />
          <MassDriver rail={L.massDriver as [number, number, number, number]} />
          <HorizonRidge
            planetR={MOON_RADIUS / BASE_SCALE}
            radius={4300}
            minH={120}
            maxH={620}
            seed={9.7}
            color="#8a8782"
            haze={() => NO_HAZE}
            center={() => anchors.moonBase}
            hideBeyond={0.25}
            relief={0.18}
            rough={0.45}
          />
        </Suspense>
        ) : null}
      </group>
    </group>
  )
}
