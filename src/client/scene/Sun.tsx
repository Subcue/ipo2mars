/** @jsxImportSource react */
import { useMemo } from 'react'
import { Billboard } from '@react-three/drei'
import { ShaderMaterial, AdditiveBlending, Color } from 'three'
import { SUN_DIR, SUN_DISTANCE } from './sunlight'

// Visible sun: a camera-facing disc with a hot core and a soft falloff,
// rendered additively in-shader (the no-postprocessing rule stands).
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uCore;
  uniform vec3 uHalo;
  void main() {
    float d = distance(vUv, vec2(0.5)) * 2.0;
    float core = 1.0 - smoothstep(0.0, 0.16, d);
    float halo = pow(max(1.0 - d, 0.0), 3.2);
    vec3 col = uCore * core + uHalo * halo * 0.55;
    gl_FragColor = vec4(col, core + halo * 0.55);
  }
`

export function Sun() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uCore: { value: new Color('#fff7e6') },
          uHalo: { value: new Color('#ffca7a') },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )

  return (
    <Billboard position={SUN_DIR.clone().multiplyScalar(SUN_DISTANCE)}>
      <mesh>
        <planeGeometry args={[26, 26]} />
        <primitive object={mat} attach="material" />
      </mesh>
    </Billboard>
  )
}
