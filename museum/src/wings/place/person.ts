/* The person for size: the sign person, one piece of 1.70 m with no joints, no face and no hands.
   Local frame as the lay figure's: it faces its own +x, its width lies along z, its soles stand at y 0.
   The forms are numbers (metres); `signPerson` builds one from them in the material it is handed. */

import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, SphereGeometry, type Material, type Object3D } from 'three/webgpu'

/** a level ring: centre x, height, centre z, half depth (x), half width (z), corner radius */
type Ring = [number, number, number, number, number, number]

export interface PersonForm {
  /** crown above the soles */
  height: number
  head: number
  neck: number
  /** the trunk's width at the shoulders and at the hip, its depth, its edge radius */
  shoulders: number
  hip: number
  depth: number
  edge: number
  /** hip above the soles; a leg's width and the gap between the two */
  hipAt: number
  leg: number
  gap: number
  /** an arm's width and depth, where it ends above the soles, and the slit between arm and trunk (0: a ridge on the trunk's side) */
  arm: number
  armDepth: number
  armTo: number
  slit: number
  /** the arms are upright bars whose outer face is the shoulder's end; an arm's width is what the slit at the hip leaves of the trunk's taper */
  inside?: boolean
}

export const PERSON_FORMS: Record<'f2' | 'f3' | 's', PersonForm> = {
  f2: { height: 1.7, head: 0.22, neck: 0.04, shoulders: 0.42, hip: 0.34, depth: 0.2, edge: 0.05, hipAt: 0.8, leg: 0.15, gap: 0.04, arm: 0.07, armDepth: 0.1, armTo: 0.62, slit: 0 },
  f3: { height: 1.7, head: 0.22, neck: 0.04, shoulders: 0.42, hip: 0.34, depth: 0.2, edge: 0.05, hipAt: 0.8, leg: 0.12, gap: 0.1, arm: 0.05, armDepth: 0.08, armTo: 0.62, slit: 0.03 },
  s: { height: 1.7, head: 0.22, neck: 0.05, shoulders: 0.42, hip: 0.28, depth: 0.16, edge: 0.05, hipAt: 0.86, leg: 0.12, gap: 0.04, arm: 0.05, armDepth: 0.07, armTo: 0.67, slit: 0.02, inside: true },
}

/** one skin over level rings of rounded rectangles, closed flat at both ends */
function skin(rings: Ring[], arc = 6): BufferGeometry {
  const per = arc * 4, pos: number[] = [], idx: number[] = []
  for (const [cx, y, cz, hx, hz, r0] of rings) {
    const r = Math.max(0.0005, Math.min(r0, hx, hz))
    for (let c = 0; c < 4; c++) {
      const sx = c === 0 || c === 3 ? 1 : -1, sz = c < 2 ? 1 : -1
      for (let k = 0; k < arc; k++) {
        const a = (c * Math.PI) / 2 + ((k / (arc - 1)) * Math.PI) / 2
        pos.push(cx + sx * (hx - r) + r * Math.cos(a), y, cz + sz * (hz - r) + r * Math.sin(a))
      }
    }
  }
  const n = rings.length
  for (let i = 0; i + 1 < n; i++) for (let q = 0; q < per; q++) {
    const a = i * per + q, b = i * per + ((q + 1) % per), c = a + per, d = b + per
    idx.push(a, c, b, b, c, d)
  }
  const lo = rings[0]!, hi = rings[n - 1]!
  pos.push(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2])
  for (let q = 0; q < per; q++) {
    idx.push(n * per, q, (q + 1) % per)
    idx.push(n * per + 1, (n - 1) * per + ((q + 1) % per), (n - 1) * per + q)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** the sign person in `mat`: head, neck, trunk with sloping shoulders, two arms, two legs with flat soles; every part class 64 (the person) */
export function signPerson(F: PersonForm, mat: Material): Group {
  const g = new Group()
  const part = (geo: BufferGeometry): Mesh => {
    const m = new Mesh(geo, mat)
    m.castShadow = true
    m.receiveShadow = true
    m.userData['cls'] = 64
    g.add(m)
    return m
  }
  const crown = F.height, headR = F.head / 2, chin = crown - F.head, top = chin - F.neck
  const sh = F.shoulders / 2, hp = F.hip / 2, d = F.depth / 2, e = F.edge
  // the shoulders' full width sits 0.07 m under the neck's foot; from there they slope straight up to the neck
  const full = top - 0.07, nk = 0.055
  const slope = (k: number): Ring => [0, full + (top - full) * k, 0, d * (1 - 0.45 * k), sh + (nk - sh) * k, e * (1 - 0.6 * k)]
  const half = (y: number): number => hp + ((sh - hp) * (y - F.hipAt)) / (full - F.hipAt)
  part(skin([
    [0, F.hipAt - 0.03, 0, d, hp, e], [0, F.hipAt, 0, d, hp, e], [0, full, 0, d, sh, e],
    slope(0.25), slope(0.5), slope(0.75), slope(1),
  ]))
  const neck = part(new CylinderGeometry(0.05, 0.055, F.neck + 0.06, 24))
  neck.position.set(0, top + F.neck / 2, 0)
  const head = part(new SphereGeometry(headR, 32, 20))
  head.position.set(0, crown - headR, 0)
  for (const s of [-1, 1]) {
    // a leg: flat on the ground, its top inside the trunk
    const lz = s * (F.gap / 2 + F.leg / 2)
    part(skin([[0, 0, lz, d * 0.8, F.leg / 2, e], [0, F.hipAt + 0.02, lz, d * 0.8, F.leg / 2, e]]))
    // an arm: a ridge whose outer face is the shoulder's end, or a bar a slit clear of the trunk and of the thigh
    const apart = F.slit > 0 && !F.inside, aw = F.inside ? sh - hp - F.slit : F.arm
    const ar = Math.min(aw, F.armDepth) / 2
    const az = (y: number): number => (apart ? Math.max(half(Math.min(y, full)), hp) + F.slit + aw / 2 : sh - aw / 2)
    // a ridge or an upright bar ends just under the shoulder's end; a free arm hangs from it, its top level with it
    const armTop = apart ? full : full - 0.01
    part(skin([
      [0, F.armTo, s * az(F.armTo), F.armDepth / 2 - 0.012, aw / 2 - 0.008, ar], [0, F.armTo + 0.02, s * az(F.armTo + 0.02), F.armDepth / 2, aw / 2, ar],
      [0, F.hipAt, s * az(F.hipAt), F.armDepth / 2, aw / 2, ar], [0, armTop, s * az(armTop), F.armDepth / 2, aw / 2, ar],
    ]))
    if (apart) {
      // the free arm hangs from the shoulder: one short piece across the slit, its top the shoulder's end
      const z0 = sh - 0.06, z1 = az(armTop) + aw / 2
      part(skin([[0, armTop - 0.07, s * ((z0 + z1) / 2), F.armDepth / 2, (z1 - z0) / 2, ar], [0, armTop, s * ((z0 + z1) / 2), F.armDepth / 2, (z1 - z0) / 2, ar]]))
    }
  }
  return g
}

/** the turn about the upright axis that brings a person's front (its own +x) to face a point at eye level */
export function facing(person: Object3D, x: number, z: number): number {
  return Math.atan2(-(z - person.position.z), x - person.position.x)
}
