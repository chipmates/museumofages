/* THE OBJECTS' OWN STUFF: baked clay, white limestone and red breccia at the distance of a hand, from the street's
   own colours (the gate's palette) and the street's breccia recipe made fine. Every pattern rides the object's own
   metres, so it turns with the object; nothing is coloured where a sign is cut: the cut is shape alone. */
import { DataTexture, LinearMipmapLinearFilter, LinearFilter, MeshStandardNodeMaterial, RepeatWrapping, SRGBColorSpace } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { PAL } from '../gate/gate-colours'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const T = TSL as unknown as Record<string, N>
const { float, mix, mx_noise_float, normalLocal, positionLocal, smoothstep, step, texture, vec3 } = T

const V = (c: readonly [number, number, number]): N => vec3(c[0], c[1], c[2])
/** a value-noise octave sum about 0, of the object's own metres times f */
const fbm = (p: N, f: number, octaves = 3): N => {
  let sum: N = float(0), amp = 1, norm = 0
  for (let o = 0; o < octaves; o++) {
    sum = sum.add(mx_noise_float(p.mul(f * 2 ** o)).mul(amp))
    norm += amp
    amp *= 0.5
  }
  return sum.div(norm)
}

/** THE BRICK'S CLAY: the buff of the king's baked bricks, a few points warmer or paler from brick to brick and across
 *  one face as the kiln left it, flecked with sand and the odd dark grit; matte */
export function clayMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 })
  const p = positionLocal
  const broad = fbm(p, 9, 2)
  const fleck = mx_noise_float(p.mul(1400)).mul(0.5).add(0.5)
  const grit = smoothstep(0.82, 0.9, mx_noise_float(p.mul(520).add(7.3)).mul(0.5).add(0.5))
  // the king's bricks are a pale yellowish buff, a little pinker where the kiln ran hot
  const pale = mix(V(PAL.buff), vec3(0.6, 0.52, 0.4), 0.45)
  const warm = mix(pale, V(PAL.redBrown), smoothstep(-0.2, 0.8, broad).mul(0.16))
  const sand = mx_noise_float(p.mul(260).add(2.2)).mul(0.5).add(0.5)
  m.colorNode = warm.mul(float(0.9).add(fleck.mul(0.12)).add(broad.mul(0.1)).add(sand.mul(0.06))).mul(float(1).sub(grit.mul(0.5)))
  m.roughnessNode = float(0.9).add(fleck.mul(0.06))
  return m
}

/** THE STREET'S WHITE STONE: the limestone of the street's middle band, mottled a little and fine-grained; the
 *  walked face paler and smoother, the hidden faces as the mason left them */
export function limestoneMaterial(walked: boolean): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: walked ? 0.62 : 0.84, metalness: 0 })
  const p = positionLocal
  const mottle = fbm(p, 3.2, 3)
  const grain = mx_noise_float(p.mul(900)).mul(0.5).add(0.5)
  const speck = smoothstep(0.86, 0.93, mx_noise_float(p.mul(260).add(3.1)).mul(0.5).add(0.5))
  const cloud = fbm(p.add(1.7), 11, 3)
  const stone = mix(V(PAL.limestone), vec3(0.64, 0.62, 0.57), 0.5)
  const base = stone.mul(float(walked ? 1.05 : 0.97).add(mottle.mul(0.2)).add(cloud.mul(0.08)).add(grain.mul(0.06)))
  m.colorNode = mix(mix(base, vec3(0.52, 0.48, 0.4), smoothstep(0.1, 0.5, cloud).mul(0.25)), stone.mul(0.6), speck.mul(0.45))
  m.roughnessNode = float(walked ? 0.58 : 0.82).add(grain.mul(0.08))
  return m
}

/** THE RED STONE'S CLASTS, baked once: angular fragments of a few millimetres to three centimetres, each its own tone
 *  (most red, some dark, some pale pink, a few cream), set close in a dark red matrix that is itself full of small
 *  fragments. A tiling map over TILE metres; Voronoi cells give the fragments their straight broken edges. */
