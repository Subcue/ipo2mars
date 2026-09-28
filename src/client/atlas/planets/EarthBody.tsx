/** @jsxImportSource react */
import { useMemo, useRef, useState } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import {
  Color,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { Starlink } from '../../scene/Starlink'
import { SUN_DIR } from '../../scene/sunlight'
import { STILL } from '../../scene/debug'
import { anchors, EARTH_POS, EARTH_QUAT, SITE_SCALE, STARBASE_DIR_OBJ, STARBASE_POS } from '../stage'
import { EARTH_SKY, GroundSky, groundFade } from '../render/GroundSky'
import { SITE_EXTENT } from '../starbase/geo'
import { SURFACE_GLSL } from './surfaceGlsl'
import { QUALITY } from '../quality'
import { Starbase } from '../starbase/Starbase'

// The atlas Earth. Same physically based look as the home page globe (glossy
// oceans with a sun glint, relief, city lights past the terminator dimmed by
// cloud, soft cloud shadows), but it does not spin: it is turned so Starbase
// sits at the top of the globe (stage.ts), where the launch site is a surface
// base with world +Y as its up. The globe cuts a hole under the site's terrain
// patch while the camera is near it; the cloud shell and the Starlink shell
// fade out as the camera drops toward the ground.
const PATCH_COS = Math.cos((SITE_EXTENT * SITE_SCALE) * 0.975)

// Close-range detail (low orbit): the 2k maps are ~20 km a texel, a blur
// from 450 km up. Fractal detail on the sphere (analytic gradients, each
// octave faded out as its cells shrink under a few pixels) sharpens cloud
// edges into cells and streets, gives cloud tops sunlit and shaded sides, and
// adds texture and relief to the land. Weighted by uDetailK (camera nearness).
const DETAIL_GLSL = /* glsl */ `
${SURFACE_GLSL}
vec4 detailFbm(vec3 p, float fw, float f0, int octaves, float seed) {
  vec4 acc = vec4(0.0);
  float amp = 0.5;
  float f = f0;
  for (int i = 0; i < 7; i++) {
    if (i >= octaves) break;
    float vis = clamp(1.0 / (f * fw * 3.0) - 0.4, 0.0, 1.0);
    if (vis <= 0.0) break;
    vec4 n = vnoiseD(p * f + seed + float(i) * 13.1);
    acc.x += (n.x - 0.5) * amp * vis;
    acc.yzw += n.yzw * f * amp * vis;
    f *= 2.17;
    amp *= 0.52;
  }
  return acc;
}
`
const OCTAVES = QUALITY.low ? 4 : 6
/** The camera must be this close (stage units) for the site to be drawn. */
const SITE_NEAR = 0.15

export function EarthBody({
  onClick,
  onHover,
  loadSite = true,
}: {
  onClick?: () => void
  onHover?: (h: boolean) => void
  /** Stream the launch site's models (on first visit). */
  loadSite?: boolean
}) {
  const [day, normal, lights, clouds, spec] = useLoader(TextureLoader, [
    '/textures/earth.jpg',
    '/textures/earth-normal.jpg',
    '/textures/earth-lights.png',
    '/textures/earth-clouds.png',
    '/textures/earth-specular.jpg',
  ])
  day.colorSpace = SRGBColorSpace
  lights.colorSpace = SRGBColorSpace
  for (const t of [day, normal, lights, clouds, spec]) t.anisotropy = 8

  const cloudRef = useRef<Mesh>(null)
  const starlink = useRef<Group>(null)
  const site = useRef(false)
  const [siteOn, setSiteOn] = useState(false)
  const u = useMemo(
    () => ({
      uSunDirView: { value: new Vector3(0, 0, 1) },
      uClouds: { value: clouds },
      uSpec: { value: spec },
      uCloudShift: { value: 0 },
      uPatchDir: { value: STARBASE_DIR_OBJ.clone() },
      uPatchCos: { value: 2 },
      uDetailK: { value: 0 },
    }),
    [clouds, spec],
  )

  const onBeforeCompile = useMemo(
    () => (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vObjDir;\nvarying vec3 vO2V0;\nvarying vec3 vO2V1;\nvarying vec3 vO2V2;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vObjDir = position;
vO2V0 = normalMatrix * vec3(1.0, 0.0, 0.0);
vO2V1 = normalMatrix * vec3(0.0, 1.0, 0.0);
vO2V2 = normalMatrix * vec3(0.0, 0.0, 1.0);`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform vec3 uSunDirView;
uniform sampler2D uClouds;
uniform sampler2D uSpec;
uniform float uCloudShift;
uniform vec3 uPatchDir;
uniform float uPatchCos;
uniform float uDetailK;
varying vec3 vObjDir;
varying vec3 vO2V0;
varying vec3 vO2V1;
varying vec3 vO2V2;
${DETAIL_GLSL}
void main() {
  // the hole under the Starbase terrain patch
  if (dot(normalize(vObjDir), uPatchDir) > uPatchCos) discard;
  vec3 eDir = normalize(vObjDir);
  vec4 eDet = vec4(0.0);
  if (uDetailK > 0.0) eDet = detailFbm(eDir, length(fwidth(eDir)), 140.0, ${OCTAVES}, 7.0) * uDetailK;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          float ocean = texture2D(uSpec, vMapUv).g;
          float cloudCover = texture2D(uClouds, vMapUv + vec2(uCloudShift, 0.0)).a;
          roughnessFactor = mix(0.93, 0.36, ocean) + eDet.x * 0.25 * ocean;
          diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.06, 1.04, 0.98), diffuseColor.rgb * vec3(0.72, 0.86, 1.0), ocean);
          diffuseColor.rgb *= 1.0 + eDet.x * 0.9 * (1.0 - ocean);
          diffuseColor.rgb *= 1.0 - cloudCover * 0.32;`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          if (uDetailK > 0.0) {
            vec3 G = mat3(vO2V0, vO2V1, vO2V2) * (eDet.yzw - eDir * dot(eDet.yzw, eDir));
            normal = normalize(normal - G * 0.004 * (1.0 - ocean));
          }`,
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
    },
    [u],
  )

  // cloud shell: fractal edges and lit, lumpy tops up close
  const onCloudCompile = useMemo(
    () => (shader: WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uDetailK = u.uDetailK
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vCObj;\nvarying vec3 vC2V0;\nvarying vec3 vC2V1;\nvarying vec3 vC2V2;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vCObj = position;
vC2V0 = normalMatrix * vec3(1.0, 0.0, 0.0);
vC2V1 = normalMatrix * vec3(0.0, 1.0, 0.0);
vC2V2 = normalMatrix * vec3(0.0, 0.0, 1.0);`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform float uDetailK;
varying vec3 vCObj;
varying vec3 vC2V0;
varying vec3 vC2V1;
varying vec3 vC2V2;
${DETAIL_GLSL}
void main() {
  vec3 cDir = normalize(vCObj);
  vec4 cDet = detailFbm(cDir, length(fwidth(cDir)), 110.0, ${OCTAVES}, 31.0) * mix(0.3, 1.0, uDetailK);`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  {
    // coverage from the map, sharpened and broken into cells by the detail
    float c = diffuseColor.a / max(opacity, 1e-3);
    float edge = clamp(c * (1.0 - c) * 4.0, 0.0, 1.0);
    float cov = clamp(c + cDet.x * (1.2 * edge + 0.3), 0.0, 1.0);
    cov = smoothstep(0.2, 0.6, cov);
    diffuseColor.a = mix(c, cov, clamp(uDetailK * 1.5 + 0.35, 0.0, 1.0)) * opacity;
  }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
  {
    vec3 G = mat3(vC2V0, vC2V1, vC2V2) * (cDet.yzw - cDir * dot(cDet.yzw, cDir));
    normal = normalize(normal - G * 0.006 * uDetailK);
  }`,
        )
    },
    [u],
  )

  const tmp = useMemo(() => new Vector3(), [])
  useFrame(({ camera }, dt) => {
    if (cloudRef.current && !STILL) cloudRef.current.rotation.y += dt * 0.004
    if (cloudRef.current) u.uCloudShift.value = -cloudRef.current.rotation.y / (Math.PI * 2)
    u.uSunDirView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse)
    const alt = camera.position.length() - 1
    // clouds and the Starlink shell give way to the local sky near the ground
    const cm = cloudRef.current?.material as MeshStandardMaterial | undefined
    if (cm) {
      cm.opacity = 0.92 * smoothstep(0.012, 0.05, alt)
      cloudRef.current!.visible = cm.opacity > 0.01
    }
    if (starlink.current) starlink.current.visible = alt > 0.14
    anchors.earthNear = 1 - smoothstep(0.1, 0.7, alt)
    u.uDetailK.value = 1 - smoothstep(0.15, 1.3, alt)
    const near = camera.position.distanceTo(tmp.copy(STARBASE_POS)) < SITE_NEAR
    u.uPatchCos.value = near ? PATCH_COS : 2
    if (near !== site.current) {
      site.current = near
      setSiteOn(near)
    }
  }, -3)

  return (
    <group>
      <group quaternion={EARTH_QUAT}>
        <mesh
          onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
          onPointerOver={onHover ? (e) => { e.stopPropagation(); onHover(true) } : undefined}
          onPointerOut={onHover ? () => onHover(false) : undefined}
        >
          <sphereGeometry args={[1, 160, 120]} />
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
        <mesh ref={cloudRef} scale={1.012}>
          <sphereGeometry args={[1, 128, 96]} />
          <meshStandardMaterial
            map={clouds}
            color="#f2f4f7"
            transparent
            opacity={0.92}
            depthWrite={false}
            roughness={0.9}
            metalness={0}
            onBeforeCompile={onCloudCompile}
          />
        </mesh>
        <group ref={starlink}>
          <Starlink count={3000} radius={1} />
        </group>
      </group>
      <Starbase visible={siteOn} load={loadSite} />
      <GroundSky params={EARTH_SKY} fade={(cam) => groundFade(EARTH_POS, 1, cam.position, 0.004, 0.03, 'earth')} />
    </group>
  )
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
