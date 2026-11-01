/** THE ANATOMY'S CASE IN THE GREAT HALL, the museum's present-day display
 * (in 1517 the sheets were loose; single mounts date from the nineteenth
 * century): the old wing's 28 sheets in its standard mounts at its own grid
 * and spacing, in the old wing's dark fumed oak, on a low plan chest whose top
 * is the reading ledge with its bronze rail; the sheet apart on its own board
 * with the glass model's stand under it; and the warm strips hidden in both.
 *
 * Everything here is laid in the case's own frame: `a` along its face (to the
 * room's left of a visitor facing it), `d` out of the wall, `z` up from the
 * hall's floor. A place in the hall is an origin and a heading only
 * (`HALL_CASE_AT`, `HALL_PIER_AT`), so a move changes where it stands and
 * nothing it is.
 */
import { BODY_WALL_CENTRE } from './body-wall'
import { mountedSheets, plateOf, type MountedSheet } from './body-wall-plan'
import { FLOOR as PAVILION_FLOOR } from './layout'

type V2 = [number, number]

/** A place: the wall-face point the frame's origin stands on (hall u, v) and
 * the heading of the face's outward normal in the hall's plane (0 faces +v,
 * -90 degrees faces +u). */
export interface CasePlace { readonly u: number; readonly v: number; readonly heading: number }
export const HALL_CASE_AT: CasePlace = { u: 2.1, v: 0, heading: 0 }
export const HALL_PIER_AT: CasePlace = { u: 0, v: .97, heading: -Math.PI / 2 }

/** The frame's two directions in the hall's u, v plane. */
export function caseAxes(at: CasePlace): { along: V2; out: V2 } {
  return { along: [Math.cos(at.heading), Math.sin(at.heading)], out: [-Math.sin(at.heading), Math.cos(at.heading)] }
}
/** A point of the case's frame in the hall's u, v. */
export function caseToHall(at: CasePlace, a: number, d: number): V2 {
  const { along, out } = caseAxes(at)
  return [at.u + along[0] * a + out[0] * d, at.v + along[1] * a + out[1] * d]
}
/** A hall point (u, v) in the case's frame (a, d). */
export function hallToCase(at: CasePlace, u: number, v: number): V2 {
  const { along, out } = caseAxes(at), du = u - at.u, dv = v - at.v
  return [du * along[0] + dv * along[1], du * out[0] + dv * out[1]]
}

/** The case in its own frame: its run along the wall, its depth, the reading
 * ledge's height, the upper case's depth and its top under the beam's corbel.
 * The grid stands half a metre under the old wing's: the first main beam's
 * corbel lands on this wall 2.42 m up. */
export const CASE = { a0: -1.85, a1: 1.75, deep: .52, ledge: .452, upper: .3, top: 2.405 } as const
export const GRID_DROP = .5
/** the linen ground and the sheets' face off the wall; the mat over a sheet
 * and the frame's lip over the mat, as the old wing's */
export const LINEN_D = .031, SHEET_D = .034
const MAT_FACE = .0035, FRAME_LIP = .008, FRAME_FACE = .017
/** The sheet apart's board, its middle's height, the hood its strip hides in
 * and the stand, in the pier's frame. */
export const PIER = { board: [-.23, .23, 1.43, 1.97] as const, z: 1.7, hood: .16, stand: { a0: -.23, a1: .23, d0: .05, d1: .45, top: 1.04 } } as const
/** THE CASES' OWN LIGHT, present-day fittings like the cases: a warm strip
 * under the case's top board laying an even wash down the linen, and one
 * under the sheet apart's hood. Strengths are the wash on a face turned to
 * the strip; `fall` is what it loses from a case's top to its foot. */
export const CASE_LIGHT = { colour: [1, .82, .62] as [number, number, number], cabinet: .42, valve: .555, fall: .06 } as const

/** the old wing's grid read along this case: its north runs to the visitor's
 * right (-a), its heights from its own floor */
export const gridA = (north: number): number => -(north - BODY_WALL_CENTRE)
export const gridZ = (height: number): number => height - PAVILION_FLOOR - GRID_DROP

