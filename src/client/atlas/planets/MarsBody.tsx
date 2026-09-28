/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Color, Matrix4, Quaternion, SRGBColorSpace, TextureLoader, Vector3, type Group, type Mesh } from 'three'
import { makePlanetMaterial, type PlanetUniforms } from './planetMaterial'
import { MARS_LOOK } from './surfaceGlsl'
import { MarsBase, MARS_TERRAIN } from '../bases/MarsBase'
import { anchors, BASE_SCALE, MARS_POS, MARS_RADIUS, MARS_TILT } from '../stage'
import { QUALITY } from '../quality'
import { GroundSky, groundFade, MARS_SKY } from '../render/GroundSky'

const R = MARS_RADIUS
// The base sits where the tilted body's surface normal is world +Y, so its
// local up is the camera's up (see stage.ts): object-space direction
// Rx(-tilt) * (0, 1, 0).
const BASE_DIR = new Vector3(0, Math.cos(MARS_TILT), -Math.sin(MARS_TILT))
const BASE_POS = BASE_DIR.clone().multiplyScalar(R)
const BASE_QUAT = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), BASE_DIR)
const BASE_TO_PLANET = new Matrix4().compose(BASE_POS, BASE_QUAT, new Vector3(1, 1, 1))
const PATCH_COS = Math.cos(((MARS_TERRAIN.extent * BASE_SCALE) / R) * 0.975)
// Low-altitude aerial haze (display space), matched to the sky's horizon.
const HAZE = new Color('#c4a283')
const HAZE_K = 7
/** Live aerial haze at the settlement (ridge, structures read it too). */
export const MARS_HAZE = { color: HAZE, k: 0 }

// Texture: Solar System Scope 2k Mars (CC BY 4.0), credited in the README.
// No spin: the settlement's pose is fixed so its sun angle is always the
// late-afternoon light the hero shot is composed for.
export function MarsBody({
  onClick,
  onHover,
  loadBase = true,
}: {
  onClick?: () => void
  onHover?: (hovering: boolean) => void
  loadBase?: boolean
}) {
  const tex = useLoader(TextureLoader, '/textures/mars.jpg')
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const { material, uniforms } = useMemo(
    () => makePlanetMaterial({ map: tex, radius: R, look: MARS_LOOK, octaves: QUALITY.surfaceOctaves }),
    [tex],
  )
  uniforms.uPatchDir.value.copy(BASE_DIR)
  const patchU = useRef<PlanetUniforms | null>(null)
  const base = useRef<Group>(null)
  const sphere = useRef<Mesh>(null)
  const tmp = useMemo(() => new Vector3(), [])

  useFrame(({ camera }) => {
    const b = base.current
    if (!b) return
    b.getWorldPosition(anchors.marsBase)
    anchors.ready.mars = true
    // Only pay for the patch/base when the camera is anywhere near it.
    const dBase = camera.position.distanceTo(anchors.marsBase)
    const near = dBase < 2.2
    b.visible = near
    uniforms.uPatchCos.value = near ? PATCH_COS : 2
    // Deep inside the patch the horizon is on the patch too: skip the sphere.
    if (sphere.current) sphere.current.visible = dBase > 0.07
    const alt = camera.position.distanceTo(tmp.copy(MARS_POS)) - R
    const k = HAZE_K * (1 - smoothstep(0.02, 0.3, alt))
    MARS_HAZE.k = k
    for (const u of [uniforms, patchU.current]) {
      if (!u) continue
      u.uHazeK.value = k
      u.uHazeColor.value.copy(HAZE)
    }
  }, -3)

  return (
    <>
    <GroundSky params={MARS_SKY} fade={(cam) => groundFade(MARS_POS, R, cam.position, 0.004, 0.035, 'mars')} />
    <group position={MARS_POS} rotation={[MARS_TILT, 0, 0]}>
      <mesh
        ref={sphere}
        material={material}
        onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
        onPointerOver={onHover ? (e) => { e.stopPropagation(); onHover(true) } : undefined}
        onPointerOut={onHover ? () => onHover(false) : undefined}
      >
        <sphereGeometry args={[R, 192, 128]} />
      </mesh>
      {/* A sibling, not a child: the sphere can hide without taking the base. */}
      <group ref={base} position={BASE_POS} quaternion={BASE_QUAT}>
        <MarsBase load={loadBase} map={tex} baseToPlanet={BASE_TO_PLANET} onPatchUniforms={(u) => (patchU.current = u)} />
      </group>
    </group>
    </>
  )
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
