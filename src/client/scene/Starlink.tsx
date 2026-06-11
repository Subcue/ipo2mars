/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type InstancedMesh } from 'three'
import { propagate, type SatRec } from 'satellite.js'
import { parseTle, EARTH_RADIUS_KM } from '../lib/satellites'
import { STILL, FIXED_DATE } from './debug'

const UPDATE_INTERVAL = 1 // seconds — LEO sats move ~7.5 km/s, invisible per frame

interface StarlinkProps {
  count?: number
  radius?: number
  onCount?: (n: number) => void
}

export function Starlink({ count = 2600, radius = 1, onCount }: StarlinkProps) {
  const meshRef = useRef<InstancedMesh>(null)
  const recsRef = useRef<SatRec[]>([])
  const lastUpdate = useRef(-99)
  const dummy = useMemo(() => new Object3D(), [])
  const [, setLoaded] = useState(0)

  useEffect(() => {
    let alive = true
    fetch(`/api/tle/starlink?max=${count}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((text) => {
        if (!alive) return
        recsRef.current = parseTle(text)
        setLoaded(recsRef.current.length)
        onCount?.(recsRef.current.length)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [count, onCount])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh || recsRef.current.length === 0) return
    const t = state.clock.elapsedTime
    if (t - lastUpdate.current < UPDATE_INTERVAL) return
    lastUpdate.current = t

    const date = STILL ? FIXED_DATE : new Date()
    const scale = radius / EARTH_RADIUS_KM
    let n = 0
    for (const rec of recsRef.current) {
      const { position } = propagate(rec, date)
      if (!position || typeof position !== 'object') continue
      // ECI (z = north pole) -> three.js (y = up), preserving handedness.
      dummy.position.set(position.x * scale, position.z * scale, -position.y * scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(n++, dummy.matrix)
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={(m) => {
        meshRef.current = m
        if (m && recsRef.current.length === 0) m.count = 0 // hide the origin clump pre-load
      }}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.008, 8, 8]} />
      <meshBasicMaterial color="#cfe6ff" toneMapped={false} />
    </instancedMesh>
  )
}