export type CaseKind = 'case' | 'frame' | 'reading' | 'linen' | 'mat' | 'bronze'
/** A box in a frame: a, d, z extents; faces named by where they lie (-y the
 * wall side, -x/+x the ends, -z/+z foot and top) are left out. */
export interface CaseBox { a0: number; a1: number; d0: number; d1: number; z0: number; z1: number; kind: CaseKind; seed: number; skip: string }
/** A turned or rod part in a frame: a lathe's centre or a rail's two ends. */
export interface CaseLathe { a: number; d: number; z: number; profile: V2[]; kind: CaseKind; seed: number }
export interface CaseRod { from: [number, number, number]; to: [number, number, number]; radius: number; kind: CaseKind; seed: number }
export interface CaseSheet { id: string; a: number; z: number; width: number; height: number }
export interface CaseLayout { boxes: CaseBox[]; lathes: CaseLathe[]; rods: CaseRod[]; sheets: CaseSheet[] }

type Rect = [number, number, number, number]
const hide = (o: { back?: boolean; a0?: boolean; a1?: boolean; z0?: boolean; z1?: boolean }): string =>
  `${o.back ? '-y' : ''}${o.a0 ? '-x' : ''}${o.a1 ? '+x' : ''}${o.z0 ? '-z' : ''}${o.z1 ? '+z' : ''}`

/** A sheet in the old wing's standard mount: the frame's four members on the
 * linen, the mat round its window, the plate a mat's depth behind. */
function mounted(out: CaseBox[], frame: Rect, window: Rect, seed: number): void {
  const [a0, a1, z0, z1] = frame, f = FRAME_FACE, dMat = SHEET_D + MAT_FACE, dLip = dMat + FRAME_LIP
  const box = (x0: number, x1: number, d1: number, y0: number, y1: number, kind: CaseKind, skip: string): void => { out.push({ a0: x0, a1: x1, d0: LINEN_D, d1, z0: y0, z1: y1, kind, seed, skip }) }
  box(a0, a1, dLip, z1 - f, z1, 'frame', hide({ back: true }))
  box(a0, a1, dLip, z0, z0 + f, 'frame', hide({ back: true }))
  box(a0, a0 + f, dLip, z0 + f, z1 - f, 'frame', hide({ back: true, z0: true, z1: true }))
  box(a1 - f, a1, dLip, z0 + f, z1 - f, 'frame', hide({ back: true, z0: true, z1: true }))
  const [b0, b1, y0, y1] = window, m0 = a0 + f, m1 = a1 - f, n0 = z0 + f, n1 = z1 - f
  box(m0, m1, dMat, y1, n1, 'mat', hide({ back: true, a0: true, a1: true, z1: true }))
  box(m0, m1, dMat, n0, y0, 'mat', hide({ back: true, a0: true, a1: true, z0: true }))
  box(m0, b0, dMat, y0, y1, 'mat', hide({ back: true, a0: true, z0: true, z1: true }))
  box(b1, m1, dMat, y0, y1, 'mat', hide({ back: true, a1: true, z0: true, z1: true }))
}
/** The old wing's frame and window of a sheet, along a case's face. */
function rects(m: MountedSheet, along: (north: number) => number, up: (height: number) => number): { frame: Rect; window: Rect } {
  const r = (n0: number, n1: number, z0: number, z1: number): Rect => { const a = along(n0), b = along(n1); return [Math.min(a, b), Math.max(a, b), up(z0), up(z1)] }
  return { frame: r(m.frame.south, m.frame.north, m.frame.bottom, m.frame.top), window: r(m.window.south, m.window.north, m.window.bottom, m.window.top) }
}

/** THE CASE: the plan chest whose top is the reading ledge, its bronze rail
 * on saddles at the front edge as the old wing's; the upper case's back,
 * linen ground, sides and top board; the 28 sheets in the old wing's order,
 * column 0 at the visitor's left. */
