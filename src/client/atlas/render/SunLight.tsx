/** @jsxImportSource react */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Object3D, Vector3, type DirectionalLight } from 'three'
import { SUN_DIR } from '../../scene/sunlight'
import { QUALITY } from '../quality'

export interface ShadowFocus {
  /** World point the shadow frustum is centred on (read every frame). */
  center: () => Vector3
  /** Half-size of the orthographic shadow frustum, stage units. */
  radius: number
  /** Re-render the shadow map every frame (moving caster, e.g. the ship). */
  dynamic?: boolean
}

// The one sun. It always lights everything; its shadow map is only rendered
// when something small and detailed is in focus (a base or the ship), with the
// orthographic frustum wrapped tightly around it so shadows stay crisp at
// metre scale on a planet-sized stage.
export function SunLight({ focus }: { focus: ShadowFocus | null }) {
  const light = useRef<DirectionalLight>(null)
  const target = useRef(new Object3D())
  const since = useRef(0)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    scene.add(target.current)
    return () => {
      scene.remove(target.current)
    }
  }, [scene])

  // Static scenes (the bases) don't need a fresh shadow map every frame:
  // render it while things settle and stream in, then only now and then.
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
  }, [gl])

  useEffect(() => {
    const l = light.current
    if (!l) return
    since.current = 0
    l.castShadow = !!focus
    gl.shadowMap.needsUpdate = true
    if (!focus) return
    const cam = l.shadow.camera
    const r = focus.radius
    cam.left = -r
    cam.right = r
    cam.top = r
    cam.bottom = -r
    cam.near = r * 0.5
    cam.far = r * 60
    cam.updateProjectionMatrix()
    l.shadow.bias = -0.0004
    l.shadow.normalBias = r * 0.0035
  }, [focus, gl])

  useFrame(() => {
    const l = light.current
    if (!l) return
    since.current += 1
    if (focus && (focus.dynamic || since.current < 240 || since.current % 30 === 0)) {
      gl.shadowMap.needsUpdate = true
    }
    if (focus) {
      const c = focus.center()
      target.current.position.copy(c)
      l.position.copy(c).addScaledVector(SUN_DIR, focus.radius * 30)
    } else {
      target.current.position.set(0, 0, 0)
      l.position.copy(SUN_DIR).multiplyScalar(50)
    }
    target.current.updateMatrixWorld()
  })

  return (
    <directionalLight
      ref={light}
      target={target.current}
      intensity={3.1}
      color="#fff3e2"
      shadow-mapSize-width={QUALITY.shadowSize}
      shadow-mapSize-height={QUALITY.shadowSize}
    />
  )
}
