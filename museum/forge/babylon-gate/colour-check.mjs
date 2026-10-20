// THE GLAZES AGAINST COLOURS.md 9: each glaze as an ungraded diffuse tile under a neutral light, white-balanced on the
// white glaze (CIELAB with the white glaze as the reference white), hue, chroma and reflectance against white per range.
// The shader's per-brick variation averages to 1, so the tile's colour is the palette's own (`gate-colours.ts`).
//   node --experimental-strip-types forge/babylon-gate/colour-check.mjs [--md <file in the hand-in>]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const { PAL, GLAZE_RANGES } = await import(join(HERE, '../../src/wings/babylon/gate/gate-colours.ts'))
const xyz = ([r, g, b]) => [0.4124 * r + 0.3576 * g + 0.1805 * b, 0.2126 * r + 0.7152 * g + 0.0722 * b, 0.0193 * r + 0.1192 * g + 0.9505 * b]
const W = xyz(PAL.white)
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
const lab = (c) => {
  const [X, Y, Z] = xyz(c)
  const fx = f(X / W[0]), fy = f(Y / W[1]), fz = f(Z / W[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
// lightness against an absolute white as well (the black's L* is read that way in COLOURS.md)
const labAbs = (c) => { const [, Y] = xyz(c); return 116 * f(Y) - 16 }
const rows = ['| glaze | hue (deg) | chroma | reflectance against white | range | verdict |', '|---|---|---|---|---|---|']
let bad = 0
for (const name of ['cobalt', 'turquoise', 'yellow', 'white', 'black', 'red']) {
  const [L, a, b] = lab(PAL[name])
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, C = Math.hypot(a, b)
  const ratio = xyz(PAL[name])[1] / W[1]
  const R = GLAZE_RANGES[name]
  const fails = []
  if (R.hue && (hue < R.hue[0] || hue > R.hue[1])) fails.push('hue')
  if (R.chromaFloor !== undefined && C < R.chromaFloor) fails.push('chroma')
  if (R.ratio && (ratio < R.ratio[0] - 1e-6 || ratio > R.ratio[1] + 1e-6)) fails.push('ratio')
  const Labs = labAbs(PAL[name] .map((x) => x / 0.8))
  if (R.L && (Labs < R.L[0] || Labs > R.L[1])) fails.push('L*')
  if (fails.length) bad++
  const range = [R.hue ? `hue ${R.hue.join(' to ')}` : '', R.chromaFloor !== undefined ? `chroma at least ${R.chromaFloor}` : '', R.ratio ? `ratio ${R.ratio.join(' to ')}` : '', R.L ? `L* ${R.L.join(' to ')} (absolute ${Labs.toFixed(1)})` : '', R.note ?? ''].filter(Boolean).join('; ')
  rows.push(`| ${name} | ${hue.toFixed(1)} | ${C.toFixed(1)} | ${ratio.toFixed(3)} | ${range} | ${fails.length ? 'OUT: ' + fails.join(', ') : 'inside'} |`)
}
const text = `${rows.join('\n')}\n\nA chroma above a range's best-preserved values is allowed as a marked guess (the glaze was new). No sample of the red exists: it is chosen (class G).\n${bad ? `${bad} glaze(s) outside their range` : 'every measured glaze inside its range'}`
console.log(text)
const i = process.argv.indexOf('--md')
if (i > 0) { mkdirSync(dirname(process.argv[i + 1]), { recursive: true }); writeFileSync(process.argv[i + 1], text + '\n') }
process.exit(bad ? 1 : 0)
