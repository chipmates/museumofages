/* WORN FORMS, a shared kit (pure geometry, three's buffers, no DOM): the masonry's forms the low sun and the sky can
   model, built instead of painted. A stage of the tower as a box whose faces are cut into buttress panels at the plan's
   pitch (the recesses sunk into the box, so the measured outline stays the stage's side), capped on every face by a
   coping with a lip and a drip that wraps the corners. Every vertex writes the bodies' existing attributes (`kind`,
   `fa`, `fb`), so the materials do not fork: `fa` the face's middle in plan and its outward normal (FACE), so a material
   can shade the relief by the sun itself, `fb` the stage data with the form in `fb.w` (FORM). A guard keeps the
   recesses and the coping off a face where a stair stands against it. Sizes come from the plan and are checked
   against the stops' pixel by the forge. */

import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'

/** the form a face belongs to, written into `fb.w` */
export const FORM = { plain: 0, front: 1, side: 2, back: 3, coping: 4, under: 5, top: 6 } as const

/** `fa` of a face's forms: its middle (x, z) and its outward normal (x, z) at length `lipped` where the coping's lip
    hangs over it, `open` where a stair keeps the lip off; a top shared by all four faces carries no normal */
export const FACE = { lipped: 1, open: 0.5 } as const

export interface FormsSpec {
  /** buttress panels: the pitch, the panel's share of it, the recess's depth */
  pitch: number
  share: number
  out: number
  /** the coping: its band's height over the face, the lip beyond the face, and the drip, the band's drop under
      the panels' heads, so its underside throws the rain clear (built as one block: a drip's own foot of a few cm
      is under a pixel at every stop) */
  coping: { h: number; lip: number; drip: number }
}

export interface StageBox { x: number; z: number; yaw: number; sx: number; sz: number; y0: number; y1: number }

/** the lowest level a recess may start at on face `face` over u0..u1 (the face's own frame), or the top to keep it
    whole; the coping is left off where the guard reaches its drip */
export type Guard = (face: number, u0: number, u1: number) => number

type V3 = number[]

class Soup {
  pos: number[] = []
  kind: number[] = []
  fa: number[] = []
  fb: number[] = []
  k: number
  stage: number[]
  constructor(k: number, stage: number[]) {
    this.k = k
    this.stage = stage
  }
  quad(p: V3[], f: number[], form: number, out: V3): void {
    const [a, b, c] = p as [V3, V3, V3]
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
    const q = n[0]! * out[0]! + n[1]! * out[1]! + n[2]! * out[2]! < 0 ? [p[0]!, p[3]!, p[2]!, p[1]!] : p
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(...q[i]!)
      this.kind.push(this.k)
      this.fa.push(...f)
      this.fb.push(this.stage[0]!, this.stage[1]!, this.stage[2]!, form)
    }
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('kind', new Float32BufferAttribute(this.kind, 1))
    g.setAttribute('fa', new Float32BufferAttribute(this.fa, 4))
    g.setAttribute('fb', new Float32BufferAttribute(this.fb, 4))
    g.computeVertexNormals()
    return g
  }
}

/** the recesses of one face: [u0, u1] between panels centred on the face's middle at the pitch, none in the end bays */
export function recesses(half: number, s: Pick<FormsSpec, 'pitch' | 'share'>): Array<[number, number]> {
  const bw = s.pitch * s.share, lim = half - s.pitch / 2, out: Array<[number, number]> = []
  for (let m = -Math.ceil(half / s.pitch) - 1; m <= Math.ceil(half / s.pitch); m++) {
    const r0 = m * s.pitch + bw / 2, r1 = (m + 1) * s.pitch - bw / 2
    if (r0 >= -lim - 1e-6 && r1 <= lim + 1e-6) out.push([r0, r1])
  }
  return out
}

/** the four faces of a box in its own frame: the face's middle, its direction along, outward, its half length */
export function faces(b: StageBox): Array<{ mid: [number, number]; t: [number, number]; n: [number, number]; half: number }> {
  const hx = b.sx / 2, hz = b.sz / 2
  const ring: Array<[number, number]> = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]
  return ring.map((a, k) => {
    const c = ring[(k + 1) % 4]!
    const len = Math.hypot(c[0] - a[0], c[1] - a[1])
    const mid: [number, number] = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]
    const ml = Math.hypot(mid[0], mid[1])
    return { mid, t: [(c[0] - a[0]) / len, (c[1] - a[1]) / len], n: [mid[0] / ml, mid[1] / ml], half: len / 2 }
  })
}

