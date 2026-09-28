/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { Matrix4, SRGBColorSpace, TextureLoader, Vector3, type Group, type Mesh } from 'three'
import { makePlanetMaterial } from './planetMaterial'
import { MOON_LOOK } from './surfaceGlsl'
import { MoonBase, MOON_TERRAIN } from '../bases/MoonBase'
import { anchors, BASE_SCALE, MOON_ORBIT, MOON_RADIUS } from '../stage'
import { QUALITY } from '../quality'
import { STILL } from '../../scene/debug'

const R = MOON_RADIUS
// The sphere mesh is turned so the texture's pole (a UV singularity) lies on
// the side, not under the base at the body's north pole.
const MESH_ROT = Math.PI / 2
const BASE_TO_PLANET = new Matrix4().makeRotationX(-MESH_ROT).multiply(new Matrix4().makeTranslation(0, R, 0))
const BASE_DIR = new Vector3(0, 1, 0).applyAxisAngle(new Vector3(1, 0, 0), -MESH_ROT)
const PATCH_COS = Math.cos(((MOON_TERRAIN.extent * BASE_SCALE) / R) * 0.975)

// The Moon: a flat orbit (world XZ), tidally locked for real (the body is
// rigid in the orbit pivot, so the same face and the same horizon always
// point home). The outpost sits at its north pole, where local up is world
// up; the orbit holds still while the camera is there.
export function MoonBody({
  onClick,
  onHover,
  paused = false,
}: {
  onClick?: () => void
  onHover?: (hovering: boolean) => void
  paused?: boolean
}) {
  const tex = useLoader(TextureLoader, '/textures/moon.jpg')
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const { material, uniforms } = useMemo(
    () => makePlanetMaterial({ map: tex, radius: R, look: MOON_LOOK, octaves: QUALITY.surfaceOctaves }),
    [tex],
  )
  uniforms.uPatchDir.value.copy(BASE_DIR)
  const pivot = useRef<Group>(null)
  const body = useRef<Group>(null)
  const base = useRef<Group>(null)
  const sphere = useRef<Mesh>(null)

  useFrame(({ camera }, dt) => {
    if (!pivot.current || !body.current || !base.current) return
    if (!paused && !STILL) pivot.current.rotation.y += dt * MOON_ORBIT.speed
    pivot.current.updateMatrixWorld()
    body.current.getWorldPosition(anchors.moon)
    base.current.getWorldPosition(anchors.moonBase)
    anchors.ready.moon = true
    const dBase = camera.position.distanceTo(anchors.moonBase)
    const near = dBase < 2
    base.current.visible = near
    uniforms.uPatchCos.value = near ? PATCH_COS : 2
    // Deep inside the patch the horizon is on the patch too: skip the sphere.
    if (sphere.current) sphere.current.visible = dBase > 0.06
  }, -3)

  return (
    <group ref={pivot} rotation-y={MOON_ORBIT.phase}>
      <group ref={body} position={[MOON_ORBIT.radius, MOON_ORBIT.y, 0]}>
        <mesh
          ref={sphere}
          rotation={[MESH_ROT, 0, 0]}
          material={material}
          onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
          onPointerOver={onHover ? (e) => { e.stopPropagation(); onHover(true) } : undefined}
          onPointerOut={onHover ? () => onHover(false) : undefined}
        >
          <sphereGeometry args={[R, 160, 120]} />
        </mesh>
        <group ref={base} position={[0, R, 0]}>
          <MoonBase map={tex} baseToPlanet={BASE_TO_PLANET} />
        </group>
      </group>
    </group>
  )
}
