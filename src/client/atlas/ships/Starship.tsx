/** @jsxImportSource react */
import { useMemo } from 'react'
import { Color } from 'three'
import { MODELS, useEnv, useModel } from '../render/useModel'
import type { ModelContext } from '../render/materials'
import { Plume } from './Plume'

// Blender-built stylized vehicles (original designs, not official models).
// Source of truth: tools/blender/build_assets.py -> public/models/*.glb, all
// in metres with the tail (or footpads) at y=0.
export const SHIP_HEIGHT_M = 52
const TAIL_Y = 0.05

// Vacuum Raptor exits (model metres, three.js axes: Blender (x, y) -> (x, -y)).
const RVAC = [90, 210, 330].map((deg) => {
  const a = (deg * Math.PI) / 180
  return [3.02 * Math.cos(a), TAIL_Y, -3.02 * Math.sin(a)] as const
})

/** Flight Starship. `length` in stage units; `firing` 0..1 drives the
 *  vacuum plumes and the glow inside the bells. */
export function Starship({ length, firing = 0 }: { length: number; firing?: number }) {
  const env = useEnv('space')
  const engineGlow = useMemo(() => ({ value: firing }), [])
  engineGlow.value = firing
  const ctx = useMemo<ModelContext>(() => ({ env, engineGlow, envIntensity: 1 }), [env, engineGlow])
  const model = useModel(MODELS.starship, ctx)
  return (
    <group scale={length / SHIP_HEIGHT_M}>
      <primitive object={model} />
      {firing > 0
        ? RVAC.map((p, i) => (
            <group key={i} position={p as unknown as [number, number, number]}>
              <Plume length={30} width={10} intensity={0.13 * firing} halo={3.2} core="#fbf6ff" outer="#a9a2ff" />
            </group>
          ))
        : null}
    </group>
  )
}

/** Landed Starship for the Mars settlement: legs, crew windows, dusty.
 *  Model metres; the parent group applies BASE_SCALE. */
export function LandedStarship() {
  const env = useEnv('mars')
  const ctx = useMemo<ModelContext>(
    () => ({ env, dust: 0.85, dustColor: new Color('#a4693f'), dustHeight: 7, envIntensity: 1 }),
    [env],
  )
  const model = useModel(MODELS.lander, ctx)
  return <primitive object={model} />
}

/** Lunar lander variant for the Moon base: grey regolith dust. */
export function LunarLander() {
  const env = useEnv('moon')
  const ctx = useMemo<ModelContext>(
    () => ({ env, dust: 0.55, dustColor: new Color('#8d8b88'), dustHeight: 6, envIntensity: 1 }),
    [env],
  )
  const model = useModel(MODELS.hls, ctx)
  return <primitive object={model} />
}