/** a stage as built forms: buttress panels with sunk recesses, the coping with its lip and drip, the top; `foot` the
    level the recesses run down to (under the ground or into the stage below, where the next surface closes them) */
export function buttressedStage(b: StageBox, kind: number, s: FormsSpec, stage: number[], foot: number, guard?: Guard): BufferGeometry {
  const c = Math.cos(b.yaw), sn = Math.sin(b.yaw)
  // three's rotation about y as towerBox: local (x, z) -> (x c + z s, -x s + z c)
  const W = (lx: number, lz: number, y: number): V3 => [b.x + lx * c + lz * sn, y, b.z - lx * sn + lz * c]
  const dirW = (lx: number, lz: number): V3 => [lx * c + lz * sn, 0, -lx * sn + lz * c]
  const q = new Soup(kind, stage)
  const { h: cH, lip, drip } = s.coping
  // the panels and recesses end under the coping's underside, which hangs the drip below the band
  const yt = b.y1, yd = yt - cH - drip, yc = yd
  const F = faces(b)
  F.forEach((f, k) => {
    const P = (u: number, d: number, y: number): V3 => W(f.mid[0] + f.t[0] * u + f.n[0] * d, f.mid[1] + f.t[1] * u + f.n[1] * d, y)
    const out = dirW(f.n[0], f.n[1]), along = dirW(f.t[0], f.t[1])
    const against = [-along[0]!, 0, -along[2]!], up = [0, 1, 0], down = [0, -1, 0]
    const mid = W(f.mid[0], f.mid[1], 0)
    const faOf = (lipped: boolean): number[] => { const L = lipped ? FACE.lipped : FACE.open; return [mid[0]!, mid[2]!, out[0]! * L, out[2]! * L] }
    const g = (u0: number, u1: number): number => (guard ? guard(k, u0, u1) : -Infinity)
    // the coping band: on the face plane where a stair reaches it, else with its lip and drip, mitred at the corners
    const STEP = s.pitch / 2
    const segs: Array<{ u0: number; u1: number; lip: boolean }> = []
    for (let u0 = -f.half; u0 < f.half - 1e-6; u0 += STEP) {
      const u1 = Math.min(f.half, u0 + STEP)
      const has = g(u0, u1) < yd - 0.05
      const last = segs[segs.length - 1]
      if (last && last.lip === has) last.u1 = u1
      else segs.push({ u0, u1, lip: has })
    }
    const lippedAt = (u: number): boolean => (segs.find((sg) => u >= sg.u0 - 1e-6 && u <= sg.u1 + 1e-6) ?? segs[0]!).lip
    // the face plane between the recesses (the panels and the end bays) and under a guarded recess, to the coping
    // over a stair, a hand's breadth above its highest tread, so the sill and the tread never share a plane
    const R = recesses(f.half, s).map(([u0, u1]) => { const h = g(u0, u1); return { u0, u1, y: h > foot ? h + 0.05 : foot } }).filter((r) => r.y < yc - 0.3)
    let u = -f.half
    // the face plane, cut where the lip above it starts or stops, so each piece knows whether the lip shades it
    const front = (u0: number, u1: number, y0: number, y1: number): void => {
      if (!(u1 - u0 > 1e-6 && y1 - y0 > 1e-6)) return
      const cuts = [u0, ...segs.map((sg) => sg.u0).filter((c) => c > u0 + 1e-6 && c < u1 - 1e-6), u1]
      for (let i = 0; i + 1 < cuts.length; i++) {
        const a = cuts[i]!, c = cuts[i + 1]!
        q.quad([P(a, 0, y0), P(c, 0, y0), P(c, 0, y1), P(a, 0, y1)], faOf(lippedAt((a + c) / 2)), FORM.front, out)
      }
    }
    for (const r of R) {
      front(u, r.u0, foot, yc)
      front(r.u0, r.u1, foot, r.y)
      // the recess: its back, its two sides (each facing into it), a sill where it starts over a stair, its head
      const d = -s.out, fa = faOf(lippedAt((r.u0 + r.u1) / 2))
      q.quad([P(r.u0, d, r.y), P(r.u1, d, r.y), P(r.u1, d, yc), P(r.u0, d, yc)], fa, FORM.back, out)
      q.quad([P(r.u0, d, r.y), P(r.u0, 0, r.y), P(r.u0, 0, yc), P(r.u0, d, yc)], fa, FORM.side, along)
      q.quad([P(r.u1, d, r.y), P(r.u1, 0, r.y), P(r.u1, 0, yc), P(r.u1, d, yc)], fa, FORM.side, against)
      if (r.y > foot + 1e-6) q.quad([P(r.u0, d, r.y), P(r.u1, d, r.y), P(r.u1, 0, r.y), P(r.u0, 0, r.y)], fa, FORM.top, up)
      q.quad([P(r.u0, d, yc), P(r.u1, d, yc), P(r.u1, 0, yc), P(r.u0, 0, yc)], fa, FORM.under, down)
      u = r.u1
    }
    front(u, f.half, foot, yc)
    // a mitred strip at distance d from the face reaches the corner lines only where the coping runs to the corner
    const ext = (seg: { u0: number; u1: number }, d: number): [number, number] => [seg.u0 <= -f.half + 1e-6 ? seg.u0 - d : seg.u0, seg.u1 >= f.half - 1e-6 ? seg.u1 + d : seg.u1]
    for (const seg of segs) {
      const fa = faOf(seg.lip)
      if (!seg.lip) {
        q.quad([P(seg.u0, 0, yc), P(seg.u1, 0, yc), P(seg.u1, 0, yt), P(seg.u0, 0, yt)], fa, FORM.coping, out)
        continue
      }
      const [a0, a1] = ext(seg, 0), [c0, c1] = ext(seg, lip)
      // the front, the underside, the top over the lip
      q.quad([P(c0, lip, yd), P(c1, lip, yd), P(c1, lip, yt), P(c0, lip, yt)], fa, FORM.coping, out)
      q.quad([P(a0, 0, yd), P(a1, 0, yd), P(c1, lip, yd), P(c0, lip, yd)], fa, FORM.under, down)
      q.quad([P(a0, 0, yt), P(a1, 0, yt), P(c1, lip, yt), P(c0, lip, yt)], fa, FORM.top, up)
      // where the lip stops short of a corner (a stair beside it), its end closes it: a return of the face
      for (const [e, dir] of [[seg.u0, against], [seg.u1, along]] as Array<[number, V3]>) {
        if (Math.abs(Math.abs(e) - f.half) < 1e-6) continue
        q.quad([P(e, 0, yd), P(e, lip, yd), P(e, lip, yt), P(e, 0, yt)], fa, FORM.side, dir)
      }
    }
  })
  // the top, inside the copings' lips
  const hx = b.sx / 2, hz = b.sz / 2
  q.quad([W(-hx, -hz, yt), W(hx, -hz, yt), W(hx, hz, yt), W(-hx, hz, yt)], [b.x, b.z, 0, 0], FORM.top, [0, 1, 0])
  return q.geometry()
}

