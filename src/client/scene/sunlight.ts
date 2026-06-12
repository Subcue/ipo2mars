import { Vector3 } from 'three'

// One sun for every scene: the directional light, the Earth's day/night
// terminator shader, and the visible sun disc all derive from this direction.
export const SUN_DIR = new Vector3(5, 2.5, 3).normalize()
export const SUN_DISTANCE = 180