export function caseLayout(): CaseLayout {
  const { a0, a1, deep, ledge, upper, top } = CASE, toe = .08, stile = .035, joint = .006, board = .032
  const boxes: CaseBox[] = [], rods: CaseRod[] = [], sheets: CaseSheet[] = []
  const b = (x0: number, x1: number, d0: number, d1: number, z0: number, z1: number, kind: CaseKind, seed: number, skip = ''): void => { boxes.push({ a0: x0, a1: x1, d0, d1, z0, z1, kind, seed, skip }) }
  b(a0 + .05, a1 - .05, .005, deep - .07, 0, toe, 'case', 120, '+z')
  b(a0, a1, .005, deep - .012, toe, ledge - board, 'case', 121, '+z')
  // the reading surface, fumed darker than its edge and waxed dull, and the
  // deep band at its front edge the drawers stop under
  b(a0 - .015, a1 + .015, .005, deep - .026, ledge - board, ledge, 'reading', 122)
  b(a0 - .015, a1 + .015, deep - .026, deep + .008, ledge - board - .034, ledge, 'case', 119)
  const stacks = 4, rows = 2, w = (a1 - a0 - (stacks + 1) * stile) / stacks, h = (ledge - board - .034 - toe - (rows + 1) * joint) / rows
  for (let i = 0; i <= stacks; i++) b(a0 + i * (w + stile), a0 + i * (w + stile) + stile, deep - .012, deep, toe, ledge - board - .034, 'case', 123, '-y-z+z')
  for (let i = 0; i < stacks; i++) {
    const s0 = a0 + stile + i * (w + stile)
    b(s0, s0 + w, deep - .012, deep - .004, toe, toe + joint, 'case', 124, '-y-x+x-z')
    for (let j = 0; j < rows; j++) {
      const z = toe + joint + j * (h + joint)
      b(s0 + .002, s0 + w - .002, deep - .012, deep - .003, z, z + h, 'case', 130 + i * rows + j, '-y')
      b(s0 + w / 2 - .045, s0 + w / 2 + .045, deep - .003, deep + .009, z + h * .58, z + h * .58 + .014, 'bronze', 160 + j, '-y')
    }
  }
  // the rail rides the band's top arris on saddles about 0.7 m apart
  const railR = .014, railD = deep + .004, railZ = ledge + railR + .004
  rods.push({ from: [a0 + .06, railD, railZ], to: [a1 - .06, railD, railZ], radius: railR, kind: 'bronze', seed: 165 })
  const saddles = Math.max(2, Math.round((a1 - a0 - .12) / .7) + 1)
  for (let k = 0; k < saddles; k++) {
    const x = a0 + .06 + .03 + k * (a1 - a0 - .18) / (saddles - 1)
    b(x - .015, x + .015, railD - .012, railD + .012, ledge, railZ - railR + .002, 'bronze', 166, '-z')
  }
  // THE UPPER CASE: the back, the linen ground, the sides and a top board a
  // hand under the beam's corbel
  b(a0, a1, .005, LINEN_D - .006, ledge, top - .03, 'case', 125, '-z+z')
  b(a0 + .05, a1 - .05, LINEN_D - .006, LINEN_D, ledge, top - .03, 'linen', 126, '-y-x+x-z+z')
  for (const [x0, x1] of [[a0, a0 + .05], [a1 - .05, a1]] as V2[]) b(x0, x1, LINEN_D - .006, upper, ledge, top - .03, 'case', 127, '-z+z-y')
  b(a0 - .02, a1 + .02, .005, upper + .02, top - .03, top, 'case', 129)
  for (const [k, m] of mountedSheets().entries()) {
    if (m.mount.row === 'vortex') continue
    const { frame, window } = rects(m, gridA, gridZ)
    mounted(boxes, frame, window, 200 + k)
    const plate = plateOf(m.mount)
    sheets.push({ id: m.mount.id, a: gridA(m.mount.north), z: gridZ(m.mount.datum), width: plate.width, height: plate.height })
  }
  return { boxes, lathes: [], rods, sheets }
}

