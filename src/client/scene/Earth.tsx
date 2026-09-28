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

// Earth with a real day/night cycle, all inside the standard material:
// - oceans are glossy and land is matte (specular map -> roughness), so the
//   sun leaves a glint on the sea
// - terrain relief from the normal map
// - city lights fade in only past the terminator and are dimmed by cloud
// - clouds cast soft shadows on the ground
// The cloud map keeps its coverage in the ALPHA channel (RGB is flat white).
// The atmosphere is a separate scattering shell (Atmosphere.tsx). No
// postprocessing anywhere.
export function Earth({ radius = 1 }: { radius?: number }) {
  const [day, normal, lights, clouds, spec] = useLoader(TextureLoader, [
    '/textures/earth.jpg',
    '/textures/earth-normal.jpg',
    '/textures/earth-lights.png',
    '/textures/earth-clouds.png',
    '/textures/earth-specular.jpg',
  ])
  day.colorSpace = SRGBColorSpace
  lights.colorSpace = SRGBColorSpace
  // Anisotropic filtering removes grazing-angle texture shimmer on rotation.
  for (const t of [day, normal, lights, clouds, spec]) t.anisotropy = 8

  const earthRef = useRef<Mesh>(null)
  const cloudRef = useRef<Mesh>(null)
  const shaderRef = useRef<WebGLProgramParametersWithUniforms | null>(null)
  const sunView = useMemo(() => new Vector3(), [])

  const onBeforeCompile = useMemo(
    () => (shader: WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uSunDirView = { value: new Vector3(0, 0, 1) }
      shader.uniforms.uClouds = { value: clouds }
      shader.uniforms.uSpec = { value: spec }
      shader.uniforms.uCloudShift = { value: 0 }
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform vec3 uSunDirView;
uniform sampler2D uClouds;
uniform sampler2D uSpec;
uniform float uCloudShift;
void main() {`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          float ocean = texture2D(uSpec, vMapUv).g;
          float cloudCover = texture2D(uClouds, vMapUv + vec2(uCloudShift, 0.0)).a;
          roughnessFactor = mix(0.93, 0.36, ocean);
          // deeper, cooler oceans; a touch more life in the land
          diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.06, 1.04, 0.98), diffuseColor.rgb * vec3(0.72, 0.86, 1.0), ocean);
          diffuseColor.rgb *= 1.0 - cloudCover * 0.32;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float sunDot = dot(normalize(vNormal), uSunDirView);
            float night = 1.0 - smoothstep(-0.2, 0.05, sunDot);
            totalEmissiveRadiance *= night * (1.0 - cloudCover * 0.75);
          }`,
        )
      shaderRef.current = shader
    },
    [clouds, spec],
  )

  useFrame(({ camera }, dt) => {
    if (!STILL) {
      if (earthRef.current) earthRef.current.rotation.y += dt * 0.012
      if (cloudRef.current) cloudRef.current.rotation.y += dt * 0.016
    }
    const s = shaderRef.current
    if (s) {
      // World-space sun direction -> view space for the terminator term.
      sunView.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse)
      ;(s.uniforms.uSunDirView.value as Vector3).copy(sunView)
      if (earthRef.current && cloudRef.current) {
        s.uniforms.uCloudShift.value =
          (earthRef.current.rotation.y - cloudRef.current.rotation.y) / (Math.PI * 2)
      }
    }
  })

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[radius, 128, 96]} />
        <meshStandardMaterial
          map={day}
          normalMap={normal}
          normalScale={new Vector2(0.8, 0.8)}
          emissiveMap={lights}
          emissive={new Color('#ffcf8a')}
          emissiveIntensity={2.4}
          metalness={0}
          roughness={1}
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
      {/* Cloud shell just above the surface (coverage = the map's alpha). */}
      <mesh ref={cloudRef} scale={radius * 1.012}>
        <sphereGeometry args={[1, 128, 96]} />
        <meshStandardMaterial
          map={clouds}
          color="#f2f4f7"
          transparent
          opacity={0.92}
          depthWrite={false}
          roughness={0.9}
          metalness={0}
        />
      </mesh>
    </group>
  )
}

// Re-export the material type guard for tests/debugging convenience.
export type EarthMaterial = MeshStandardMaterial
