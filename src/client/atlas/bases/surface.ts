import { Quaternion, Vector3 } from 'three'

const UP = new Vector3(0, 1, 0)

// Place a group on a sphere of `radius` at lat/lon (degrees), +Y aligned with
// the local surface normal. Returns position + quaternion for the group.
export function surfacePose(radius: number, latDeg: number, lonDeg: number) {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  const normal = new Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon),
  )
  const position = normal.clone().multiplyScalar(radius)
  const quaternion = new Quaternion().setFromUnitVectors(UP, normal)
  return { position, quaternion }
}
