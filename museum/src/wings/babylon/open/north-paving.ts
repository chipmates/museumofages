/* THE STREET'S PAVING NORTH OF THE NORTH GATE, as a surface the gate's own paving
   material lays (gate-mat.ts pavingMaterial, called, never copied): the Level 1
   street with its limestone and breccia strips and the brick outside them runs
   through the North Gate's court and doors, the walled stretch and between the
   bastions to the dam's south end (REC bab.street.north.surface, bab.paving.*:
   the slabs found in place transfer to the whole Level 1 street). It is laid in
   the lion frame (the north entry's, where the doors stand), so its local frame
   is the gate frame's kind turned onto that axis: x across (+ west), z along (+
   north), y the scene's level; the material reads its axes as sd [0, 1], st
   [1, 0]. Node mounts it for the checks: only three is imported. */

import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three/webgpu'

export type P2 = [number, number]

/** where it runs, in the lion frame: from inside the North Gate's south cross wall (where the gate sketch's paving ends) to
    the bastions' north faces at the dam's south end (REC bab.street.north.surface, bab.street.north-stretch), and its half
    width across (under the walls on both sides) */
export const NORTH_PAVED = { a0: 181.9, a1: 256, half: 17 }

export interface NorthPavingSpec {
  /** the lion frame: origin (scene x, z), along and across (+ east) unit vectors */
  frame: { o: P2; a: P2; c: P2 }
  /** along the lion axis, from and to (m), and the half width across */
  a0: number
  a1: number
  half: number
  /** the street's level at a scene point */
  level: (x: number, z: number) => number
  step?: number
}

/** the paving's surface and its local frame (local to scene); `inside` tests a scene point (for the masks and the checks) */
export function northPaving(S: NorthPavingSpec): { geometry: BufferGeometry; matrix: Matrix4; inside: (x: number, z: number) => boolean } {
  const { o, a: A, c: C } = S.frame
  const step = S.step ?? 1.5
  const toScene = (t: number, s: number): P2 => [o[0] + s * A[0] - t * C[0], o[1] + s * A[1] - t * C[1]]
  const nu = Math.ceil((2 * S.half) / step), nv = Math.ceil((S.a1 - S.a0) / step)
  const pos: number[] = [], idx: number[] = []
  for (let j = 0; j <= nv; j++) {
    const s = S.a0 + ((S.a1 - S.a0) * j) / nv
    for (let i = 0; i <= nu; i++) {
      const t = -S.half + (2 * S.half * i) / nu
      const [x, z] = toScene(t, s)
      pos.push(t, S.level(x, z), s)
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * (nu + 1) + i
      // wound so the face looks up in the local frame (x west, z north)
      idx.push(k, k + nu + 1, k + 1, k + 1, k + nu + 1, k + nu + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geometry.setIndex(idx)
  geometry.computeVertexNormals()
  const matrix = new Matrix4().makeBasis(new Vector3(-C[0], 0, -C[1]), new Vector3(0, 1, 0), new Vector3(A[0], 0, A[1]))
  matrix.setPosition(o[0], 0, o[1])
  const inside = (x: number, z: number): boolean => {
    const s = (x - o[0]) * A[0] + (z - o[1]) * A[1], c = (x - o[0]) * C[0] + (z - o[1]) * C[1]
    return s >= S.a0 && s <= S.a1 && Math.abs(c) <= S.half
  }
  return { geometry, matrix, inside }
}
