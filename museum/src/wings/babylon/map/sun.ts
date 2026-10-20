/* THE SUN OVER BABYLON on the walk's day: twenty days after the spring
   equinox about 570 BC (obliquity 23.76 degrees), latitude 32.54 N, local
   apparent solar time. Pure, for the page and for node. */

const D2R = Math.PI / 180
export const LATITUDE = 32.54
export const OBLIQUITY = 23.76
export const DAYS_AFTER_EQUINOX = 20

export function declination(days = DAYS_AFTER_EQUINOX): number {
  return Math.asin(Math.sin(OBLIQUITY * D2R) * Math.sin(days * 0.9856 * D2R)) / D2R
}

/** the sun at a solar hour: azimuth (degrees from true north, clockwise) and elevation */
export function sunAt(hour: number, days = DAYS_AFTER_EQUINOX): { azimuth: number; elevation: number } {
  const phi = LATITUDE * D2R, dec = declination(days) * D2R, H = (hour - 12) * 15 * D2R
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI
  return { azimuth: ((az / D2R) % 360 + 360) % 360, elevation: el / D2R }
}

/** toward the sun in the scene's frame (x east, y up, z south); grid convergence (about 0.3 degree) left out */
export function sunVector(hour: number): [number, number, number] {
  const { azimuth, elevation } = sunAt(hour)
  const c = Math.cos(elevation * D2R)
  return [c * Math.sin(azimuth * D2R), Math.sin(elevation * D2R), -c * Math.cos(azimuth * D2R)]
}

/** "17:20" as hours */
export const hourOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) + (m ?? 0) / 60
}