/** THE SHEET APART on its pier: its board, linen field and mount, the hood
 * the strip hides under, and the museum's stand with the model's turned foot. */
export function pierLayout(): CaseLayout {
  const m = mountedSheets().find(x => x.mount.row === 'vortex')
  const boxes: CaseBox[] = [], sheets: CaseSheet[] = []
  if (!m) return { boxes, lathes: [], rods: [], sheets }
  const b = (x0: number, x1: number, d0: number, d1: number, z0: number, z1: number, kind: CaseKind, seed: number, skip = ''): void => { boxes.push({ a0: x0, a1: x1, d0, d1, z0, z1, kind, seed, skip }) }
  const [b0, b1, z0, z1] = PIER.board
  b(b0, b1, .005, LINEN_D - .006, z0, z1, 'case', 140)
  b(b0 + .03, b1 - .03, LINEN_D - .006, LINEN_D, z0 + .03, z1 - .03, 'linen', 141, '-y')
  // the pier's own frame runs its a against the old wing's north
  const along = (n: number): number => -(n - m.mount.north), up = (hgt: number): number => PIER.z + (hgt - m.mount.datum)
  const { frame, window } = rects(m, along, up)
  mounted(boxes, frame, window, 142)
  const plate = plateOf(m.mount)
  sheets.push({ id: m.mount.id, a: 0, z: PIER.z, width: plate.width, height: plate.height })
  const hood = PIER.hood
  b(b0 - .02, b1 + .02, .005, hood, z1, z1 + .03, 'case', 147)
  for (const [x0, x1] of [[b0 - .02, b0], [b1, b1 + .02]] as V2[]) b(x0, x1, .005, hood - .01, z0 - .02, z1, 'case', 148, '+z')
  const { a0, a1, d0, d1, top } = PIER.stand, leg = .035, inset = .03
  const lathes: CaseLathe[] = [{ a: (a0 + a1) / 2, d: (d0 + d1) / 2, z: top, profile: [[.1, 0], [.105, .0075], [.1, .0175], [.0825, .025], [.0775, .035], [0, .035]], kind: 'case', seed: 146 }]
  b(a0, a1, d0, d1, top - .025, top, 'case', 143)
  b(a0 + inset, a1 - inset, d0 + inset, d1 - inset, top - .1, top - .025, 'case', 144, '+z')
  for (const [x, y] of [[a0 + inset, d0 + inset], [a1 - inset - leg, d0 + inset], [a0 + inset, d1 - inset - leg], [a1 - inset - leg, d1 - inset - leg]] as V2[])
    b(x, x + leg, y, y + leg, 0, top - .1, 'case', 145, '+z')
  return { boxes, lathes, rods: [], sheets }
}

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const inside = (x: number, lo: number, hi: number): number => smooth(lo - .004, lo + .004, x) * (1 - smooth(hi - .004, hi + .004, x))
/** What the strips lay on a point in a frame: (a, d, z) and the normal's
 * share along, out and up. The shader's node is the same sum. */
export function caseWashLocal(a: number, d: number, z: number, nAlong: number, nOut: number, nUp: number): number {
  const C = CASE, L = CASE_LIGHT, cTop = C.top - .03
  return inside(a, C.a0 + .045, C.a1 - .045) * inside(d, -.01, C.upper + .01) * inside(z, C.ledge - .006, cTop)
    * (Math.min(1, Math.max(0, nOut + nUp * .5)) + Math.abs(nAlong) * .45) * (1 - (cTop - z) / (cTop - C.ledge) * L.fall) * L.cabinet
}
export function pierWashLocal(a: number, d: number, z: number, nAlong: number, nOut: number, nUp: number): number {
  const L = CASE_LIGHT, [b0, b1, z0, z1] = PIER.board
  return inside(d, -.01, PIER.hood + .01) * inside(a, b0, b1) * inside(z, z0 - .006, z1)
    * (Math.min(1, Math.max(0, nOut + nUp * .5)) + Math.abs(nAlong) * .45) * (1 - (z1 - z) / (z1 - z0) * L.fall) * L.valve
}