const TILE = 0.42
let clasts: DataTexture | null = null
function clastMap(): DataTexture {
  if (clasts) return clasts
  const N = 1024
  const data = new Uint8Array(N * N * 4)
  let seed = 7
  const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const enc = (c: number): number => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055))
  /** one layer of fragments: per cell a jittered point, a tone and a gap to the matrix (px) */
  const layer = (cells: number, gap: [number, number]) => {
    const pts = new Float32Array(cells * cells * 2), tone = new Float32Array(cells * cells * 3), gaps = new Float32Array(cells * cells)
    const tones: [readonly [number, number, number], number][] = [[PAL.breccia, 0.52], [PAL.brecciaDark, 0.2], [PAL.brecciaPale, 0.2], [PAL.brecciaVein, 0.05], [[0.3, 0.17, 0.16], 0.03]]
    for (let c = 0; c < cells * cells; c++) {
      pts[c * 2] = 0.12 + rnd() * 0.76; pts[c * 2 + 1] = 0.12 + rnd() * 0.76
      let r = rnd(), t = tones[0]![0]
      for (const [col, w] of tones) { if (r < w) { t = col; break } r -= w }
      // held close to the stone's own red, so a cut sign reads by its shadow and not against a mosaic
      const k = 0.92 + rnd() * 0.14, m = PAL.breccia, c0 = 0.5
      tone[c * 3] = (m[0] + (t[0] - m[0]) * c0) * k; tone[c * 3 + 1] = (m[1] + (t[1] - m[1]) * c0) * k; tone[c * 3 + 2] = (m[2] + (t[2] - m[2]) * c0) * k
      gaps[c] = gap[0] + rnd() * (gap[1] - gap[0])
    }
    const size = N / cells
    const probe = (x: number, y: number): { id: number; edge: number } => {
      const cx = Math.floor(x / size), cy = Math.floor(y / size)
      let f1 = 1e9, f2 = 1e9, id = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gy = cy + dy, wx = (gx + cells) % cells, wy = (gy + cells) % cells, c = wy * cells + wx
        const px = (gx + pts[c * 2]!) * size, py = (gy + pts[c * 2 + 1]!) * size
        const d = Math.hypot(px - x, py - y)
        if (d < f1) { f2 = f1; f1 = d; id = c } else if (d < f2) f2 = d
      }
      return { id, edge: (f2 - f1) / 2 - gaps[id]! }
    }
    return { probe, tone }
  }
  const hash = (x: number, y: number): number => { const t = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return t - Math.floor(t) }
  /** a wrapping value noise of period N over cells of 8 px, 0..1 */
  const cloud = (x: number, y: number): number => {
    const c = 8, n = N / c, X = x / c, Y = y / c, i = Math.floor(X), j = Math.floor(Y), fx = X - i, fy = Y - j
    const at = (a: number, b: number): number => hash(((a % n) + n) % n, ((b % n) + n) % n)
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
    return (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy
  }
  const L = [layer(13, [0.6, 3]), layer(38, [0.4, 1.6]), layer(120, [0.3, 0.9])]
  const matrix = PAL.brecciaDark
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let r = (matrix[0] + PAL.breccia[0]) / 2, g = (matrix[1] + PAL.breccia[1]) / 2, b = (matrix[2] + PAL.breccia[2]) / 2
    // a big fragment where one stands (one in five left out), else a middling one, else a small one, else matrix
    for (let l = 0; l < 3; l++) {
      const { id, edge } = L[l]!.probe(x, y)
      if (edge > 0 && (l > 0 || id % 5 !== 0)) { const t = L[l]!.tone; r = t[id * 3]!; g = t[id * 3 + 1]!; b = t[id * 3 + 2]!; break }
    }
    // no fragment is one flat colour: a cloud across it and a fine sand over all (tiling: the noise wraps)
    const f = 0.93 + cloud(x, y) * 0.1 + (hash(x, y) - 0.5) * 0.05
    const k = (y * N + x) * 4
    data[k] = enc(r * f); data[k + 1] = enc(g * f); data[k + 2] = enc(b * f); data[k + 3] = 255
  }
  clasts = new DataTexture(data, N, N)
  clasts.wrapS = clasts.wrapT = RepeatWrapping
  clasts.colorSpace = SRGBColorSpace
  clasts.magFilter = LinearFilter
  clasts.minFilter = LinearMipmapLinearFilter
  clasts.generateMipmaps = true
  clasts.needsUpdate = true
  return clasts
}

/** THE STREET'S RED STONE at a hand's distance: the baked fragments laid on each face by the face's own two axes
 *  (the object's own metres), a fine grain over them; the walked face a little paler and smoother */
export function brecciaMaterial(walked: boolean): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: walked ? 0.55 : 0.8, metalness: 0 })
  const p = positionLocal
  const n = normalLocal.abs()
  const side = mix(p.xy, p.zy, step(n.z, n.x))
  const uv = mix(side, p.xz, step(n.x.max(n.z), n.y)).div(TILE)
  const grain = mx_noise_float(p.mul(700)).mul(0.5).add(0.5)
  m.colorNode = texture(clastMap(), uv).rgb.mul(float(walked ? 1.06 : 0.98).add(grain.mul(0.06)))
  m.roughnessNode = float(walked ? 0.5 : 0.78).add(grain.mul(0.08))
  return m
}

/** OUR MEASURE, NEVER THE PAST'S: the walk's grey, as the scale figure wears it */
export function pencilMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 })
  m.colorNode = vec3(0.16)
  return m
}
