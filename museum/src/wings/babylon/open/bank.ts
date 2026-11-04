/* THE BANKS UNDER THE FIRST FRAMES, finer: the map's ground grid (6 m) is coarser than the river's banks (a drop of about
   6.5 m over about 6 m), so each bank cell tilts by its triangle and the shore reads as a row of dashes from the air. Inside
   a box, every steep cell and its neighbours are cut into cells of about a metre, their normals from the ground itself. The
   refined set's outer edges keep the coarse grid's straight edges, so the two meshes meet without a crack. */

import { BufferGeometry, Float32BufferAttribute } from 'three'

export interface BankBox { x0: number; x1: number; z0: number; z1: number }

export function refineBanks(g: BufferGeometry, ground: (x: number, z: number) => number, box: BankBox, opts: { steep?: number; cell?: number; soft?: number } = {}): { geometry: BufferGeometry; cells: number; triangles: number } {
  const steep = opts.steep ?? 1.2, cell = opts.cell ?? 1.0
  const P = g.getAttribute('position')
  const Nrm = g.getAttribute('normal')
  const total = P.count
  // the grid's lines: row 0 holds the x lines, column 0 the z lines
  let nx = 1
  while (nx < total && P.getZ(nx) === P.getZ(0)) nx++
  const nz = total / nx
  const xs: number[] = [], zs: number[] = []
  for (let i = 0; i < nx; i++) xs.push(P.getX(i))
  for (let j = 0; j < nz; j++) zs.push(P.getZ(j * nx))
  const h = (i: number, j: number): number => P.getY(j * nx + i)
  const i0 = xs.findIndex((x) => x >= box.x0), i1 = xs.findIndex((x) => x >= box.x1)
  const j0 = zs.findIndex((z) => z >= box.z0), j1 = zs.findIndex((z) => z >= box.z1)
  // the steep cells, then their neighbours (a vertex on the set's rim is then never a corner of a steep cell)
  const key = (i: number, j: number): number => j * nx + i
  const steepSet = new Set<number>()
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1)
    if (Math.max(a, b, c, d) - Math.min(a, b, c, d) > steep) steepSet.add(key(i, j))
  }
  const R = new Set<number>()
  for (const k of steepSet) {
    const i = k % nx, j = (k - i) / nx
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj
      if (ii >= i0 && ii < i1 && jj >= j0 && jj < j1) R.add(key(ii, jj))
    }
  }
  const inR = (i: number, j: number): boolean => R.has(key(i, j))
  // the coarse mesh without the refined cells (its index runs a, c, b, b, c, d per cell, as the map builds it)
  const idx = g.getIndex()!
  const keep: number[] = []
  for (let t = 0; t < idx.count; t += 6) {
    const a = idx.getX(t)
    const i = a % nx, j = (a - i) / nx
    if (inR(i, j)) continue
    for (let q = 0; q < 6; q++) keep.push(idx.getX(t + q))
  }
  // the fine vertices, shared between refined cells by their place on the fine lattice
  const kx = (i: number): number => Math.max(1, Math.ceil((xs[i + 1]! - xs[i]!) / cell))
  const kz = (j: number): number => Math.max(1, Math.ceil((zs[j + 1]! - zs[j]!) / cell))
  const pos: number[] = [], nrm: number[] = []
  for (let v = 0; v < total; v++) {
    pos.push(P.getX(v), P.getY(v), P.getZ(v))
    nrm.push(Nrm.getX(v), Nrm.getY(v), Nrm.getZ(v))
  }
  const fine = new Map<string, number>()
  // the normals' half step, wider than a cell: at half a cell the crest's shading followed the lattice's diagonals as fine teeth
  const e = opts.soft ?? 1.5
  const vertex = (i: number, a: number, j: number, b: number): number => {
    // normalise to the lattice's own corner names so neighbouring cells share their edges
    if (a === kx(i) && i + 1 < nx) { i++; a = 0 }
    if (b === kz(j) && j + 1 < nz) { j++; b = 0 }
    if (a === 0 && b === 0) return j * nx + i
    const id = `${i}:${a}:${j}:${b}`
    const got = fine.get(id)
    if (got !== undefined) return got
    const x = a === 0 ? xs[i]! : xs[i]! + ((xs[i + 1]! - xs[i]!) * a) / kx(i)
    const z = b === 0 ? zs[j]! : zs[j]! + ((zs[j + 1]! - zs[j]!) * b) / kz(j)
    // on a coarse edge whose other side stays coarse, the height follows the coarse edge
    let y: number
    if (b === 0 && !(inR(i, j) && inR(i, j - 1))) y = h(i, j) + ((h(i + 1, j) - h(i, j)) * a) / kx(i)
    else if (a === 0 && !(inR(i, j) && inR(i - 1, j))) y = h(i, j) + ((h(i, j + 1) - h(i, j)) * b) / kz(j)
    else y = ground(x, z)
    const gx = (ground(x + e, z) - ground(x - e, z)) / (2 * e), gz = (ground(x, z + e) - ground(x, z - e)) / (2 * e)
    const L = Math.hypot(gx, 1, gz)
    const n = pos.length / 3
    pos.push(x, y, z)
    nrm.push(-gx / L, 1 / L, -gz / L)
    fine.set(id, n)
    return n
  }
  // a coarse corner with refined cells all round belongs to no coarse triangle any more: its normal from the ground too
  for (const k of R) {
    const i = k % nx, j = (k - i) / nx
    if (!(inR(i - 1, j) && inR(i, j - 1) && inR(i - 1, j - 1))) continue
    const x = xs[i]!, z = zs[j]!
    const gx = (ground(x + e, z) - ground(x - e, z)) / (2 * e), gz = (ground(x, z + e) - ground(x, z - e)) / (2 * e)
    const L = Math.hypot(gx, 1, gz), v = j * nx + i
    nrm[v * 3] = -gx / L
    nrm[v * 3 + 1] = 1 / L
    nrm[v * 3 + 2] = -gz / L
  }
  let tris = 0
  for (const k of R) {
    const i = k % nx, j = (k - i) / nx
    const KX = kx(i), KZ = kz(j)
    for (let b = 0; b < KZ; b++) for (let a = 0; a < KX; a++) {
      const A = vertex(i, a, j, b), B = vertex(i, a + 1, j, b), C = vertex(i, a, j, b + 1), D = vertex(i, a + 1, j, b + 1)
      keep.push(A, C, B, B, C, D)
      tris += 2
    }
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new Float32BufferAttribute(nrm, 3))
  out.setIndex(keep)
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return { geometry: out, cells: R.size, triangles: tris }
}
