/** @jsxImportSource react */
import { useMemo } from 'react'
import { BackSide, ShaderMaterial, AdditiveBlending, Color, Vector3 } from 'three'

// Physically-motivated atmosphere on a concentric shell around ANY center.
// For each pixel we find how close its camera ray passes to the planet centre:
// rays grazing the limb glow brightest and fade exponentially outward; rays
// hitting the planet get no glow, so the disc stays clean and the halo hugs
// the real 3D limb. Self-contained: no bloom, nothing to flicker.
const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const FRAG = /* glsl */ `
  varying vec3 vWorld;
  uniform vec3 uColor;
  uniform vec3 uCenter;
  uniform float uPlanet;
  uniform float uFalloff;
  uniform float uStrength;
  void main() {
    vec3 co = cameraPosition - uCenter;
    vec3 rd = normalize(vWorld - cameraPosition);
    float tca = dot(-co, rd);
    float closest = sqrt(max(dot(co, co) - tca * tca, 0.0));
    float h = closest - uPlanet;                          // ray height above the limb
    float glow = exp(-max(h, 0.0) * uFalloff);            // fade outward into space
    glow *= smoothstep(uPlanet, uPlanet + 0.02, closest); // 0 over the disc
    gl_FragColor = vec4(uColor, clamp(glow, 0.0, 1.0) * uStrength);
  }
`

interface AtmosphereProps {
  planetRadius?: number
  center?: [number, number, number]
  color?: string
  strength?: number
  falloff?: number
}

export function Atmosphere({
  planetRadius = 1,
  center = [0, 0, 0],
  color = '#8ec5ff',
  strength = 0.4,
  falloff = 7.5,
}: AtmosphereProps) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(color) },
          uCenter: { value: new Vector3(...center) },
          uPlanet: { value: planetRadius },
          uFalloff: { value: falloff },
          uStrength: { value: strength },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        blending: AdditiveBlending,
        side: BackSide,
        depthWrite: false,
        // Depth-tested so anything passing in FRONT of the halo (the Moon, a
        // ship) occludes it instead of getting a ghostly additive wash.
        depthTest: true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planetRadius, color, strength, falloff, center[0], center[1], center[2]],
  )

  return (
    <mesh position={center}>
      <sphereGeometry args={[planetRadius * 1.6, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}
