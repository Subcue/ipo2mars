import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { PMREMGenerator, MeshStandardMaterial, type Group, type Texture } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

let envCache: Texture | null = null

// One shared PMREM studio environment for the Blender-built models. Applied
// PER MATERIAL (not scene.environment) so the Earth's night side stays dark
// while steel hulls get real reflections.
export function useStudioEnv(): Texture {
  const gl = useThree((s) => s.gl)
  return useMemo(() => {
    if (!envCache) {
      const pmrem = new PMREMGenerator(gl)
      envCache = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      pmrem.dispose()
    }
    return envCache
  }, [gl])
}

// Clone a GLB scene (so multiple instances don't share transforms) and give
// every standard material the studio environment. Draco/meshopt decoders are
// explicitly OFF: our GLBs are uncompressed, and the decoders' WASM (and
// draco's CDN fetch) would violate the site CSP.
export function useModel(path: string, envIntensity = 1.1): Group {
  const { scene } = useGLTF(path, false, false)
  const env = useStudioEnv()
  return useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((node) => {
      const mesh = node as { material?: MeshStandardMaterial | MeshStandardMaterial[] }
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const m of mats) {
        if (m instanceof MeshStandardMaterial) {
          m.envMap = env
          m.envMapIntensity = envIntensity
        }
      }
    })
    return clone
  }, [scene, env, envIntensity])
}

useGLTF.preload('/models/starship.glb', false, false)
useGLTF.preload('/models/booster.glb', false, false)
useGLTF.preload('/models/moonbase.glb', false, false)
useGLTF.preload('/models/marsbase.glb', false, false)
