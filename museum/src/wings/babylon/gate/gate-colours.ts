/* THE GATE'S COLOURS, pure (node reads them for the colour check): linear albedo.
   The glazes from COLOURS.md 9 at the saturated end of each range (the glaze was
   new about 570 BC), built from CIELAB targets and scaled so the white glaze
   stands at 0.73; the red has no sample (class G, chosen). */

const g = (r: number, gg: number, b: number, k = 0.8): [number, number, number] => [r * k, gg * k, b * k]
type RGB = [number, number, number]

export const PAL = {
  // CIELAB targets: white L* 93 warm; cobalt h 274 C 30 at 0.13 of white; yellow h 83 C 62 at 0.62; turquoise h 198 C 28 at 0.46; red h 35 C 50 L* 42; black L* 15
  white: g(0.9067, 0.8184, 0.7148),
  cobalt: g(0.0423, 0.1114, 0.2657),
  yellow: g(0.8197, 0.4693, 0.0622),
  turquoise: g(0.1019, 0.4568, 0.4608),
  red: g(0.3902, 0.0551, 0.0371),
  black: g(0.0204, 0.0187, 0.0191),
  buff: [0.52, 0.4, 0.27] as RGB,
  redBrown: [0.36, 0.2, 0.13] as RGB,
  asphalt: [0.035, 0.032, 0.03] as RGB,
  mud: [0.4, 0.33, 0.25] as RGB,
  cedar: [0.24, 0.13, 0.065] as RGB,
  copper: [0.93, 0.6, 0.47] as RGB,
  bronze: [0.72, 0.5, 0.3] as RGB,
  limestone: [0.6, 0.55, 0.44] as RGB,
  breccia: [0.36, 0.11, 0.075] as RGB,
  brecciaPale: [0.55, 0.29, 0.22] as RGB,
  brecciaDark: [0.2, 0.065, 0.045] as RGB,
  brecciaVein: [0.7, 0.64, 0.56] as RGB,
  grey: 0.42,
}

/** COLOURS.md 9's ranges (hue in CIELAB degrees, chroma's floor from the best-preserved panels, reflectance against the white glaze) */
export const GLAZE_RANGES: Record<string, { hue?: [number, number]; chromaFloor?: number; ratio?: [number, number]; L?: [number, number]; note?: string }> = {
  cobalt: { hue: [264, 284], chromaFloor: 19, ratio: [0.08, 0.22] },
  turquoise: { hue: [183, 230], chromaFloor: 16, ratio: [0.41, 0.51] },
  yellow: { hue: [75, 91], chromaFloor: 45, ratio: [0.4, 0.9] },
  white: { ratio: [1, 1], note: 'the reference; a warm white lighter than any photo median [Guess]' },
  black: { L: [13, 16], note: 'near neutral' },
  red: { note: 'no sample of the red exists (green today); chosen, class G' },
}
