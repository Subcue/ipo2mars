/** @jsxImportSource react */
import { AdditiveBlending } from 'three'
import { TRANSIT_CURVE } from './route'

// The Earth<->Mars cycler path drawn as a faint glowing arc, so the overview
// reads as a map of a working route rather than empty space between two dots.
// Rendered ONLY in the overview: up close (ship/body focus) the camera looks
// down the tube end-on and the additive segments stack into a bright band, so
// the caller unmounts it instead of fighting that with opacity.
export function TransitRoute() {
  return (
    <mesh>
      <tubeGeometry args={[TRANSIT_CURVE, 220, 0.04, 6, true]} />
      <meshBasicMaterial
        color="#3c79c8"
        transparent
        opacity={0.26}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
