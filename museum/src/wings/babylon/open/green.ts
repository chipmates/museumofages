/* THE GREEN OF THE ARRIVAL: the date palm made in code (no open model exists,
   MAT), set out as `plain.ts` places them, and the plain's map (fields, canals
   and grove floors) painted once into two textures the ground reads. A palm:
   a tapered trunk with the leaf bases' scale pattern left to the material, a
   crown of long arching fronds, the oldest hanging brown below (on Ashurbanipal's
   relief BM 124920 the date palms have scaled trunks and a crown of long fronds,
   GREEN.settled bab.green.palm.plain). Sizes ours: trunk 9 to 15 m, fronds 4 m. */

import { BufferGeometry, CanvasTexture, InstancedBufferAttribute, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, Quaternion, SRGBColorSpace, Vector3, type Material } from 'three/webgpu'
import type { Plain, Palm } from './plain'
import { PALM_FAR, PALM_MID, PALM_NEAR, PALM_YOUNG_FAR, PALM_YOUNG_MID, YOUNG_H, palmGeometry } from '../gate/gate-life'
import { reedGeometry } from '../plants/banks'

// the bank trees grow in the stack's tree kit, whose leaf atlas is drawn on a canvas: a page only
const kit: typeof import('../plants/grown') | null = typeof document === 'undefined' ? null : await import('../plants/grown')

/* the banks' trees from the air, in their mid-April state (the kit's own habits, sizes ours): the tamarisk grey-green
   and not in bloom, the Euphrates poplar and the willow in new leaf; two of each, the flight passing none closer than
   about 130 m, so each spray is drawn larger to hold the crown's mass from there */
const BANK_TREES: Record<string, { species: 'tamarisk' | 'poplar-euphrates' | 'willow'; height: number; radius: number; spray: 'thread' | 'narrow'; leaf: [number, number, number]; wood: [number, number, number] }> = {
  tamarisk: { species: 'tamarisk', height: 6.5, radius: 3.2, spray: 'thread', leaf: [0.085, 0.1, 0.072], wood: [0.09, 0.072, 0.056] },
  poplar: { species: 'poplar-euphrates', height: 12.5, radius: 4.2, spray: 'narrow', leaf: [0.08, 0.104, 0.064], wood: [0.11, 0.1, 0.085] },
  willow: { species: 'willow', height: 9, radius: 4.6, spray: 'narrow', leaf: [0.085, 0.118, 0.05], wood: [0.08, 0.068, 0.052] },
}
const BANK = new Set(['reed', ...Object.keys(BANK_TREES)])

/** the plain's plants, one instanced mesh per drawing: the far palms (palm-date-babylon's far preset, the parent), the
    palms under the flight's descent at the mid preset, the reed clumps and the bank trees; each its own size, turn and
    lean and its row's class letters per instance */
