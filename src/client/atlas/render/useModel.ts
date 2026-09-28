import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { Group, Vector3 } from 'three'
import { applyMaterials, type ModelContext } from './materials'
import { makeEnv, type EnvKind } from './env'

/** Shared procedural IBL for one setting (see env.ts). */
export function useEnv(kind: EnvKind, earthDir?: Vector3) {
  const gl = useThree((s) => s.gl)
  return useMemo(() => makeEnv(gl, kind, earthDir), [gl, kind, earthDir])
}

// Clone a GLB scene (instances must not share transforms) and give it the
// tuned materials for its setting. Draco/meshopt decoders are explicitly OFF:
// the GLBs are uncompressed, and the decoders' WASM would violate the CSP.
export function useModel(path: string, ctx: ModelContext): Group {
  const { scene } = useGLTF(path, false, false)
  return useMemo(() => {
    const clone = scene.clone(true)
    applyMaterials(clone, ctx)
    return clone
  }, [scene, ctx])
}

export const MODELS = {
  starship: '/models/starship.glb',
  lander: '/models/starship_lander.glb',
  hls: '/models/hls.glb',
  marsbase: '/models/marsbase.glb',
  moonbase: '/models/moonbase.glb',
} as const

// The transit Starship is on screen from the first frame; the surface assets
// stream in behind it (their bases mount hidden and suspend on their own).
useGLTF.preload(MODELS.starship, false, false)
