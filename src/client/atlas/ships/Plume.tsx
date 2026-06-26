/** @jsxImportSource react */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  type Group,
  type Sprite,
} from 'three'
import { STILL } from '../../scene/debug'

// One shared radial-gradient sprite for the soft engine glow. This is a
// browser-only island (no SSR), so a 2D canvas texture is safe and cheap.
let glowTex: CanvasTexture | null = null
export function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.25)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  glowTex = new CanvasTexture(c)
  return glowTex
}

// Deterministic flicker (no Math.random): a couple of detuned sines read as
// turbulent combustion without ever resampling.
function flicker(t: number): number {
  return 0.86 + Math.sin(t * 41) * 0.1 + Math.sin(t * 23.3) * 0.05
}

interface PlumeProps {
  /** Overall plume size (length & width scale together). */
  scale?: number
  /** Brightness multiplier, 0 cuts the plume out entirely. */
  intensity?: number
  /** Bright inner color. */
  core?: string
  /** Faint outer color. */
  outer?: string
  /** Wide, long, faint vacuum plume vs. tight, bright atmospheric column. */
  vacuum?: boolean
}

// Engine plume firing down -Y from the tail (y = 0): a narrow throat that
// flares downstream, layered as additive cones + a throat glow sprite. No
// postprocessing — the "bloom" is the sprite, which keeps it stable on GPUs
// where real bloom flickers.
export function Plume({
  scale = 1,
  intensity = 1,
  core = '#cfe6ff',
  outer = '#4f93ff',
  vacuum = true,
}: PlumeProps) {
  const grp = useRef<Group>(null)
  const halo = useRef<Sprite>(null)
  const tex = useMemo(() => glowTexture(), [])

  const len = (vacuum ? 4.4 : 2.9) * scale
  const wide = (vacuum ? 0.92 : 0.6) * scale
  const throat = (vacuum ? 0.16 : 0.22) * scale
  const coreLen = len * 0.6
  const haloR = wide * (vacuum ? 2.1 : 2.5)

  useFrame(({ clock }) => {
    const g = grp.current
    if (!g) return
    const f = STILL ? 0.9 : flicker(clock.elapsedTime)
    g.scale.set(1, f, 1) // breathe along the axis
    if (halo.current) {
      const s = haloR * (0.92 + (f - 0.86) * 1.6)
      halo.current.scale.set(s, s, 1)
    }
  })

  if (intensity <= 0) return null

  return (
    <group ref={grp}>
      {/* Soft outer body: a stretched radial-gradient sprite, so the plume
          falls off into space with no hard silhouette (a cone would show one). */}
      <sprite position={[0, -len * 0.42, 0]} scale={[wide * 2.4, len * 1.05, 1]}>
        <spriteMaterial
          map={tex}
          color={outer}
          blending={AdditiveBlending}
          depthWrite={false}
          transparent
          opacity={0.55 * intensity}
          toneMapped={false}
        />
      </sprite>

      {/* Bright core column. */}
      <mesh position={[0, -coreLen / 2, 0]}>
        <cylinderGeometry args={[throat * 0.8, wide * 0.4, coreLen, 24, 1, true]} />
        <meshBasicMaterial
          color={core}
          transparent
          opacity={0.5 * intensity}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* Hot throat halo: the bright spot right at the nozzle. */}
      <sprite ref={halo} position={[0, -throat * 0.4, 0]} scale={[haloR, haloR, 1]}>
        <spriteMaterial
          map={tex}
          color={core}
          blending={AdditiveBlending}
          depthWrite={false}
          transparent
          opacity={1.0 * intensity}
          toneMapped={false}
        />
      </sprite>
    </group>
  )
}