export function palmMesh(palms: Palm[], ground: (x: number, z: number) => number, mat: Material): InstancedMesh {
  const m = new Matrix4(), q = new Quaternion(), e = new Vector3()
  const set = (geo: BufferGeometry, list: Palm[], name: string, letter: (p: Palm) => number): InstancedMesh => {
    const im = new InstancedMesh(geo, mat, Math.max(1, list.length))
    const cls = new Float32Array(Math.max(1, list.length) * 2), band = new Float32Array(Math.max(1, list.length))
    list.forEach((p, i) => {
      const y = ground(p.x, p.z)
      q.setFromAxisAngle(e.set(Math.cos(p.yaw), 0, Math.sin(p.yaw)).normalize(), p.lean)
      m.compose(new Vector3(p.x, y, p.z), q, new Vector3(p.s, p.s, p.s))
      im.setMatrixAt(i, m)
      const k = letter(p)
      cls[i * 2] = k
      cls[i * 2 + 1] = k
      band[i] = y + 0.5
    })
    if (!list.length) im.count = 0
    geo.setAttribute('cls', new InstancedBufferAttribute(cls, 2))
    geo.setAttribute('band', new InstancedBufferAttribute(band, 1))
    im.instanceMatrix.needsUpdate = true
    im.castShadow = true
    im.receiveShadow = true
    im.frustumCulled = false
    im.name = name
    return im
  }
  // the groves outside the walls are Known as a mass (R), the palms inside the walls and in the outer city's gardens
  // Guessed (G); the banks' plants Guessed
  const palmLetter = (p: Palm): number => (p.row === 'canal' || p.row === 'river' ? 1 : 2)
  const bankLetter = (): number => 2
  const tree = palms.filter((p) => !BANK.has(p.row) && p.row !== 'young')
  const root = set(palmGeometry(12, PALM_FAR), tree.filter((p) => !p.detail), 'palms-plain', palmLetter)
  // the young palms among the groves (palm-date-babylon's young variant): far, and mid wherever a flight passes close
  const young = palms.filter((p) => p.row === 'young')
  root.add(set(palmGeometry(YOUNG_H, PALM_YOUNG_FAR, 23), young.filter((p) => !p.detail), 'palms-young', palmLetter))
  root.add(set(palmGeometry(YOUNG_H, PALM_YOUNG_MID, 29), young.filter((p) => !!p.detail), 'palms-young-mid', palmLetter))
  root.add(set(palmGeometry(12, PALM_MID), tree.filter((p) => p.detail === 'mid'), 'palms-plain-mid', palmLetter))
  // the few the flight passes within about 110 m: the near preset, two palms of it
  const near = tree.filter((p) => p.detail === 'near')
  for (let v = 0; v < 2; v++) root.add(set(palmGeometry(12, PALM_NEAR, 17 + v * 12), near.filter((_, i) => i % 2 === v), `palms-plain-near-${v}`, palmLetter))
  // the reed in three clumps, each place one of them
  const reed = palms.filter((p) => p.row === 'reed')
  for (let v = 0; v < 3; v++) root.add(set(reedGeometry(11 + v * 7), reed.filter((_, i) => i % 3 === v), `reed-plain-${v}`, bankLetter))
  if (kit) {
    for (const [row, t] of Object.entries(BANK_TREES)) {
      const list = palms.filter((p) => p.row === row)
      for (let v = 0; v < 2; v++) {
        const g = kit.grow({ species: t.species, height: t.height, radius: t.radius, seed: 31 + v * 54, spray: t.spray, leaf: t.leaf, wood: t.wood, lod: 1, minTwig: 0.04, fill: 1.75 })
        root.add(set(g.geometry, list.filter((_, i) => i % 2 === v), `bank-${row}-${v}`, bankLetter))
      }
    }
  }
  return root
}

/** the plain's map in three textures over the domain: colour (fields by crop, grove floors), masks (r canal water,
    g a field drawn, b a grove floor) and rows (each plot's row direction as the double angle in r and g, its own number
    in b, at half the size: the ground draws strips and furrows along it) */
