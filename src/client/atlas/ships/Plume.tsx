/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, PlaneGeometry, ShaderMaterial, type Group, type Sprite } from 'three'
import { NOISE } from '../render/glsl'
import { glowTexture } from '../render/textures'
import { STILL } from '../../scene/debug'

// Engine plume as an axial billboard: a quad along the thrust axis (local -Y)
// that turns about that axis to face the camera, shaded in-shader with a soft
// gaussian cross-section, a hot core, drifting turbulence and (sea level only)
// shock diamonds. No hard silhouette anywhere, and no postprocessing: the
// "bloom" is the throat sprite. Sizes are in the parent's units.
const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uLen;
uniform float uWidth;
varying vec2 vP;
void main() {
  vP = vec2(position.x, position.y);
  vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 axisW = (modelMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz;
  float scale = length(axisW);
  vec3 axis = axisW / scale;
  vec3 toCam = normalize(cameraPosition - origin);
  vec3 side = cross(axis, toCam);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  float y = position.y;
  float w = mix(uWidth * 0.16, uWidth, pow(y, 0.5));
  vec3 wp = origin + axis * (y * uLen * scale) + side * (position.x * w * scale);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uIntensity;
uniform float uDiamonds;
uniform vec3 uCore;
uniform vec3 uOuter;
varying vec2 vP;
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  float y = vP.y;
  float x = abs(vP.x);
  // turbulence only downstream; the flow leaves the bell smooth
  float n = vnoise(vec3(y * 2.2 - uTime * 2.5, vP.x * 1.1, uTime * 0.25));
  float turb = mix(1.0, 0.8 + 0.4 * n, smoothstep(0.08, 0.5, y));
  float body = exp(-x * x * 2.6) * exp(-y * 2.8) * turb;
  float core = exp(-x * x * 20.0) * exp(-y * 9.0);
  float diamonds = uDiamonds * pow(0.5 + 0.5 * cos(y * 34.0), 12.0) * exp(-x * x * 46.0) * exp(-y * 2.6);
  float fade = (1.0 - smoothstep(0.65, 1.0, x)) * (1.0 - smoothstep(0.7, 1.0, y)) * smoothstep(0.0, 0.04, y);
  vec3 col = (uOuter * body + uCore * (core * 1.8 + diamonds * 1.4)) * uIntensity * fade;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

let plumeGeo: PlaneGeometry | null = null
function geometry() {
  if (!plumeGeo) {
    plumeGeo = new PlaneGeometry(2, 1, 1, 24)
    plumeGeo.translate(0, 0.5, 0) // x in [-1, 1], y in [0, 1]
  }
  return plumeGeo
}

/** Values a caller can change every frame without rebuilding the plume. */
export interface PlumeLive {
  length: number
  width: number
  intensity: number
  halo: number
}

interface PlumeProps {
  length: number
  width: number
  intensity?: number
  core?: string
  outer?: string
  /** 0 in vacuum, ~1 for a sea-level flame. */
  diamonds?: number
  /** Throat glow sprite size (0 = none). */
  halo?: number
  /** Live overrides, read every frame (throttle, a flame growing with
   *  altitude); the props then only set the colours. */
  live?: PlumeLive
  /** Render order (a flame drawn after exhaust clouds glows through them). */
  order?: number
}

export function Plume({
  length,
  width,
  intensity = 1,
  core = '#dfe9ff',
  outer = '#5b7dff',
  diamonds = 0,
  halo = 0,
  live,
  order = 5,
}: PlumeProps) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uLen: { value: length },
          uWidth: { value: width },
          uTime: { value: 0 },
          uIntensity: { value: intensity },
          uDiamonds: { value: diamonds },
          uCore: { value: new Color(core) },
          uOuter: { value: new Color(outer) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [length, width, core, outer, diamonds, intensity],
  )
  const tex = useMemo(() => glowTexture(), [])
  const root = useRef<Group>(null)
  const sprite = useRef<Sprite>(null)

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = STILL ? 0 : clock.elapsedTime
    if (!live) return
    mat.uniforms.uLen.value = live.length
    mat.uniforms.uWidth.value = live.width
    mat.uniforms.uIntensity.value = live.intensity
    if (root.current) root.current.visible = live.intensity > 0.002
    if (sprite.current) {
      sprite.current.scale.set(live.halo, live.halo, 1)
      sprite.current.material.opacity = Math.min(1, live.intensity)
    }
  })

  if (intensity <= 0 && !live) return null
  return (
    <group ref={root}>
      <mesh geometry={geometry()} material={mat} frustumCulled={false} renderOrder={order} />
      {halo > 0 || live ? (
        <sprite ref={sprite} scale={[halo, halo, 1]} renderOrder={order + 1}>
          <spriteMaterial
            map={tex}
            color={core}
            blending={AdditiveBlending}
            depthWrite={false}
            transparent
            opacity={Math.min(1, intensity)}
            toneMapped={false}
          />
        </sprite>
      ) : null}
    </group>
  )
}
