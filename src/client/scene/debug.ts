// `?still` freezes all motion (camera, rotation, satellites, stars) so two
// captured frames of the scene are deterministic — used to detect per-frame
// render flicker (a difference between two static frames IS the flicker).
export const STILL =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('still')

export const FIXED_DATE = new Date('2026-06-12T00:00:00Z')