/** one quad of a face's forms for a body that builds its own soup: its corners, `fa`, `fb` per corner (the form in
    `w`), outward */
export type FaceEmit = (p: V3[], fa: number[], fb: number[][], out: V3) => void

export interface SlopedFace {
  /** a point of the face's plane where its panels are centred (the stage's rhythm carried on), along it, outward (plan) */
  mid: [number, number]
  t: [number, number]
  n: [number, number]
  /** the span from `mid` along `t`, the foot, and the top as points (u, y) from u0 to u1, linear between them */
  u0: number
  u1: number
  foot: number
  top: Array<[number, number]>
  /** a recess's head runs `margin` under the top, parallel to it; one whose head comes under `minH` over the foot is
      left whole */
  margin: number
  minH: number
}

/** buttress panels sunk into one upright face whose top runs along a line (a stair's mass under its flight): the
    stage's recesses at its pitch, share and depth, none in the end bays, each head a band under the top and parallel
    to it, as the stages' heads run under their copings; the face plane round them to the top. `fa` the face's middle
    and outward normal with no lip (FACE.open), `fb.y` the head over the stages' band at each corner, so `towerSun`
    shades a recess as a stage's; `fb.z` 0 keeps the stages' tone off. Returns the recesses built. */
export function buttressedFace(f: SlopedFace, s: Pick<FormsSpec, 'pitch' | 'share' | 'out' | 'coping'>, emit: FaceEmit): number {
  const P = (u: number, d: number, y: number): V3 => [f.mid[0] + f.t[0] * u + f.n[0] * d, y, f.mid[1] + f.t[1] * u + f.n[1] * d]
  const out: V3 = [f.n[0], 0, f.n[1]], along: V3 = [f.t[0], 0, f.t[1]], against: V3 = [-f.t[0], 0, -f.t[1]]
  const fa = [f.mid[0], f.mid[1], f.n[0] * FACE.open, f.n[1] * FACE.open]
  const band = s.coping.h + s.coping.drip
  const top = (u: number): number => {
    const T = f.top
    if (u <= T[0]![0]) return T[0]![1]
    for (let i = 0; i + 1 < T.length; i++) {
      const [ua, ya] = T[i]!, [ub, yb] = T[i + 1]!
      if (u <= ub) return ya + ((yb - ya) * (u - ua)) / Math.max(ub - ua, 1e-9)
    }
    return T[T.length - 1]![1]
  }
  const head = (u: number): number => top(u) - f.margin
  // u0..u1 cut at the top's corners, so every piece between two levels that follow the top stays planar
  const pieces = (u0: number, u1: number): Array<[number, number]> => {
    const c = [u0, ...f.top.map((p) => p[0]).filter((x) => x > u0 + 1e-6 && x < u1 - 1e-6), u1]
    return c.slice(1).map((x, i) => [c[i]!, x])
  }
  const B = (form: number, u: number): number[] => [0, head(u) + band, 0, form]
  // an upright piece of the plane `d` from the face, from `lo(u)` up to `hi(u)`
  const wall = (u0: number, u1: number, d: number, lo: (u: number) => number, hi: (u: number) => number, form: number, dir: V3): void => {
    for (const [a, c] of pieces(u0, u1)) {
      if (hi(a) - lo(a) > 1e-6 || hi(c) - lo(c) > 1e-6) emit([P(a, d, lo(a)), P(c, d, lo(c)), P(c, d, hi(c)), P(a, d, hi(a))], fa, [B(form, a), B(form, c), B(form, c), B(form, a)], dir)
    }
  }
  const bw = s.pitch * s.share, lo = f.u0 + s.pitch / 2, hi = f.u1 - s.pitch / 2
  const R: Array<[number, number]> = []
  for (let m = Math.floor(f.u0 / s.pitch) - 1; m <= Math.ceil(f.u1 / s.pitch); m++) {
    const r0 = m * s.pitch + bw / 2, r1 = (m + 1) * s.pitch - bw / 2
    if (r0 >= lo - 1e-6 && r1 <= hi + 1e-6 && Math.min(head(r0), head(r1)) - f.foot >= f.minH) R.push([r0, r1])
  }
  const foot = (): number => f.foot, d = -s.out
  let u = f.u0
  for (const [r0, r1] of R) {
    wall(u, r0, 0, foot, top, FORM.front, out)
    wall(r0, r1, 0, head, top, FORM.front, out)
    wall(r0, r1, d, foot, head, FORM.back, out)
    emit([P(r0, d, f.foot), P(r0, 0, f.foot), P(r0, 0, head(r0)), P(r0, d, head(r0))], fa, Array(4).fill(B(FORM.side, r0)), along)
    emit([P(r1, d, f.foot), P(r1, 0, f.foot), P(r1, 0, head(r1)), P(r1, d, head(r1))], fa, Array(4).fill(B(FORM.side, r1)), against)
    for (const [a, c] of pieces(r0, r1)) emit([P(a, d, head(a)), P(c, d, head(c)), P(c, 0, head(c)), P(a, 0, head(a))], fa, [B(FORM.under, a), B(FORM.under, c), B(FORM.under, c), B(FORM.under, a)], [0, -1, 0])
    u = r1
  }
  wall(u, f.u1, 0, foot, top, FORM.front, out)
  return R.length
}
