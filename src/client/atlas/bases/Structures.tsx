/** @jsxImportSource react */
import { useMemo } from 'react'
import { Color } from 'three'
import { MODELS, useEnv, useModel } from '../render/useModel'
import type { ModelContext } from '../render/materials'

// The Blender-built settlement structures (habitats, greenhouses, solar,
// ISRU, power, comms, rovers), one GLB per base in metres. Surface dust
// settles on low and upward-facing faces (see materials.ts).
export function Structures({ kind }: { kind: 'mars' | 'moon' }) {
  const env = useEnv(kind)
  const ctx = useMemo<ModelContext>(
    () =>
      kind === 'mars'
        ? {
            env,
            dust: 0.7,
            dustColor: new Color('#a86c43'),
            dustHeight: 3,
            regolith: new Color('#6b3a24'),
            padTint: new Color('#c9a58e'),
          }
        : {
            env,
            dust: 0.45,
            dustColor: new Color('#8f8d8a'),
            dustHeight: 2.5,
            regolith: new Color('#77746f'),
            padTint: new Color('#cfcfcf'),
          },
    [kind, env],
  )
  const model = useModel(kind === 'mars' ? MODELS.marsbase : MODELS.moonbase, ctx)
  return <primitive object={model} />
}
