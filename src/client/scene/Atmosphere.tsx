/** @jsxImportSource react */
import { useMemo } from 'react'
import { BackSide, ShaderMaterial, AdditiveBlending, Color } from 'three'

// Physically-motivated atmosphere on a concentric shell. For each pixel we find
// how close its camera ray passes to the planet centre: rays that graze the limb
// glow brightest and fade exponentially outward into space; rays that hit the
// planet (closest < radius) get NO glow — so the disc stays clean and the halo
// aligns perfectly with the real 3D limb (no flat-billboard perspective drift).
// Self-contained — no bloom, nothing to flicker.
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
  uniform float uPlanet;
  uniform float uFalloff;
  uniform float uStrength;
  void main() {
    vec3 rd = normalize(vWorld - cameraPosition);
    float tca = dot(-cameraPosition, rd);
    float closest = sqrt(max(dot(cameraPosition, cameraPosition) - tca * tca, 0.0));
    float h = closest - uPlanet;                       // height of the ray above the limb
    float glow = exp(-max(h, 0.0) * uFalloff);         // fade outward into space
    glow *= smoothstep(uPlanet, uPlanet + 0.02, closest); // 0 over the disc, soft at the limb
    gl_FragColor = vec4(uColor, clamp(glow, 0.0, 1.0) * uStrength);
  }
`

export function Atmosphere({ planetRadius = 1 }: { planetRadius?: number }) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color('#8ec5ff') }, // light blue
          uPlanet: { value: planetRadius },
          uFalloff: { value: 7.5 }, // higher = thinner halo
          uStrength: { value: 0.4 }, // light / transparent
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        blending: AdditiveBlending,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [planetRadius],
  )

  return (
    <mesh>
      <sphereGeometry args={[planetRadius * 1.6, 64, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}
