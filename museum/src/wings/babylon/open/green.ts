/* THE GREEN OF THE ARRIVAL: the date palm made in code (no open model exists,
   MAT), set out as `plain.ts` places them, and the plain's map (fields, canals
   and grove floors) painted once into two textures the ground reads. A palm:
   a tapered trunk with the leaf bases' scale pattern left to the material, a
   crown of long arching fronds, the oldest hanging brown below (on Ashurbanipal's
   relief BM 124920 the date palms have scaled trunks and a crown of long fronds,
   GREEN.settled bab.green.palm.plain). Sizes ours: trunk 9 to 15 m, fronds 4 m. */

import { BufferGeometry, CanvasTexture, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, Quaternion, SRGBColorSpace, Vector3, type Material } from 'three/webgpu'
import type { Plain, Palm } from './plain'

/** one palm, 12 m to the crown, its parts tagged: 0 trunk, 1 green frond, 2 dry frond */
export function palmGeometry(): BufferGeometry {
  const pos: number[] = [], part: number[] = []
  const H = 12, sides = 5
  const ring = (y: number, r: number): number[][] => Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2
    return [Math.cos(a) * r, y, Math.sin(a) * r]
  })
  const r0 = ring(-0.6, 0.34), r1 = ring(H, 0.22)
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides
    pos.push(...r0[i]!, ...r1[i]!, ...r0[j]!, ...r0[j]!, ...r1[i]!, ...r1[j]!)
    for (let k = 0; k < 6; k++) part.push(0)
  }
  // fronds: a rise, then the droop; each a strip of two quads, widest a third along, every face both sides
  const frond = (az: number, rise: number, len: number, kind: number): void => {
    const d = [Math.cos(az), Math.sin(az)], n = [-d[1]!, d[0]!]
    const at = (t: number): number[] => {
      const r = len * t
      const y = H + rise * len * t - (1.0 + (kind === 2 ? 0.9 : 0)) * len * t * t
      return [d[0]! * r, y, d[1]! * r]
    }
    const width = [0.12, 0.55, 0.12]
    const ts = [0.0, 0.38, 1.0]
    const L: number[][] = [], R: number[][] = []
    ts.forEach((t, k) => {
      const c = at(t)
      L.push([c[0]! + n[0]! * width[k]!, c[1]! + (k === 1 ? 0.12 : 0), c[2]! + n[1]! * width[k]!])
      R.push([c[0]! - n[0]! * width[k]!, c[1]! + (k === 1 ? 0.12 : 0), c[2]! - n[1]! * width[k]!])
    })
    for (let k = 0; k < 2; k++) {
      pos.push(...L[k]!, ...R[k]!, ...L[k + 1]!, ...L[k + 1]!, ...R[k]!, ...R[k + 1]!)
      for (let q = 0; q < 6; q++) part.push(kind)
    }
  }
  const N = 11
  for (let i = 0; i < N; i++) {
    const az = (i / N) * Math.PI * 2 + (i % 2) * 0.21
    frond(az, i % 3 === 0 ? 1.1 : 0.75, 3.6 + (i % 4) * 0.25, 1)
  }
  for (let i = 0; i < 4; i++) frond((i / 4) * Math.PI * 2 + 0.4, 0.1, 2.4, 2)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('pk', new Float32BufferAttribute(part, 1))
  g.computeVertexNormals()
  return g
}

/** the palms as one instanced mesh: each its own size, turn and lean, its row's class letters per instance */
export function palmMesh(palms: Palm[], ground: (x: number, z: number) => number, mat: Material): InstancedMesh {
  const geo = palmGeometry()
  const im = new InstancedMesh(geo, mat, Math.max(1, palms.length))
  const cls = new Float32Array(palms.length * 2), band = new Float32Array(palms.length)
  const m = new Matrix4(), q = new Quaternion(), e = new Vector3()
  palms.forEach((p, i) => {
    const y = ground(p.x, p.z)
    q.setFromAxisAngle(e.set(Math.cos(p.yaw), 0, Math.sin(p.yaw)).normalize(), p.lean)
    m.compose(new Vector3(p.x, y, p.z), q, new Vector3(p.s, p.s, p.s))
    im.setMatrixAt(i, m)
    // the groves outside the walls are Known as a mass (R), the palms inside the walls and in the outer city's gardens Guessed (G)
    const k = p.row === 'canal' || p.row === 'river' ? 1 : 2
    cls[i * 2] = k
    cls[i * 2 + 1] = k
    band[i] = y + 0.5
  })
  geo.setAttribute('cls', new InstancedBufferAttribute(cls, 2))
  geo.setAttribute('band', new InstancedBufferAttribute(band, 1))
  im.instanceMatrix.needsUpdate = true
  im.castShadow = true
  im.receiveShadow = true
  im.frustumCulled = false
  im.name = 'palms-plain'
  return im
}

/** the plain's map in two textures over the domain: colour (fields by crop, grove floors) and masks (r canal water,
    g a field drawn, b a grove floor) */
export function paintPlain(P: Plain, px = 4096): { colour: CanvasTexture; masks: CanvasTexture } {
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
  c2.fillStyle = 'rgb(128,128,128)'
  c2.fillRect(0, 0, px, px)
  m2.fillStyle = 'rgb(0,0,0)'
  m2.fillRect(0, 0, px, px)
  // crops about twenty days after the spring equinox: barley green to yellow-green, wheat green, fallow silt, a field just watered
  const crop = ['rgb(104,118,62)', 'rgb(132,132,70)', 'rgb(150,132,100)', 'rgb(88,84,66)']
  let seed = 7
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const poly = (ctx: CanvasRenderingContext2D, pts: Array<[number, number]>): void => {
    ctx.beginPath()
    pts.forEach((p, i) => { const [x, y] = to(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
    ctx.closePath()
    ctx.fill()
  }
  for (const g of P.groves) {
    c2.fillStyle = 'rgb(92,90,66)'
    poly(c2, g as Array<[number, number]>)
    m2.fillStyle = 'rgb(0,0,255)'
    poly(m2, g as Array<[number, number]>)
  }
  for (const f of P.fields) {
    const base = crop[f.tone]!
    const j = 0.9 + rnd() * 0.2
    c2.fillStyle = base.replace(/rgb\((\d+),(\d+),(\d+)\)/, (_s, r, g, b) => `rgb(${Math.round(Number(r) * j)},${Math.round(Number(g) * j)},${Math.round(Number(b) * j)})`)
    poly(c2, f.pts as Array<[number, number]>)
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
    if (srgbData) t.colorSpace = SRGBColorSpace
    t.minFilter = LinearMipmapLinearFilter
    t.magFilter = LinearFilter
    t.anisotropy = 8
    t.generateMipmaps = true
    t.needsUpdate = true
    return t
  }
  return { colour: tex(cc, true), masks: tex(mc, false) }
}
