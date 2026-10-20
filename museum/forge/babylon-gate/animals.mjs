// THE RELIEF ANIMALS ON A SHEET, without a browser: each field shaded under a raking light from its head's side,
// in its glaze colours on its ground, with the bond's joints, at 1:1 texels and at the phone still's scale.
//   node --experimental-strip-types forge/babylon-gate/animals.mjs <out folder in the hand-in>
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const { animalField, jointConflicts, REG } = await import(join(HERE, '../../src/wings/babylon/gate/gate-relief.ts'))
const out = process.argv[2]
mkdirSync(out, { recursive: true })
const srgb = (x) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055))
const PAL = { white: [0.725, 0.655, 0.572], cobalt: [0.034, 0.089, 0.213], yellow: [0.656, 0.375, 0.05], turquoise: [0.082, 0.365, 0.369], red: [0.312, 0.044, 0.03], black: [0.016, 0.015, 0.015] }
for (const [kind, body, mane, ground] of [['bull', 'yellow', 'cobalt', 'cobalt'], ['dragon', 'white', 'yellow', 'cobalt'], ['lion', 'white', 'yellow', 'turquoise']]) {
  const f = animalField(kind)
  const W = f.w, H = f.h
  const px = Buffer.alloc(W * H * 3)
  // light from the head's end, low (the sun 16 degrees off the face) and a little from above
  const L = [0.75, 0.35, 0.56]
  const ll = Math.hypot(...L)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i
    const h = (ii, jj) => { const a = Math.min(W - 1, Math.max(0, ii)), b = Math.min(H - 1, Math.max(0, jj)); return f.height[b * W + a] + f.detail[b * W + a] }
    const du = (h(i + 1, j) - h(i - 1, j)) / (2 * f.res), dv = (h(i, j + 1) - h(i, j - 1)) / (2 * f.res)
    const n = [-du, -dv, 1], nl = Math.hypot(...n)
    const lam = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nl * ll))
    const r = f.region[k]
    let c = PAL[ground]
    if (r === REG.body) c = PAL[body]
    else if (r === REG.mane) c = PAL[mane]
    else if (r === REG.red || r === REG.mouth) c = PAL.red
    else if (r === REG.eyeWhite || r === REG.tooth || r === REG.stripe) c = PAL.white
    else if (r === REG.black) c = PAL.black
    const th = f.thread[k]
    // joints: courses of 8.6 cm, heads every 33 cm, whole-ended on even courses of the animal's own grid
    const u = i * f.res, v = j * f.res, cc = Math.floor(v / 0.086)
    const ph = cc % 2 === 0 ? 0 : 0.165
    const joint = Math.abs(v - Math.round(v / 0.086) * 0.086) < 0.0045 || Math.abs(((u - ph) % 0.33 + 0.33) % 0.33) < 0.0045 || Math.abs(((u - ph) % 0.33 + 0.33) % 0.33 - 0.33) < 0.0045
    const shade = 0.25 + 1.1 * lam
    for (let q = 0; q < 3; q++) {
      let x = c[q] * (1 - th) + PAL.black[q] * th
      x = joint ? 0.03 : x * shade
      px[((H - 1 - j) * W + i) * 3 + q] = Math.min(255, srgb(x * 1.4))
    }
  }
  writeFileSync(join(out, `${kind}.ppm`), Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), px]))
  const conf = jointConflicts(f)
  console.log(`${kind}: ${f.L} m, ${W}x${H}, highest ${(f.hMax * 100).toFixed(1)} cm, joint conflicts ${conf.length ? conf.join('; ') : 'none'}`)
}