export function paintPlain(P: Plain, px = 4096): { colour: CanvasTexture; masks: CanvasTexture; rows: CanvasTexture } {
  const { x0, z0, size } = P.domain
  const k = px / size
  const to = (p: [number, number]): [number, number] => [(p[0] - x0) * k, (p[1] - z0) * k]
  const make = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement('canvas')
    c.width = px
    c.height = px
    return [c, c.getContext('2d')!]
  }
  const [cc, c2] = make(), [mc, m2] = make()
  const rc = document.createElement('canvas')
  rc.width = px / 2
  rc.height = px / 2
  const r2 = rc.getContext('2d')!
  r2.fillStyle = 'rgb(255,128,0)'
  r2.fillRect(0, 0, px / 2, px / 2)
  c2.fillStyle = 'rgb(128,128,128)'
  c2.fillRect(0, 0, px, px)
  m2.fillStyle = 'rgb(0,0,0)'
  m2.fillRect(0, 0, px, px)
  // crops about nineteen days after the spring equinox: barley green to yellow-green, wheat green, fallow silt, a field just
  // watered (damp silt, kept light enough from the air not to read as a shadow), and the river belt's plots under palms
  // with a green crop beneath them
  const crop = ['rgb(104,118,62)', 'rgb(132,132,70)', 'rgb(150,132,100)', 'rgb(108,102,78)', 'rgb(98,110,62)']
  let seed = 7
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const poly = (ctx: CanvasRenderingContext2D, pts: Array<[number, number]>): void => {
    ctx.beginPath()
    pts.forEach((p, i) => { const [x, y] = to(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
    ctx.closePath()
    ctx.fill()
  }
  // a grove floor: the silt under the palms with a thin green growth, a shade darker than the open silt but not so dark
  // that it reads from the air as a shadow (the palms' own shadows lie on it)
  for (const g of P.groves) {
    c2.fillStyle = 'rgb(120,116,82)'
    poly(c2, g as Array<[number, number]>)
    m2.fillStyle = 'rgb(0,0,255)'
    poly(m2, g as Array<[number, number]>)
  }
  let fi = 0
  for (const f of P.fields) {
    const base = crop[f.tone]!
    const j = 0.9 + rnd() * 0.2
    c2.fillStyle = base.replace(/rgb\((\d+),(\d+),(\d+)\)/, (_s, r, g, b) => `rgb(${Math.round(Number(r) * j)},${Math.round(Number(g) * j)},${Math.round(Number(b) * j)})`)
    poly(c2, f.pts as Array<[number, number]>)
    // the low earth bank and the bare silt round each plot, drier than the crop: about 5 m between two plots
    c2.strokeStyle = 'rgb(132,118,90)'
    c2.lineWidth = 1.6
    c2.stroke()
    // the rows run along the plot's longest side
    let best = 0, ang = 0
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i]!, b = f.pts[(i + 1) % f.pts.length]!
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (L > best) { best = L; ang = Math.atan2(b[1] - a[1], b[0] - a[0]) }
    }
    r2.fillStyle = `rgb(${Math.round(127.5 + 127.5 * Math.cos(2 * ang))},${Math.round(127.5 + 127.5 * Math.sin(2 * ang))},${(Math.imul(++fi, 2654435761) >>> 24) & 255})`
    r2.beginPath()
    f.pts.forEach((pt, i) => { const x = (pt[0] - x0) * k / 2, y = (pt[1] - z0) * k / 2; if (i === 0) r2.moveTo(x, y); else r2.lineTo(x, y) })
    r2.closePath()
    r2.fill()
    m2.fillStyle = f.tone === 3 ? 'rgb(0,255,0)' : 'rgb(0,200,0)'
    poly(m2, f.pts as Array<[number, number]>)
  }
  for (const c of P.canals) {
    m2.strokeStyle = 'rgb(255,0,0)'
    m2.lineWidth = Math.max(1.5, c.w * k)
    m2.lineJoin = 'round'
    m2.beginPath()
    c.pts.forEach((p, i) => { const [x, y] = to(p); if (i === 0) m2.moveTo(x, y); else m2.lineTo(x, y) })
    m2.stroke()
  }
  const tex = (c: HTMLCanvasElement, srgbData: boolean): CanvasTexture => {
    const t = new CanvasTexture(c)
    // the canvas's first row is the domain's z0 and the ground reads v = (z - z0) / size: no flip (with three's default
    // flip every field and canal lay mirrored about the domain's middle, away from its palms)
    t.flipY = false
    if (srgbData) t.colorSpace = SRGBColorSpace
    t.minFilter = LinearMipmapLinearFilter
    t.magFilter = LinearFilter
    t.anisotropy = 8
    t.generateMipmaps = true
    t.needsUpdate = true
    return t
  }
  const rows = tex(rc, false)
  // a plot's direction and number are not blended across plots by the mipmaps
  rows.minFilter = LinearFilter
  rows.generateMipmaps = false
  return { colour: tex(cc, true), masks: tex(mc, false), rows }
}
