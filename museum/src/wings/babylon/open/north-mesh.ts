/* THE NORTH ENTRY AS MESHES: the bodies of `north.ts` as one merged geometry
   (every vertex carries its class, band, material kind and body number) and
   the battlements as one instanced box set. Node mounts it for the checks, so
   it takes the entry as an argument and imports only three. */

import { BoxGeometry, BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Shape, ShapeUtils, Vector2, Vector3, type Material } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { MerlonRun, NorthArched, NorthEntry, NorthPrism, P2 } from './north'

const CLS = { M: 0, R: 1, G: 2 } as const

/** a body with sides that may lean in: sides, foot and top, every face outward */
function loft(p: NorthPrism): BufferGeometry {
  let foot = p.foot, top = p.top ?? p.foot
  let area = 0
  for (let i = 0; i < foot.length; i++) {
    const a = foot[i]!, b = foot[(i + 1) % foot.length]!
    area += a[0] * b[1] - b[0] * a[1]
  }
  if (area < 0) {
    foot = [...foot].reverse()
    top = [...top].reverse()
  }
  const pos: number[] = []
  const tri = (a: number[], b: number[], c: number[]): void => { pos.push(...a, ...b, ...c) }
  const n = foot.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const p0 = [foot[i]![0], p.y0, foot[i]![1]], q0 = [foot[j]![0], p.y0, foot[j]![1]]
    const p1 = [top[i]![0], p.y1, top[i]![1]], q1 = [top[j]![0], p.y1, top[j]![1]]
    tri(p0, p1, q0)
    tri(q0, p1, q1)
  }
  for (const [ring, y, up] of [[top, p.y1, 1], [foot, p.y0, -1]] as Array<[P2[], number, number]>) {
    for (const [i, j, k] of ShapeUtils.triangulateShape(ring.map(([x, z]) => new Vector2(x, z)), [])) {
      const A = [ring[i!]![0], y, ring[i!]![1]], B = [ring[j!]![0], y, ring[j!]![1]], C = [ring[k!]![0], y, ring[k!]![1]]
      const ny = (B[2]! - A[2]!) * (C[0]! - A[0]!) - (B[0]! - A[0]!) * (C[2]! - A[2]!)
      if (ny * up > 0) tri(A, B, C)
      else tri(A, C, B)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  // side faces want flat normals: split per triangle
  g.computeVertexNormals()
  return g
}

/** a cross wall's elevation (u = -c across, v = y) with its round-headed door, pushed through the wall's thickness along a */
function archedWall(w: NorthArched, frame: NorthEntry['frame']): BufferGeometry {
  const u0 = -w.c1, u1 = -w.c0, h = w.door.half
  const sh = new Shape()
  sh.moveTo(u0, w.y0)
  sh.lineTo(-h, w.y0)
  sh.lineTo(-h, w.door.spring)
  const n = 16
  for (let k = 1; k < n; k++) {
    const t = Math.PI - (k / n) * Math.PI
    sh.lineTo(h * Math.cos(t), w.door.spring + h * Math.sin(t))
  }
  sh.lineTo(h, w.door.spring)
  sh.lineTo(h, w.y0)
  sh.lineTo(u1, w.y0)
  sh.lineTo(u1, w.y1)
  sh.lineTo(u0, w.y1)
  sh.closePath()
  const g = new ExtrudeGeometry(sh, { depth: w.a1 - w.a0, bevelEnabled: false, steps: 1, curveSegments: 1 })
  g.deleteAttribute('uv')
  // shape x -> -C (so c = -u), shape y -> up, extrusion z -> along the street (A); a right-handed frame
  const { o, a: A, c: C } = frame
  const m = new Matrix4().set(
    -C[0], 0, A[0], o[0] + w.a0 * A[0],
    0, 1, 0, 0,
    -C[1], 0, A[1], o[1] + w.a0 * A[1],
    0, 0, 0, 1,
  )
  g.applyMatrix4(m)
  return g.index ? g.toNonIndexed() : g
}

function tag(g: BufferGeometry, b: { plan: keyof typeof CLS; height: keyof typeof CLS; band: number; kind: number }, id: number): BufferGeometry {
  const n = g.getAttribute('position').count
  const cls = new Float32Array(n * 2), band = new Float32Array(n), kind = new Float32Array(n), nid = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    cls[i * 2] = CLS[b.height]
    cls[i * 2 + 1] = CLS[b.plan]
    band[i] = b.band
    kind[i] = b.kind
    nid[i] = id
  }
  g.setAttribute('cls', new Float32BufferAttribute(cls, 2))
  g.setAttribute('band', new Float32BufferAttribute(band, 1))
  g.setAttribute('nk', new Float32BufferAttribute(kind, 1))
  g.setAttribute('nid', new Float32BufferAttribute(nid, 1))
  return g
}

