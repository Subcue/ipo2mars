/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, Vector3, type Group, type Sprite } from 'three'
import type { ModelContext } from '../render/materials'
import { MODELS, useEnv, useModel } from '../render/useModel'
import { glowTexture } from '../render/textures'
import { Plume, type PlumeLive } from '../ships/Plume'
import { BASE_SCALE, MOON_RADIUS } from '../stage'
import { STILL } from '../../scene/debug'

// The lunar mass driver in use: every few seconds a payload runs the length
// of the coil line, faster and faster, and leaves the far end at escape
// speed, a streak climbing over the horizon (the ground curves away under a
// straight flight). Metres, base-local; the track itself bends onto the
// Moon's curve, so the flight starts along the curved end's tangent.
const PERIOD = 13
const RUN = 1.9
const CURVE = BASE_SCALE / (2 * MOON_RADIUS)

export function MassDriver({ rail: [x0, z0, x1, z1] }: { rail: [number, number, number, number] }) {
  const env = useEnv('moon')
  const ctx = useMemo<ModelContext>(
    () => ({ env, dust: 0.45, dustColor: new Color('#8f8d8a'), dustHeight: 2.5, regolith: new Color('#77746f'), curve: CURVE }),
    [env],
  )
  const model = useModel(MODELS.massdriver, ctx)
  const shot = useRef<Group>(null)
  const glint = useRef<Sprite>(null)
  const tex = useMemo(() => glowTexture(), [])
  const trail = useMemo<PlumeLive>(() => ({ length: 0, width: 0, intensity: 0, halo: 0 }), [])
  const geo = useMemo(() => {
    const a = new Vector3(x0, 0, z0)
    const b = new Vector3(x1, 0, z1)
    const u = b.clone().sub(a).normalize()
    const len = a.distanceTo(b)
    return { a, u, len }
  }, [x0, z0, x1, z1])
  const tmp = useMemo(() => ({ p: new Vector3(), v: new Vector3() }), [])

  useFrame(({ clock }) => {
    const g = shot.current
    if (!g) return
    const t = STILL ? RUN * 0.8 : clock.elapsedTime % PERIOD
    const { a, u, len } = geo
    const onRail = (s: number, out: Vector3) => {
      out.copy(a).addScaledVector(u, s)
      out.y = 3.0 - (out.x * out.x + out.z * out.z) * CURVE
      return out
    }
    let visible = true
    if (t < RUN) {
      onRail(len * Math.pow(t / RUN, 2), tmp.p)
      onRail(len * Math.pow(t / RUN, 2) + 1, tmp.v).sub(tmp.p).normalize()
    } else if (t < RUN + 3.2) {
      // off the end at escape speed along the end's tangent
      onRail(len, tmp.p)
      onRail(len - 1, tmp.v)
      tmp.v.subVectors(tmp.p, tmp.v).normalize()
      tmp.p.addScaledVector(tmp.v, 1400 * (t - RUN))
    } else {
      visible = false
    }
    g.visible = visible
    g.position.copy(tmp.p)
    // point the streak back along the flight (plume axis is local -Y)
    g.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), tmp.v)
    const speed = t < RUN ? (2 * len * t) / (RUN * RUN) : 2 * len / RUN
    trail.length = Math.min(420, speed * 0.2)
    trail.width = 6
    trail.intensity = visible ? 1.6 : 0
    trail.halo = 0
    if (glint.current) {
      const k = 0.022 + 0.022 * Math.min(1, speed / 2000)
      glint.current.scale.set(k, k, 1)
    }
  })

  return (
    <group>
      <primitive object={model} />
      <group ref={shot} visible={false}>
        <Plume length={1} width={1} live={trail} core="#f4f8ff" outer="#8fb4ff" order={7} />
        <sprite ref={glint} renderOrder={8}>
          <spriteMaterial map={tex} color="#e8f0ff" blending={AdditiveBlending} depthWrite={false} transparent sizeAttenuation={false} toneMapped={false} />
        </sprite>
      </group>
    </group>
  )
}
