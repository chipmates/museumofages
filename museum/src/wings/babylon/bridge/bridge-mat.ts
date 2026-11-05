/* STOP 12'S MATERIALS (TSL), on the gate's kit (its filtered lines, hash and colours): one material for every body of
   the stop, branching on the body's `kind` attribute and the face's own data, never on screen derivatives.
     0 the piers and land piers   baked brick 31 cm square in courses of bitumen, crisp (a few decades old), a wet band
                                  and a silt film where the spring water stands; the land piers' tops paved in brick
     1 the capping                stone slabs, pale, dusty on top (Guessed)
     2 the beams                  squared timbers, weathered, the grain along them (Guessed)
     3 the boards                 plain boards across the beams, weathered grey-brown, dust, a walked middle (Guessed)
     4 the quay                   the king's 33 cm brick in bitumen, smooth; its walkway and top laid flat; the two
                                  stairways' outlines in the face
   The river's water is the opening's (open/earth.ts waterMaterial) with the stop's look; the ground's paint below.
   Every line is box-filtered over one device pixel's footprint on the surface, so the jittered sub-frames agree. */

import { MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { PAL, footprint, hash2, lines } from '../gate/gate-mat'
import { classColour, greyNode, uView, type ClassTones } from '../map/mass'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const T = TSL as unknown as Record<string, N>
const { abs, attribute, clamp, dot, float, floor, fract, max, min, mix, mx_noise_float, normalize, positionWorld, smoothstep, step, uniform, vec3 } = T

type RGB = [number, number, number]
const V = (c: RGB): N => vec3(...c)

/** one device pixel's angle (radians), set by the page for each frame's size and lens */
export const uBridgePix = uniform(0.0003)
export function setBridgePixel(vfovDeg: number, heightPx: number): void {
  uBridgePix.value = (2 * Math.tan(((vfovDeg / 2) * Math.PI) / 180)) / heightPx
}
const U = { uPix: uBridgePix }
const seen = (fw: N, size: number): N => float(1).sub(smoothstep(size * 0.25, size, fw))

/** a running bond of square bricks of side L in courses of C on a face: joints and each brick's own number */
function bondOf(u: N, y: N, L: number, C: number, half: number, fu: N, fy: N): { joint: N; cell: N; row: N } {
  const row = floor(y.div(C))
  const shift = fract(row.mul(0.5)).mul(L)
  const bed = lines(y, C, half, fy)
  const headRaw = lines(u.add(shift), L, half, fu)
  // under a pixel the head joints take their mean, so far courses never shimmer
  const head = mix(headRaw, float((2 * half) / L), smoothstep(C * 0.3, C * 0.9, fy))
  return { joint: clamp(max(bed, head), 0, 1), cell: hash2(floor(u.add(shift).div(L)), row), row }
}

export interface BridgeFrame { a: [number, number]; d: [number, number]; n: [number, number] }

export function bridgeMaterial(F: BridgeFrame, bp: J, waterLevel: number, tones: ClassTones): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 })
  const P = positionWorld
  // the meshes stand untransformed, so the geometry's normal is the world's
  const n = normalize(attribute('normal', 'vec3'))
  const kind = attribute('kind', 'float')
  const fa = attribute('fa', 'vec4')
  const is = (k: number): N => step(abs(kind.sub(k)), 0.5)
  const up = smoothstep(0.55, 0.85, n.y)
  const col = bp.colours
  const tan = normalize(vec3(n.z.negate(), 0, n.x).add(vec3(1e-5, 0, 0)))
  const uFace = dot(P, tan)
  const fu = footprint(U, tan, n), fy = footprint(U, vec3(0, 1, 0), n)
  const fw = max(fu, fy)
  const fFlat = max(footprint(U, vec3(1, 0, 0), vec3(0, 1, 0)), footprint(U, vec3(0, 0, 1), vec3(0, 1, 0)))
  // the axis' frame: t along the bridge (west), c across it (north)
  const rx = P.x.sub(F.a[0]), rz = P.z.sub(F.a[1])
  const tA = rx.mul(F.d[0]).add(rz.mul(F.d[1])), cA = rx.mul(F.n[0]).add(rz.mul(F.n[1]))
  const WL = waterLevel
  const dust = V(PAL.dust as RGB)
  const asphalt = V(PAL.asphalt as RGB)

  /** water's marks on a face: wet just above the line, a silt film up to the spring's high water */
  const waterMarks = (c: N): N => {
    const above = P.y.sub(WL)
    const wave = mx_noise_float(vec3(uFace.mul(0.6), 1.7, P.z.mul(0.1))).mul(0.06)
    const film = float(1).sub(smoothstep(0.45, 0.75, above.add(wave)))
    const wet = float(1).sub(smoothstep(0.02, 0.22, above.add(wave.mul(0.5))))
    const silt = mix(c, mix(c, V(col.silt), 0.55), film.mul(0.8))
    return mix(silt, silt.mul(vec3(0.5, 0.48, 0.46)), wet)
  }

  /* ── 0 the piers' brick: 31 cm square, courses of bitumen; the land piers' faces and their paved tops ── */
  const onPier = step(-0.5, fa.z)
  const uB = mix(uFace, fa.x, onPier)
  const b0 = bondOf(uB, P.y, bp.brick.size, bp.brick.course, 0.0065, fu, fy)
  const firing = b0.cell.sub(0.5).mul(0.22).mul(seen(fw, 0.4))
  const batch = mx_noise_float(vec3(uB.mul(0.05), P.y.mul(0.6), fa.z.mul(3.1).add(1.3)))
  const courses = mx_noise_float(vec3(uB.mul(0.02), P.y.mul(2.2), 4.4)).mul(0.06)
  let brick: N = mix(V(col.brick), V(PAL.redBrown as RGB), clamp(float(0.18).add(batch.mul(0.2)).add(firing), 0, 0.65)).mul(float(1).add(batch.mul(0.05)).add(courses))
  // bitumen in the joints, a little earth strewn on it before the next course went on
  const jointC = mix(asphalt.mul(1.6), dust.mul(0.5), 0.25)
  brick = mix(brick, jointC, b0.joint.mul(0.85))
  brick = waterMarks(brick)
  // the land piers' tops: brick laid flat in bitumen under a film of dust, the walked middle a little cleaner
  const kT = floor(tA.div(bp.brick.size)), tB = cA.add(fract(kT.mul(0.5)).mul(bp.brick.size))
  const jTop = clamp(lines(tA, bp.brick.size, 0.006, fFlat).add(lines(tB, bp.brick.size, 0.006, fFlat)), 0, 1)
  const hTop = hash2(floor(tB.div(bp.brick.size)), kT)
  const flatB = mix(V(col.brick), V(PAL.redBrown as RGB), clamp(float(0.25).add(hTop.sub(0.5).mul(0.3).mul(seen(fFlat, 0.3))), 0, 1)).mul(0.92)
  const walked = float(1).sub(smoothstep(1.5, 4.0, abs(cA).add(mx_noise_float(vec3(tA.mul(0.1), 2.0, 0)).mul(0.8))))
  const topDust = clamp(float(0.45).sub(walked.mul(0.2)).add(mx_noise_float(vec3(tA.mul(0.3), 5.1, cA.mul(0.3))).mul(0.15)), 0.1, 0.7)
  let pave: N = mix(flatB, jointC, jTop.mul(0.7))
  pave = mix(pave, dust.mul(1.15), topDust)
  const brickCol = mix(brick, pave, up)

  /* ── 1 the capping: stone slabs, joints on top in the axis' frame, along the sides by the ring ── */
  const slab = bp.capping.slab as [number, number]
  const side = step(0.5, fa.w)
  const sj = mix(clamp(lines(fa.x, slab[0], 0.008, fFlat).add(lines(fa.y.add(fract(floor(fa.x.div(slab[0])).mul(0.5)).mul(slab[1])), slab[1], 0.008, fFlat)), 0, 1),
    lines(fa.x, slab[0], 0.008, fu), side)
  const sCell = mix(hash2(floor(fa.x.div(slab[0])), floor(fa.y.div(slab[1])).add(fa.z.mul(7))), hash2(floor(fa.x.div(slab[0])), fa.z.add(3)), side)
  const stoneN = mx_noise_float(P.mul(1.7)).mul(0.05).add(mx_noise_float(P.mul(0.3)).mul(0.05))
  let stone: N = V(col.stone).mul(float(1).add(sCell.sub(0.5).mul(0.26).mul(seen(fw, 0.6))).add(stoneN))
  // weathered: darker mottling from rain, soot and bitumen dripped where the deck's timbers lay
  const mottle = smoothstep(0.05, 0.45, mx_noise_float(P.mul(0.9)).add(mx_noise_float(P.mul(3.1)).mul(0.35)))
  stone = mix(stone, stone.mul(vec3(0.72, 0.68, 0.64)), mottle.mul(0.5))
  stone = mix(stone, stone.mul(0.5), sj.mul(0.75))
  stone = mix(stone, mix(stone, dust.mul(1.1), 0.3), up)

  /* ── 2 the beams: squared timbers, grain along them, their faces weathered unevenly ── */
  const along = fa.x
  const grain = mx_noise_float(vec3(along.mul(0.35), P.y.mul(14), fa.y.mul(14))).mul(seen(fw, 0.02)).mul(0.12)
  const streak = mx_noise_float(vec3(along.mul(0.05), fa.z.mul(1.7), 2.2)).mul(0.1)
  const beam = V(col.timber).mul(float(0.85).add(hash2(fa.z, float(5)).mul(0.25)).add(grain).add(streak))

  /* ── 3 the boards: across the axis, 30 cm, joints dark, each board its own tone, dust and a walked middle ── */
  const bw: number = bp.deck.board
  const bIdx = floor(fa.x.div(bw))
  const bJoint = lines(fa.x, bw, 0.007, max(fFlat, fu))
  const bTone = hash2(bIdx, float(11)).sub(0.5).mul(0.22).add(hash2(bIdx, float(23)).sub(0.5).mul(0.08))
  const bGrain = mx_noise_float(vec3(fa.x.mul(6), 0.7, fa.y.mul(0.5))).mul(0.07).mul(seen(fFlat, 0.03))
  let board: N = V(col.boards).mul(float(1).add(bTone).add(bGrain))
  // planks weathered silver at their ends and edges, darker where they meet the beams below
  board = mix(board, board.mul(vec3(1.1, 1.08, 1.05)), smoothstep(3.6, 4.5, abs(fa.y)).mul(0.5))
  board = mix(board, board.mul(0.45), bJoint.mul(0.75))
  const bWalk = float(1).sub(smoothstep(0.8, 3.0, abs(fa.y.sub(mx_noise_float(vec3(fa.x.mul(0.05), 4.0, 0)).mul(0.6)))))
  const bDust = clamp(float(0.32).add(mx_noise_float(vec3(fa.x.mul(0.25), 7.7, fa.y.mul(0.4))).mul(0.18)).sub(bWalk.mul(0.18)).add(smoothstep(3.0, 4.5, abs(fa.y)).mul(0.15)), 0.05, 0.6)
  board = mix(board, dust.mul(1.12), bDust.mul(up))

  /* ── 4 the quay: the king's brick on the faces, laid flat on the walkway and the top; the stairways' outlines ── */
  const part = fa.y
  const sQ = fa.x
  const q0 = bondOf(mix(sQ, uFace, step(4.5, part)), P.y, 0.33, 0.086, 0.007, fu, fy)
  const qFiring = q0.cell.sub(0.5).mul(0.18).mul(seen(fw, 0.4))
  const qBatch = mx_noise_float(vec3(sQ.mul(0.03), P.y.mul(0.4), 6.6))
  let qBrick: N = mix(V(col.quay), V(PAL.redBrown as RGB), clamp(float(0.12).add(qBatch.mul(0.15)).add(qFiring), 0, 0.6)).mul(float(1).add(qBatch.mul(0.05)))
  qBrick = mix(qBrick, jointC, q0.joint.mul(0.8))
  // the stairways in the old wall, walled up later: a slanting band of other brick framed by a dark line
  for (const st of bp.quay.stairs as Array<{ s: number; w: number; run: number }>) {
    const ds = sQ.sub(st.s)
    const yAt = float(bp.quay.top).sub(ds.add(st.run / 2).div(st.run).mul(bp.quay.top - bp.quay.walkwayFront))
    const inBand = step(abs(ds), st.run / 2).mul(step(abs(P.y.sub(yAt)), st.w / 2)).mul(step(1.5, part)).mul(step(part, 2.5))
    const rim = inBand.mul(float(1).sub(step(abs(P.y.sub(yAt)), st.w / 2 - 0.06)).add(float(1).sub(step(abs(ds), st.run / 2 - 0.06))).min(1))
    qBrick = mix(qBrick, qBrick.mul(vec3(0.9, 0.86, 0.82)), inBand.mul(0.6))
    qBrick = mix(qBrick, jointC, rim.mul(0.8))
  }
  qBrick = waterMarks(qBrick)
  const qTop = mix(mix(V(col.quay), dust, 0.45).mul(float(1).add(mx_noise_float(P.mul(0.4)).mul(0.08))), jointC, clamp(lines(P.x, 0.33, 0.006, fFlat).add(lines(P.z, 0.33, 0.006, fFlat)), 0, 1).mul(0.4))
  const quayCol = mix(qBrick, waterMarks(qTop), up)

  let c: N = greyNode(0.42)
  c = mix(c, brickCol, is(0))
  c = mix(c, stone, is(1))
  c = mix(c, beam, is(2))
  c = mix(c, board, is(3))
  c = mix(c, quayCol, is(4))
  m.colorNode = mix(c, classColour(tones, attribute('cls', 'vec2'), attribute('band', 'float')), uView)
  // wet brick at the waterline keeps a faint sheen; everything else matte
  const wetSheen = float(1).sub(smoothstep(0.0, 0.2, P.y.sub(WL))).mul(max(is(0), is(4)))
  m.roughnessNode = mix(mix(float(0.9), float(0.55), wetSheen), float(0.92), uView)
  // the contact the stack does not carry: under the boards' edge and the capping's lip
  const under = float(1).sub(step(0.0, n.y.negate().sub(0.5)).mul(0.35))
  m.aoNode = mix(under, float(1), uView)
  void min
  return m
}