export interface NorthMeshes {
  geometry: BufferGeometry
  /** body names by `nid` */
  bodies: string[]
  merlons: { matrices: Matrix4[]; cls: number[]; band: number[]; kind: number[]; names: string[] }
}

/** stepped battlements: a broad lower tier and a narrow upper one, every 2 m, their outer face 5 cm inside the wall's edge,
    each sunk 5 cm into what it stands on */
function merlonRows(runs: MerlonRun[]): NorthMeshes['merlons'] {
  const out: NorthMeshes['merlons'] = { matrices: [], cls: [], band: [], kind: [], names: [] }
  const up = new Vector3(0, 1, 0), q = new Quaternion()
  for (const r of runs) {
    const dx = r.to[0] - r.from[0], dz = r.to[1] - r.from[1]
    const len = Math.hypot(dx, dz)
    if (len < 2) continue
    const d = [dx / len, dz / len]
    const count = Math.max(1, Math.floor(len / 2.0))
    const step = len / count
    q.setFromAxisAngle(up, Math.atan2(-d[1]!, d[0]!))
    const tiers: Array<[number, number, number, number]> = [[1.3, 0.9, r.y - 0.05, r.y + 0.9], [0.7, 0.9, r.y + 0.85, r.y + 1.45]]
    for (let k = 0; k < count; k++) {
      const along = step * (k + 0.5)
      for (const [sa, st, y0, y1] of tiers) {
        const cx = r.from[0] + d[0]! * along + r.inward[0] * (st / 2 + 0.05)
        const cz = r.from[1] + d[1]! * along + r.inward[1] * (st / 2 + 0.05)
        out.matrices.push(new Matrix4().compose(new Vector3(cx, (y0 + y1) / 2, cz), q, new Vector3(sa, y1 - y0, st)))
        out.cls.push(CLS[r.height], CLS[r.plan])
        out.band.push(r.band)
        out.kind.push(r.kind)
        out.names.push(`${r.id}-${k}`)
      }
    }
  }
  return out
}

export function northMeshes(e: NorthEntry): NorthMeshes {
  const parts: BufferGeometry[] = [], bodies: string[] = []
  for (const p of e.prisms) {
    parts.push(tag(loft(p), p, bodies.length))
    bodies.push(p.id)
  }
  for (const w of e.arched) {
    parts.push(tag(archedWall(w, e.frame), w, bodies.length))
    bodies.push(w.id)
  }
  const geometry = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
  for (const g of parts) g.dispose()
  return { geometry, bodies, merlons: merlonRows(e.merlons) }
}

/** the battlements as one instanced mesh with their class, band and kind per instance */
export function merlonMesh(m: NorthMeshes['merlons'], mat: Material): InstancedMesh {
  const geo = new BoxGeometry(1, 1, 1)
  geo.deleteAttribute('uv')
  const im = new InstancedMesh(geo, mat, m.matrices.length)
  m.matrices.forEach((x, i) => im.setMatrixAt(i, x))
  geo.setAttribute('cls', new InstancedBufferAttribute(new Float32Array(m.cls), 2))
  geo.setAttribute('band', new InstancedBufferAttribute(new Float32Array(m.band), 1))
  geo.setAttribute('nk', new InstancedBufferAttribute(new Float32Array(m.kind), 1))
  im.instanceMatrix.needsUpdate = true
  im.castShadow = true
  im.receiveShadow = true
  im.frustumCulled = false
  im.name = 'north-merlons'
  return im
}
