/* THE BANKS' REED (bab.green.reed, Guessed): a clump of common reed (Phragmites) as it stands in mid-April, made in
   code. The reed flowers from July to October, so in April last year's stems still stand, pale and dry with their grey
   plumes, and the new shoots come up green among them (the season from the plant's cycle; its April height ours). A
   clump stands at the origin, its foot at 0, about 2.4 m across; the vertex format is the plain palms' own (position,
   normal, color), so it draws in their instanced material. */

import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'

type V3 = [number, number, number]
const STRAW: V3 = [0.27, 0.22, 0.135]
const PLUME: V3 = [0.17, 0.145, 0.12]
const SHOOT: V3 = [0.075, 0.118, 0.045]
const SHOOT_OLD: V3 = [0.09, 0.105, 0.05]

const rnd = (seed: number): (() => number) => {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** a reed clump: `stems` of last year's straw with their plumes, `shoots` of this spring's green blades */
export function reedGeometry(seed = 7, stems = 16, shoots = 34): BufferGeometry {
  const r = rnd(seed)
  const pos: number[] = [], nor: number[] = [], col: number[] = []
  const tri = (a: V3, b: V3, c: V3, ca: V3, cb: V3, cc: V3): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    // a blade's light from above and out of the clump, either face (the material is double-sided)
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz }
    const l = Math.hypot(nx, ny + 0.6, nz) || 1
    for (const [p, q] of [[a, ca], [b, cb], [c, cc]] as Array<[V3, V3]>) {
      pos.push(...p)
      nor.push(nx / l, (ny + 0.6) / l, nz / l)
      col.push(...q)
    }
  }
  const shade = (c: V3, k: number): V3 => [c[0] * k, c[1] * k, c[2] * k]
  // last year's stems: thin and upright, a little bent, each with its plume hanging to one side
  for (let i = 0; i < stems; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.1
    const x = Math.cos(a) * d, z = Math.sin(a) * d
    const h = 2.3 + r() * 0.8, lean = 0.05 + r() * 0.12
    const tx = x + Math.cos(a) * h * lean, tz = z + Math.sin(a) * h * lean
    const w = 0.07 + r() * 0.03, sa = a + Math.PI / 2
    const sx = Math.cos(sa) * w, sz = Math.sin(sa) * w
    const k = 0.85 + r() * 0.3
    tri([x - sx, 0, z - sz], [x + sx, 0, z + sz], [tx, h, tz], shade(STRAW, k * 0.7), shade(STRAW, k * 0.7), shade(STRAW, k))
    // the plume: a loose drooping panicle, about 30 cm
    const pa = a + (r() - 0.5) * 1.2, pl = 0.32 + r() * 0.12
    const px = tx + Math.cos(pa) * pl * 0.7, pz = tz + Math.sin(pa) * pl * 0.7
    const qx = Math.cos(pa + Math.PI / 2) * 0.07, qz = Math.sin(pa + Math.PI / 2) * 0.07
    tri([tx - qx, h, tz - qz], [tx + qx, h, tz + qz], [px, h - pl * 0.6, pz], shade(PLUME, k), shade(PLUME, k), shade(PLUME, k * 0.8))
  }
  // this spring's shoots: broad leafy blades fanning out of the clump, shorter than the old stems
  for (let i = 0; i < shoots; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.2
    const x = Math.cos(a) * d, z = Math.sin(a) * d
    const h = 1.0 + r() * 0.9, lean = 0.12 + r() * 0.26
    const tx = x + Math.cos(a) * h * lean, tz = z + Math.sin(a) * h * lean
    const w = 0.16 + r() * 0.08, sa = a + Math.PI / 2 + (r() - 0.5) * 0.8
    const sx = Math.cos(sa) * w, sz = Math.sin(sa) * w
    const base = r() < 0.3 ? SHOOT_OLD : SHOOT
    const k = 0.85 + r() * 0.3
    tri([x - sx, 0, z - sz], [x + sx, 0, z + sz], [tx, h, tz], shade(base, k * 0.6), shade(base, k * 0.6), shade(base, k * 1.1))
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}
