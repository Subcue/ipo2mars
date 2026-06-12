/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  TextureLoader,
  SRGBColorSpace,
  Color,
  Vector2,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { STILL } from './debug'
import { SUN_DIR } from './sunlight'

// Earth with a real day/night cycle:
// - normal map for terrain relief under the sun
// - city lights as emissive, masked by a terminator term injected into the
//   standard material (lights fade in only where the sun has set)
// No postprocessing involved; the masking runs inside the material shader.
export function Earth({ radius = 1 }: { radius?: number }) {
  const [day, normal, lights, clouds] = useLoader(TextureLoader, [
    '/textures/earth.jpg',
    '/textures/earth-normal.jpg',
    '/textures/earth-lights.png',
    '/textures/earth-clouds.png',
  ])
  day.colorSpace = SRGBColorSpace
  lights.colorSpace = SRGBColorSpace
  // Anisotropic filtering removes grazing-angle texture shimmer on rotation.
  for (const t of [day, normal, lights, clouds]) t.anisotropy = 8

  const earthRef = useRef<Mesh>(null)
  const cloudRef = useRef<Mesh>(null)
  const shaderRef = useRef<WebGLProgramParametersWithUniforms | null>(null)
  const sunView = useMemo(() => new Vector3(), [])

  // Inject the terminator mask: 1 deep on the night side, 0 in daylight.
  const onBeforeCompile = useMemo(
    () => (shader: WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uSunDirView = { value: new Vector3(0, 0, 1) }
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'uniform vec3 uSunDirView;\nvoid main() {',
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float sunDot = dot(normalize(vNormal), uSunDirView);
            float night = 1.0 - smoothstep(-0.18, 0.07, sunDot);
            totalEmissiveRadiance *= night;
          }`,
        )
      shaderRef.current = shader
    },
    [],
  )

  useFrame(({ camera }, dt) => {
    if (!STILL) {
      if (earthRef.current) earthRef.current.rotation.y += dt * 0.012
      if (cloudRef.current) cloudRef.current.rotation.y += dt * 0.016
    }
    // World-space sun direction -> view space for the terminator term.
    if (shaderRef.current) {
      sunView.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse)
      ;(shaderRef.current.uniforms.uSunDirView.value as Vector3).copy(sunView)
    }
  })

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[radius, 96, 96]} />
        <meshStandardMaterial
          map={day}
          normalMap={normal}
          normalScale={new Vector2(0.85, 0.85)}
          emissiveMap={lights}
          emissive={new Color('#ffd9a0')}
          emissiveIntensity={2.2}
          metalness={0}
          roughness={1}
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
      {/* Cloud shell a clear 2% above the surface (no z-fight with the ground). */}
      <mesh ref={cloudRef} scale={radius * 1.02}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial map={clouds} transparent opacity={0.38} depthWrite={false} />
      </mesh>
    </group>
  )
}

// Re-export the material type guard for tests/debugging convenience.
export type EarthMaterial = MeshStandardMaterial
