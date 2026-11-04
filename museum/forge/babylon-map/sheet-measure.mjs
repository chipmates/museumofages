// THE MAP AGAINST THE SHEETS: each settled point of the map's plan measured on the geometry the page builds
// (plan.ts mounted in node), against the excavation sheet's value and a tolerance named per row. Prints one
// table (point, measure, the map's value, the target, the delta, the tolerance, pass). Exit 1 on any fail.
//
//   node --experimental-strip-types --no-warnings forge/babylon-map/sheet-measure.mjs [--map <dir>] [--plan <json>] [--md <out>] [--json <out>]
//
// Targets are the sheets' read-offs in UTM zone 38N metres and German-zero levels; their sources are in each row.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..')
const MAP = join(APP, 'src/wings/babylon/map')
const D2R = Math.PI / 180

/** a sheet frame: origin (E, N) and bearing (degrees from grid north); a along the bearing, c to its right */
export function sheetFrame(E0, N0, bearing) {
  const sa = Math.sin(bearing * D2R), ca = Math.cos(bearing * D2R)
  const sc = Math.sin((bearing + 90) * D2R), cc = Math.cos((bearing + 90) * D2R)
  return {
    a: (E, N) => (E - E0) * sa + (N - N0) * ca,
    c: (E, N) => (E - E0) * sc + (N - N0) * cc,
    at: (a, c) => [E0 + a * sa + c * sc, N0 + a * ca + c * cc],
  }
}

/** crossings of a closed polygon's edges with the line where f(p) = v; returns g(p) at each crossing */
export function crossings(poly, f, v, g) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    const fp = f(p) - v, fq = f(q) - v
    if (fp === fq || fp * fq > 0) continue
    const t = fp / (fp - fq)
    out.push(g([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]))
  }
  return out
}

export function inPoly(p, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

const segD = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1]], ap = [p[0] - a[0], p[1] - a[1]]
  const L2 = ab[0] ** 2 + ab[1] ** 2
  const t = L2 > 0 ? Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1]) / L2)) : 0
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t)
}
const polyD = (p, poly) => (inPoly(p, poly) ? 0 : Math.min(...poly.map((a, i) => segD(p, a, poly[(i + 1) % poly.length]))))
const lineD = (p, line) => Math.min(...line.slice(1).map((b, i) => segD(p, line[i], b)))
const area = (poly) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
const bearingOf = (a, b) => ((Math.atan2(b[0] - a[0], b[1] - a[1]) / D2R) + 360) % 360
const fin = (v) => (Number.isFinite(v) ? v : NaN)

/** Measure a plan. `cams` (the walk's cameras) is optional; `buildPlan`, `makeFrame` come from plan.ts. */
export function measure(plan, cams, { buildPlan, makeFrame }) {
  const b = buildPlan(plan, { houses: true })
  const F = makeFrame(plan)
  const U = (p) => F.utm(p[0], p[1])
  const rows = []
  const row = (pt, name, value, target, tol, cmp, src, unit = 'm') => {
    const v = typeof value === 'number' ? value : NaN
    let pass
    if (!Number.isFinite(v)) pass = false
    else if (cmp === 'le') pass = v <= target + 1e-9
    else if (cmp === 'ge') pass = v >= target - 1e-9
    else pass = Math.abs(v - target) <= tol + 1e-9
    rows.push({ pt, name, value: Number.isFinite(v) ? +v.toFixed(3) : null, target, tol, cmp: cmp ?? 'abs', unit, pass, src })
  }
  const prisms = (re) => b.prisms.filter((p) => re.test(p.id)).map((p) => ({ ...p, utm: p.poly.map(U) }))
  const prism1 = (id) => prisms(new RegExp(`^${id}$`))[0]
  const boxCorners = (r) => {
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw)
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => U([r.x + (u * r.sx * c) / 2 + (v * r.sz * s) / 2, r.z - (u * r.sx * s) / 2 + (v * r.sz * c) / 2]))
  }
  const box1 = (id) => b.boxes.find((r) => r.id === id)
  const water1 = (id) => { const w = b.water.find((q) => q.id === id); return w ? { ...w, utm: w.poly.map(U) } : null }
  const streetUTM = b.street.map((p) => U([p.x, p.z]))
  const NS = (E, N) => N, EW = (E, N) => E
  const atN = (poly, N, pick) => { const xs = crossings(poly, (p) => p[1], N, (p) => p[0]); return xs.length ? pick(...xs) : NaN }
  const atE = (poly, E, pick) => { const xs = crossings(poly, (p) => p[0], E, (p) => p[1]); return xs.length ? pick(...xs) : NaN }
  void NS; void EW

  /* ── C1 Gate 5's opening (S9-07: centre 445964.5, 3600121.5; the street's centre at N 3600125 about 445971.5) ── */
  {
    const w = plan.walls.find((q) => q.id === 'precinct-east-wall')
    const A = w.line[0], B = w.line[w.line.length - 1]
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n = [-d[1], d[0]]
    const along = (p) => (p[0] - A[0]) * d[0] + (p[1] - A[1]) * d[1]
    const out = (p) => (p[0] - A[0]) * n[0] + (p[1] - A[1]) * n[1]
    const pcs = prisms(/^precinct-east-wall(-\d+)?$/)
    const ends = pcs.map((p) => [Math.min(...p.utm.map(along)), Math.max(...p.utm.map(along))]).sort((x, y) => x[0] - y[0])
    const S = [445964.5, 3600121.5]
    let gapC = NaN, gapW = NaN
    for (let i = 0; i + 1 < ends.length; i++) {
      const g0 = ends[i][1], g1 = ends[i + 1][0]
      if (g1 - g0 > 5 && Number.isNaN(gapC)) { gapC = (g0 + g1) / 2; gapW = g1 - g0 }
    }
    row('C1', "Gate 5: opening's centre along the wall from S9-07's centre", gapC - along(S), 0, 1.0, 'abs', 'S9-07: 445964.5 E, 3600121.5 N on C6.2')
    row('C1', 'Gate 5: opening width', gapW, 30, 1.0, 'abs', 'P2021 p. 211 "about 30 m"; S9-07 30.7 m along the front')
    const face = Math.max(...pcs.flatMap((p) => p.utm.map(out)))
    row('C1', "Gate 5: the wall's outer face across from S9-07's centre", face - out(S), 0, 2.0, 'abs', 'S9-07: the opening on the outer face (C6.2)')
    row('C1', 'the street at Gate 5: centre E at N 3600125', atN([...streetUTM, ...streetUTM.slice().reverse()], 3600125, Math.max), 445971.5, 1.0, 'abs', 'S9-07: street edges 445968 and 445975 at N 3600125')
  }

  /* ── C2, D13 the bridge (the C6.2 bridge frame: axis 85.0 through 445469.7, 3599833.7; RIVER 1.3, S13-08) ── */
  {
    const BF = sheetFrame(445469.7, 3599833.7, 85.0)
    const ext = (corners) => [Math.min(...corners.map((p) => BF.a(...p))), Math.max(...corners.map((p) => BF.a(...p)))]
    // a drawn prism first: a box of the same id may be the footprint's record only
    const body = (id) => { const p = prism1(id); if (p) return { corners: p.utm, prism: p }; const r = box1(id); return r ? { corners: boxCorners(r), top: null } : null }
    const east = body('bridge-abutment-east'), west = body('bridge-abutment-west')
    const eE = east ? ext(east.corners) : [NaN, NaN], wE = west ? ext(west.corners) : [NaN, NaN]
    row('C2', "east land pier: inner face, a on the sheet's axis", eE[0], 59.6, 1.0, 'abs', 'S13-08, RIVER 1.3: west inner face a -66.4 plus the 126 m span (P2021 p. 204); about 445529 E')
    const quayA = BF.a(445569.5, 3599841)
    row('C2', 'east land pier: east end, a', eE[1], +quayA.toFixed(1), 1.5, 'abs', 'S13-08: to the Arahtu wall line at about 445569.5 E')
    const quay = prisms(/^arahtu-quay(-\d+)?$/)
    // the quay opens for the land pier: its water face is read 12 m either side of the axis and averaged
    const qf = [-12, 12].map((cc) => { const cs = quay.flatMap((q) => crossings(q.utm.map((p) => [BF.a(...p), BF.c(...p)]), (p) => p[1], cc, (p) => p[0])); return cs.length ? Math.min(...cs) : NaN })
    const qa = (qf[0] + qf[1]) / 2
    row('C2', "east land pier: gap from its east end to the quay's water face", Number.isNaN(qa) ? NaN : Math.max(0, qa - eE[1]), 0, 0.5, 'abs', 'S13-08: the land pier abuts the Arahtu walls (Wetzel pl. 51 labels)')
    const near = [445550, 3599840]
    const gates = [...b.prisms.map((p) => ({ id: p.id, name: p.name, pts: p.poly.map(U) })), ...b.boxes.filter((r) => r.group !== 'house').map((r) => ({ id: r.id, name: '', pts: boxCorners(r) }))]
      .filter((q) => /gate|door/i.test(`${q.id} ${q.name}`) && q.pts.some((p) => Math.hypot(p[0] - near[0], p[1] - near[1]) < 40))
    row('C2', "bodies named gate within 40 m of the bridge's east end", gates.length, 0, 0, 'abs', 'K1914 ch. XXXII, P2021 p. 66 to 67: the gate there is later', 'count')

    const piers = [1, 2, 3, 4, 5, 6].map((i) => body(`bridge-pier-${i}`))
    const sheetC = [43.2, 24.25, 6.25, -11.45, -29.55, -47.55]
    row('D13', 'river piers: largest centre offset from C6.2, along', Math.max(...piers.map((p, i) => Math.abs((ext(p.corners)[0] + ext(p.corners)[1]) / 2 - sheetC[i]))), 0, 1.0, 'abs', 'RIVER 1.3 table (C6.2 line centres)')
    // the plan form: width along the bridge 1 m south of the north tip, over the widest; the back's bulge
    const form = piers.map((p) => {
      const pa = p.corners.map((q) => [BF.a(...q), BF.c(...q)])
      const cN = Math.min(...pa.map((q) => q[1])), cS = Math.max(...pa.map((q) => q[1]))
      const wAt = (c) => { const xs = crossings(pa, (q) => q[1], c, (q) => q[0]); return xs.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0 }
      const wMax = Math.max(...Array.from({ length: 41 }, (_, k) => wAt(cN + ((cS - cN) * (k + 0.5)) / 41)))
      const mid = (Math.min(...pa.map((q) => q[0])) + Math.max(...pa.map((q) => q[0]))) / 2
      const backMid = Math.max(...crossings(pa, (q) => q[0], mid, (q) => q[1]))
      const backEdge = Math.max(...crossings(pa, (q) => q[0], mid + wMax * 0.4, (q) => q[1]))
      const top = p.prism && p.prism.top ? p.prism.top.map(U) : null
      let batter = 0
      if (top) {
        const ta = top.map((q) => BF.a(...q)), ba = p.corners.map((q) => BF.a(...q))
        batter = ((Math.max(...ba) - Math.min(...ba)) - (Math.max(...ta) - Math.min(...ta))) / 2 / (p.prism.y1 - p.prism.y0)
      }
      return { bow: wAt(cN + 1) / wMax, back: backMid - backEdge, batter }
    })
    row('D13', 'river piers: bow, width 1 m from the north tip over the widest (largest of six)', Math.max(...form.map((f) => f.bow)), 0.5, 0, 'le', 'K1914 ch. XXXI: sides convex, meeting in a point facing the current on the north', 'ratio')
    row('D13', 'river piers: back, bulge of the south end at its middle (smallest of six)', Math.min(...form.map((f) => f.back)), 0.4, 0, 'ge', 'K1914 ch. XXXI: "the back is also slightly curved"; the bulge is ours')
    row('D13', 'river piers: batter, inset per metre of height (smallest of six)', Math.min(...form.map((f) => f.batter)), 0.05, 0, 'ge', 'K1914 ch. XXXI: "a very marked batter"; 1 in 20 or more is ours', 'm/m')
    row('D13', 'west land pier: length along the bridge', wE[1] - wE[0], 7.6, 0.3, 'abs', 'RIVER 1.3: a -74.0 to -66.4 on C6.2')
    row('D13', 'west land pier: inner face, a', wE[1], -66.4, 1.0, 'abs', 'RIVER 1.3')
    const p6 = ext(piers[5].corners)
    row('D13', 'gap, river pier 6 to the west land pier', p6[0] - wE[1], 14, 1.0, 'abs', 'RIVER 1.3: about 14 m over the faces (14.7 between line centres)')
    row('D13', "span between the land piers' inner faces", eE[0] - wE[1], 126, 1.0, 'abs', 'P2021 p. 204: originally 126 m')
  }

  /* ── C3 the lion street (WALLS 1.1, 8.1: axis 348.96 grid through 445773.0, 3600844.0) ── */
  {
    const LF = sheetFrame(445773.0, 3600844.0, 348.96)
    row('C3', "the lion frame's bearing", plan.frames.lion.bearing, 348.96, 0.05, 'abs', 'WALLS 1.1: the paving axis, rms 0.03 m', 'deg')
    row('C3', "the lion frame's origin from the sheet's axis point", Math.hypot(plan.frames.lion.origin[0] - 445773.0, plan.frames.lion.origin[1] - 3600844.0), 0, 0.5, 'abs', 'WALLS 8.1: through 445773.0 E, 3600844.0 N')
    const W = prisms(/^lion-wall-w-\d+$/).map((p) => p.utm.map((q) => [LF.a(...q), LF.c(...q)]))
    const E = prisms(/^lion-wall-e-\d+$/).map((p) => p.utm.map((q) => [LF.a(...q), LF.c(...q)]))
    const faceAt = (set, a, pick) => { const xs = set.flatMap((pa) => crossings(pa, (q) => q[0], a, (q) => q[1])); return xs.length ? pick(...xs) : NaN }
    for (const [a, wt, et] of [[60, -10.0, 11.4], [160, -10.9, 11.5]]) {
      const wf = faceAt(W, a, Math.max), ef = faceAt(E, a, Math.min)
      row('C3', `west wall street face, c at a = ${a}`, wf, wt, 0.3, 'abs', 'WALLS 1.1 (C6.2 line scan)')
      row('C3', `east wall street face, c at a = ${a}`, ef, et, 0.3, 'abs', 'WALLS 1.1')
      row('C3', `clear width at a = ${a}`, ef - wf, +(et - wt).toFixed(1), 0.5, 'abs', 'WALLS 8.1: 21.4 m at a = 60, 22.4 m at a = 160')
    }
    const tw = b.boxes.filter((r) => /^lion-wall-e-t\d+-\d+$/.test(r.id))
    const tc = tw.map((r) => { const cs = boxCorners(r).map((q) => [LF.a(...q), LF.c(...q)]); return { a: cs.reduce((s, q) => s + q[0], 0) / 4, cMin: Math.min(...cs.map((q) => q[1])), len: Math.max(...cs.map((q) => q[0])) - Math.min(...cs.map((q) => q[0])) } }).sort((x, y) => x.a - y.a)
    row('C3', 'street-face towers: length along the wall', tw.length ? tw[0].sx : NaN, 7, 0.5, 'abs', 'WALLS 1.1: 6.4 to 7.9 m, about 7')
    const efMid = faceAt(E, tc.length ? tc[Math.floor(tc.length / 2)].a + 9 : 100, Math.min)
    row('C3', 'street-face towers: projection into the street', tc.length ? efMid - tc[Math.floor(tc.length / 2)].cMin : NaN, 1.4, 0.3, 'abs', 'WALLS 1.1: about 1.4 m into the street')
    const pitch = tc.length > 1 ? (tc[tc.length - 1].a - tc[0].a) / (tc.length - 1) : NaN
    row('C3', 'street-face towers: pitch', pitch, 13.6, 0.3, 'abs', 'WALLS 1.1: mean pitch 13.6 m')
    const sp = plan.street.points.find((p) => /survey point 2/.test(p.note ?? ''))
    row('C3', 'survey point 2: along the axis', sp ? LF.a(...sp.at) : NaN, 98.7, 0.5, 'abs', 'P2021 Fig. 5.31 caption: 445750 E, 3600940 N, a = 98.7')
    row('C3', "survey point 2's street point: off the axis", sp ? LF.c(...sp.at) : NaN, 0, 0.5, 'abs', 'the street centre; the survey point itself lies at c = -3.8 on the paving')
  }

  /* ── C4 the gate's length and frame (gate-plan: the axis 343.1 grid, read off 2.28) ── */
  {
    const gf = plan.frames.gate, GF = sheetFrame(gf.origin[0], gf.origin[1], gf.bearing)
    const g = prisms(/^gate-(front|main)(-[lr]|-lintel|-sill)?$/)
    const as = g.flatMap((p) => p.utm.map((q) => GF.a(...q)))
    row('C4', 'the Ishtar Gate: length along its axis', Math.max(...as) - Math.min(...as), 50, 0.05, 'abs', 'K1918 p. 37, P2021 p. 71 to 72: 50 m')
    row('C4', "the gate frame's bearing on the grid", gf.bearing, 163.1, 0.05, 'abs', "the gate's axis 343.1 grid (342.8 true, convergence -0.31), read off sheet 2.28", 'deg')
  }

  /* ── C5 the forecourt (sheet 2.28 through GEOREF: bastions north of a forecourt about 32 x 20 m, 29 m along the street) ── */
  {
    const LF = sheetFrame(445773.0, 3600844.0, 348.96)
    const bw = prism1('bastion-w'), be = prism1('bastion-e')
    const la = (p) => p.utm.map((q) => [LF.a(...q), LF.c(...q)])
    const W = bw ? la(bw) : [], E = be ? la(be) : []
    // a bastion block may carry its forecourt wall (|c| under 23 m, a under 19 m): the bastion proper is read from the
    // vertices beyond the forecourt wall (|c| 23 m or more) for its run along the street, and from a 15 m on for its width
    const span = (xs) => Math.max(...xs) - Math.min(...xs)
    const outer = (pa) => pa.filter((q) => Math.abs(q[1]) >= 23), north = (pa) => pa.filter((q) => q[0] >= 15)
    row('C5', 'west bastion: along the street', span(outer(W).map((q) => q[0])), 29, 2.0, 'abs', 'GR 8, CANON S3-24: about 21 x 29 m; 2.28 re-read: 29 m runs along the street')
    row('C5', 'west bastion: across the street', span(north(W).map((q) => q[1])), 21, 2.0, 'abs', 'GR 8; 2.28 re-read: c -30.0 to -9.3')
    row('C5', 'east bastion: along the street', span(outer(E).map((q) => q[0])), 29, 2.0, 'abs', 'GR 8; 2.28 re-read: a 20.7 to 50')
    row('C5', 'east bastion: across the street', span(north(E).map((q) => q[1])), 20, 2.0, 'abs', 'GR 8; 2.28 re-read: c +11.6 to +31 (turned about 6 degrees)')
    // the depth on the bastion's street side: where a line 12 m off the axis first meets it, going north from the gate's face
    const enters = (pa, c) => { const xs = crossings(pa, (q) => q[1], c, (q) => q[0]).filter((a) => a > 0); return xs.length ? Math.min(...xs) : NaN }
    row('C5', "forecourt depth: the gate's face to the west bastion (c = -12)", enters(W, -12), 18.7, 1.5, 'abs', '2.28 re-read (GEOREF, 2.28 fit): the south-east corner at a 18.7')
    row('C5', "forecourt depth: the gate's face to the east bastion (c = +12)", enters(E, 12), 20.7, 1.5, 'abs', '2.28 re-read: the south-west corner at a 20.7; GR 8 "about 20 m deep"')
    const face = (pa, a, pick) => { const xs = crossings(pa, (q) => q[0], a, (q) => q[1]); return xs.length ? pick(...xs) : NaN }
    row('C5', "west bastion's street face, c at a = 30", face(W, 30, Math.max), -9.3, 1.0, 'abs', '2.28 re-read: c -9.3 (the lion wall\'s line)')
    row('C5', "east bastion's street face, c at a = 30", face(E, 30, Math.min), 11.6, 1.0, 'abs', '2.28 re-read: c +10.4 to +12.9')
    row('C5', 'forecourt width at a = 10', face(E, 10, Math.min) - face(W, 10, Math.max), 32, 1.5, 'abs', 'GR 8 "about 32 m wide"; 2.28 re-read: c -15.8 to +17.0')
  }

  /* ── D1 the river front about 570 BC (RIVER 1.2, 8.2: system C's westmost line; system A out) ── */
  {
    const Ns = [3600505, 3600405, 3600245, 3600005, 3599865], C = [445490.3, 445492.5, 445494.1, 445534.9, 445563.9]
    const Aw = [[445402.9, 445410.75], [445420.5, 445427.85], [445447.7, 445455.55], [445487.3, 445494.8], [445511.9, 445519.35]]
    const eu = water1('euphrates')
    const edge = Ns.map((N) => { const xs = crossings(eu.utm, (p) => p[1], N, (p) => p[0]).filter((E) => E > 445250 && E < 445700); return xs.length ? Math.max(...xs) : NaN })
    row('D1', "the water's east edge: largest offset from system C (5 northings)", Math.max(...edge.map((E, i) => Math.abs(E - C[i]))), 0, 2.0, 'abs', 'RIVER 8.2: 445490.3, 445492.5, 445494.1, 445534.9, 445563.9 at N 3600505 ... 3599865')
    const q = prisms(/^arahtu-quay(-\d+)?$/)
    const front = q.length ? q : prisms(/^kasr-river-wall(-\d+)?$/)
    const face = Ns.map((N) => { const xs = front.flatMap((p) => crossings(p.utm, (r) => r[1], N, (r) => r[0])); return xs.length ? Math.min(...xs) : NaN })
    row('D1', `the river front's water face (${q.length ? 'arahtu-quay' : 'kasr-river-wall'}): largest offset from system C`, Math.max(...face.map((E, i) => Math.abs(E - C[i]))), 0, 1.5, 'abs', 'RIVER 8.2 (westmost line); P2021 p. 66, K1914 ch. XXXIV')
    const towers = b.boxes.filter((r) => /^(arahtu-quay|kasr-river-wall)(-\d+)?-t\d+-\d+$/.test(r.id)).length
    row('D1', 'towers on the river front', towers, 2, 0, 'le', 'P2021 p. 66: "without towers, except for the ones at the north and south corners"', 'count')
    const hit = Aw.filter(([f, m], i) => b.prisms.some((p) => p.group === 'wall' && (inPoly([f + 1.5, Ns[i]], p.poly.map(U)) || inPoly([m, Ns[i]], p.poly.map(U))))).length
    row('D1', "system A's line built (northings with a wall on it)", hit, 0, 0, 'abs', 'RIVER 8.2: the Nabonidus wall is not at 570 BC; leave out', 'count')
    row('D1', 'the inner embankment drawn 20 to 25 m inside system A', prisms(/^kasr-river-wall-2$/).length, 0, 0, 'abs', 'RIVER 1.7: P2021 p. 66\'s "20 to 25 m" is the gap between the two old walls', 'count')
  }

  /* ── D14 the canal's outflow and the West Outwork's top ── */
  {
    const eu = water1('euphrates'), ca = water1('canal'), wo = prism1('west-outwork')
    const west = ca.utm.slice().sort((p, q) => p[0] - q[0]).slice(0, 2)
    const mouth = [(west[0][0] + west[1][0]) / 2, (west[0][1] + west[1][1]) / 2]
    row('D14', "the canal's west end to the river's water", Math.min(...west.map((p) => polyD(p, eu.utm))), 0, 1.0, 'abs', 'RIVER 1.4, 8.4: the outflow at the West Fortification\'s south-east about 570 BC [inferred]')
    const se = wo ? wo.utm.reduce((m, p) => (p[0] - p[1] > m[0] - m[1] ? p : m)) : [NaN, NaN]
    row('D14', "the canal's mouth to the West Outwork's south-east corner", Math.hypot(mouth[0] - se[0], mouth[1] - se[1]), 15, 0, 'le', 'RIVER 8.4')
    const notes = JSON.stringify(plan.notes ?? {})
    row('D14', "the West Outwork's top said once in the notes as ours", (notes.match(/West Outwork[^"]*\+1[28][^"]*ours|West Outwork[^"]*ours[^"]*\+1[28]/g) ?? []).length, 1, 0, 'abs', 'P2021 p. 69 "(quite provisionally)" +18; the map +12', 'count')
  }

  /* ── D2 the North Palace (PALACE 1.6, 1.8, 8.4, 8.5) ── */
  {
    const m = prism1('north-palace-main')
    const ex = m ? [Math.min(...m.utm.map((p) => p[0])), Math.max(...m.utm.map((p) => p[0])), Math.min(...m.utm.map((p) => p[1])), Math.max(...m.utm.map((p) => p[1]))] : [NaN, NaN, NaN, NaN]
    const sh = [445522.8, 445657.5, 3600838.7, 3600965.5]
    row('D2', 'main building: largest edge offset from S3.45', Math.max(...ex.map((v, i) => Math.abs(v - sh[i]))), 0, 1.5, 'abs', 'PALACE 8.4: 445522.8 to 445657.5 E, 3600838.7 to 3600965.5 N')
    row('D2', 'main building: east to west', ex[1] - ex[0], 134.7, 1.5, 'abs', 'S3.45; P2021 p. 114 "134 x 130 m"')
    row('D2', 'main building: north to south', ex[3] - ex[2], 126.8, 1.5, 'abs', 'S3.45')
    const tg = [prism1('north-palace-terrace'), ...prisms(/^gardens/)].filter(Boolean).map((p) => atE(p.utm, 445600, Math.max)).filter(Number.isFinite)
    row('D2', "the terrace's north edge at E 445600 (with its edge steps)", tg.length ? Math.max(...tg) : NaN, 3600987.5, 2.0, 'abs', 'P2021 p. 117: terrace sections 22 m north of the building')
    const cn = water1('canal-north')
    row('D2', 'the inner canal: south bank at E 445600', cn ? atE(cn.utm, 445600, Math.min) : NaN, 3600991.1, 0.5, 'abs', 'PALACE 8.4: 13.0 m, N 3600991.1 to 3601004.1 (S3.45)')
    row('D2', 'the inner canal: width', cn ? atE(cn.utm, 445600, Math.max) - atE(cn.utm, 445600, Math.min) : NaN, 13.0, 0.5, 'abs', 'P2021 p. 118, K1914 ch. XXVI: 13 m')
    row('D2', 'the inner canal: water level', cn ? cn.level : NaN, -3, 0.01, 'ge', 'P2021 p. 115: about -3 (Koldewey about 0); range -3 to 0')
    const gd = prisms(/^gardens/)
    // a 6 x 6 grid over the building, 1 m inside its edges: a body over any of it stands on the building (a lap does not)
    const grid = m ? Array.from({ length: 36 }, (_, k) => [ex[0] + 1 + ((ex[1] - ex[0] - 2) * (k % 6)) / 5, ex[2] + 1 + ((ex[3] - ex[2] - 2) * Math.floor(k / 6)) / 5]) : []
    row('D2', 'gardens bodies standing on the dug main building', m ? gd.filter((g) => grid.some((q) => inPoly(q, g.utm))).length : NaN, 0, 0, 'abs', 'PALACE 4.3: the steps over the building fill dug courts', 'count')
    row('D2', "gardens bodies on the building's north or west edge", gd.filter((g) => g.utm.every((p) => p[1] >= 3600965 - 0.5 || p[0] <= 445523 + 0.5)).length, 1, 0, 'ge', 'PALACE 4.3 option 1, 8.5: Pedersén\'s edge terraces (G(T))', 'count')
    row('D2', 'gardens bodies not classed guessed', gd.filter((g) => g.plan !== 'G' || g.height !== 'G').length, 0, 0, 'abs', 'PALACE 8.5', 'count')
  }

  /* ── D3 the throne room (PALACE 1.3) ── */
  {
    const t = prisms(/^throne-room-(hall|wall-\d+|over-\d+|wall-end)$/)
    const xs = t.flatMap((p) => p.utm.map((q) => q[0])), ys = t.flatMap((p) => p.utm.map((q) => q[1]))
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    row('D3', 'outer block, east to west', x1 - x0, 57.5, 0.3, 'abs', 'S3.45: 445630.9 to 445688.4; end walls 2.8 m (P2021 p. 106)')
    row('D3', 'outer block, west face E', x0, 445630.9, 0.5, 'abs', 'S3.45')
    row('D3', 'outer block, north to south', Math.max(...ys) - Math.min(...ys), 29.6, 0.3, 'abs', 'S3.45: 3600635.3 to 3600664.9')
    const doors = prisms(/^throne-room-over-\d+$/).map((p) => (Math.min(...p.utm.map((q) => q[0])) + Math.max(...p.utm.map((q) => q[0]))) / 2 - (x0 + x1) / 2).sort((a, c) => a - c)
    const want = [-22.05, -0.8, 20.55]
    row('D3', "doors' centres from the room's centre: largest offset", doors.length === 3 ? Math.max(...doors.map((d, i) => Math.abs(d - want[i]))) : NaN, 0, 0.3, 'abs', 'S3.45: 445637.55, 445658.8, 445680.15 against the centre 445659.6')
  }

  /* ── D4 the street along the palace (S3.45 centre line; P2021 p. 222) ── */
  {
    const want = [[3600730, 445813.9], [3600720, 445817.4], [3600690, 445825.7], [3600650, 445832.9], [3600625, 445837.3]]
    const line = [...streetUTM, ...streetUTM.slice().reverse()]
    const off = want.map(([N, E]) => { const xs = crossings(line, (p) => p[1], N, (p) => p[0]).filter((x) => x > 445780 && x < 445870); return xs.length ? Math.abs(xs[0] - E) : NaN })
    row('D4', "the street's centre line, largest offset from S3.45 (5 northings)", Math.max(...off), 0, 1.5, 'abs', 'PALACE 1.4: 445813.9 (N 3600730) ... 445837.3 (N 3600625)')
  }

  /* ── D5 the North Gate (WALLS 1.2, 8.2: two cross walls, a court; in the lion sheet frame) ── */
  {
    const LF = sheetFrame(445773.0, 3600844.0, 348.96)
    const ng = prisms(/^north-gate/).map((p) => ({ ...p, la: p.utm.map((q) => [LF.a(...q), LF.c(...q)]) }))
    const as = ng.flatMap((p) => p.la.map((q) => q[0])), cs = ng.flatMap((p) => p.la.map((q) => q[1]))
    row('D5', 'North Gate: over all along the street', Math.max(...as) - Math.min(...as), 33.5, 1.0, 'abs', 'WALLS 8.2: cross walls a 178.5 to 212.0')
    row('D5', 'North Gate: over all across', Math.max(...cs) - Math.min(...cs), 44.2, 1.0, 'abs', 'WALLS 8.2')
    const ctr = LF.at((Math.max(...as) + Math.min(...as)) / 2, (Math.max(...cs) + Math.min(...cs)) / 2)
    row('D5', 'North Gate: centre from its point', Math.hypot(ctr[0] - 445735.4, ctr[1] - 3601035.6), 0, 1.0, 'abs', 'C6.2 445735.4, 3601035.6; P2021 p. 230 445735, 3601035')
    const eye = 7.5 + 1.6
    const solid = ng.filter((p) => p.y0 < eye && p.y1 > eye)
    let lo = 0, hi = 0
    const blocked = (c) => solid.some((p) => inPoly([195.3, c], p.la))
    while (lo > -40 && !blocked(lo - 0.05)) lo -= 0.05
    while (hi < 40 && !blocked(hi + 0.05)) hi += 0.05
    row('D5', 'North Gate: clear court across at eye height (a = 195.3)', blocked(0) ? 0 : hi - lo, 30.2, 1.0, 'abs', 'WALLS 8.2: court 30.2 m wide')
  }

  /* ── D6 the north moat and its walls (WALLS 1.3, 8.3; E2.2) ── */
  {
    const mo = water1('moat-north')
    row('D6', 'moat west of the dam: south edge at E 445550', mo ? atE(mo.utm, 445550, Math.min) : NaN, 3601080, 1.5, 'abs', 'E2.2, C6.2: the North Palace face N 3601080')
    row('D6', 'moat west of the dam: width', mo ? atE(mo.utm, 445550, Math.max) - atE(mo.utm, 445550, Math.min) : NaN, 76, 1.5, 'abs', 'WALLS 8.3: 76 m (N 3601080 to 3601156)')
    const cw = prism1('moat-counter-wall')
    row('D6', 'counter wall: thickness', cw ? atE(cw.utm, 445550, Math.max) - atE(cw.utm, 445550, Math.min) : NaN, 3, 0.5, 'abs', 'WALLS 8.3: N 3601156 to 3601159')
    const dam = prisms(/^dam-wall/)
    const LF = sheetFrame(445773.0, 3600844.0, 348.96)
    const dc = dam.flatMap((p) => p.utm.map((q) => LF.c(...q)))
    row('D6', 'the dam: flanking walls built', dam.length, 2, 0, 'ge', 'K1914 ch. XXVIII, K1918 p. 5: sloping walls, the west one dug', 'count')
    row('D6', 'the dam: over all across its walls', dc.length ? Math.max(...dc) - Math.min(...dc) : NaN, 36, 1.5, 'abs', 'WALLS 1.3: outer faces c -17.8 and +18.6')
    const me = water1('moat-east')
    row('D6', 'moat east of the dam: north edge at E 445850', me ? atE(me.utm, 445850, Math.max) : NaN, 3601222.9, 3.0, 'abs', 'WALLS 1.3: the thin line 445729, 3601152 to 445992, 3601306 (edge guessed)')
    row('D6', 'moat east of the dam: south edge at E 445850', me ? atE(me.utm, 445850, Math.min) : NaN, 3601142.2, 3.0, 'abs', "WALLS 1.3: the outer wall's north face")
    const ef = prisms(/^east-fortification$/), eo = prisms(/^east-fortification-outer(-\d+)?$/)
    const nsAt = (ps, E) => { const ys = ps.flatMap((p) => crossings(p.utm, (q) => q[0], E, (q) => q[1])); return ys.length ? [Math.min(...ys), Math.max(...ys)] : [NaN, NaN] }
    const fi = nsAt(ef, 445850), fo = nsAt(eo, 445850)
    row('D6', 'East Fortification inner wall: N extent at E 445850', fi[1] - fi[0], 12.3, 1.5, 'abs', 'WALLS 1.3: faces N 3601058.6 and 3601070.9 (about 10 m thick at 61 degrees)')
    row('D6', 'East Fortification inner wall: centre N at E 445850', (fi[0] + fi[1]) / 2, 3601064.75, 2.0, 'abs', 'WALLS 1.3')
    row('D6', 'East Fortification outer wall: N extent at E 445850', fo[1] - fo[0], 11.4, 1.5, 'abs', 'WALLS 1.3: faces N 3601130.8 and 3601142.2')
    row('D6', 'East Fortification outer wall: centre N at E 445850', (fo[0] + fo[1]) / 2, 3601136.5, 2.0, 'abs', 'WALLS 8.3: 445743, 3601088 to 445954, 3601194')
    const edgeLine = [[445741, 3601175], [445953, 3601283]]
    const onEdge = plan.walls.filter((w) => !w.in && w.line.some((p) => lineD(p, edgeLine) < 5)).length
    row('D6', "walls on the sheet's moat edge (no wall there)", onEdge, 0, 0, 'abs', 'WALLS 1.8: E2.2 draws no wall there', 'count')
  }

  /* ── D7 the North Palace's north wall (WALLS 8.3; P2021 p. 70, 116) ── */
  {
    const nw = prism1('north-wall') ?? prism1('north-fortification')
    row('D7', "north wall: its face's north edge at E 445600", nw ? atE(nw.utm, 445600, Math.max) : NaN, 3601080.6, 1.0, 'abs', 'S3.45, C6.2, E2.2 agree: N 3601080 to 3601080.6')
    row('D7', 'north wall: foot', nw ? nw.y0 : NaN, -5.0, 0.5, 'abs', 'P2021 p. 70, 116: from about -5.0')
    row('D7', 'north wall: top', nw ? nw.y1 : NaN, 18.0, 0.5, 'abs', 'P2021 p. 70: to +18 (reconstructed)')
    const rec = plan.blocks.find((q) => q.id === (nw ? nw.id : '')) ?? {}
    row('D7', 'north wall: the stone reaches up to', rec.limestone === true ? (nw ? nw.y1 : NaN) : (rec.stone?.to ?? NaN), 0.5, 0.3, 'abs', 'P2021 p. 116: limestone only to about +0.5, baked brick above')
  }

  /* ── D8 the outer east wall (WALLS 8.5) ── */
  {
    const k = b.prisms.filter((p) => /^outer-east-karu-\d+$/.test(p.id))
    row('D8', 'embankment top', k.length ? Math.min(...k.map((p) => p.y1)) : NaN, 8.0, 0.05, 'abs', 'P2021 p. 63: top reconstructed +8.0')
    const wk = b.prisms.filter((p) => /^outer-east-walk-\d+$/.test(p.id))
    row('D8', 'embankment walkway level', wk.length ? Math.min(...wk.map((p) => p.y1)) : NaN, 2.0, 0.05, 'abs', 'P2021 p. 63: a walkway at about +2.0')
    const t = b.boxes.filter((r) => /^outer-east-main-\d+-t\d+-\d+$/.test(r.id))
    row('D8', 'towers: width (Koldewey)', t.length ? t[0].sx : NaN, 8.37, 0.01, 'abs', 'K1914 ch. I: 8.37 m at 52.5 m')
    row('D8', 'towers: pitch (Koldewey)', plan.circuits.find((c) => c.id === 'outer-east').main.towers.pitch, 52.5, 0.01, 'abs', 'K1914 ch. I')
  }

  /* ── D9 the houses (WALLS 8.7) ── */
  {
    const hs = new Map()
    for (const r of b.boxes) {
      const m = /^house-(\d+)-([nswe])$/.exec(r.id)
      if (!m) continue
      if (!hs.has(m[1])) hs.set(m[1], {})
      hs.get(m[1])[m[2]] = r
    }
    const fr = [...hs.values()].filter((h) => h.n && h.s && h.w && h.e).map((h) => {
      const W = h.n.sx, D = h.n.sz + h.s.sz + h.w.sz
      return ((W - h.w.sx - h.e.sx) * h.w.sz) / (W * D)
    })
    row('D9', 'houses as a type: court over plot (mean)', fr.length ? fr.reduce((s, v) => s + v, 0) / fr.length : NaN, 0.12, 0.03, 'abs', 'P2021 numbers: main court 10 to 15 percent of the plot', 'ratio')
    const mk = plan.blocks.filter((q) => /^merkes-\d+$/.test(q.id))
    row('D9', 'Merkes blocks still named as dug houses', mk.filter((q) => /dug/.test(q.name)).length, 0, 0, 'abs', 'WALLS 1.8, 8.7: a type laid into a dug area', 'count')
    const mc = prisms(/^merkes-\d+$/).map((p) => p.holes.reduce((s, h) => s + area(h), 0) / area(p.poly))
    row('D9', 'Merkes blocks: court over block (largest)', mc.length ? Math.max(...mc) : NaN, 0.12, 0.03, 'abs', 'as the houses', 'ratio')
  }

  /* ── D11 and the tower (PRECINCT 1.1, 1.2, 8.1; SETTLED-C2; W-C2-01) ── */
  {
    const s1 = box1('tower-stage-1')
    const bearing = s1 ? ((90 - s1.yaw / D2R) % 360 + 360) % 360 : NaN
    row('D11', "the tower's axis (the stair face's normal)", bearing, 165.6, 0.1, 'abs', 'PRECINCT 8.1: 165.6 grid (rms 0.06 m)', 'deg')
    const c = s1 ? U([s1.x, s1.z]) : [NaN, NaN]
    row('D11', "the tower's centre from C6.2's", Math.hypot(c[0] - 445640.5, c[1] - 3600036.0), 0, 0.5, 'abs', 'PRECINCT 8.1: 445640.5, 3600036.0')
    const ms = b.ramps.find((r) => r.id === 'tower-stair-middle')
    const foot = ms ? U(ms.a) : [NaN, NaN]
    row('D11', "middle stair: foot's distance from the centre", Math.hypot(foot[0] - c[0], foot[1] - c[1]), 105.3, 0.5, 'abs', 'PRECINCT 1.2: 105.3 m (line centre), 51.6 m from the side-stair band (P2021 p. 156)')
    row('D11', 'middle stair: width outside', ms ? ms.w : NaN, 10.2, 0.2, 'abs', 'PRECINCT 1.2: 10.2 m outside, 6.2 m clear')
    row('D11', "the tower's base level (the stair court)", ms ? ms.y0 : NaN, 2.5, 0.5, 'abs', 'P2021 p. 154: Level 2 +2.0 to +3.0')
    const g = prisms(/^precinct-south-rooms-\d+$/)
    const w = plan.walls.find((q) => q.id === 'precinct-south-rooms')
    const A = w.line[0], B = w.line[w.line.length - 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]), d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]
    const along = (p) => (p[0] - A[0]) * d[0] + (p[1] - A[1]) * d[1]
    const ends = g.map((p) => [Math.min(...p.utm.map(along)), Math.max(...p.utm.map(along))]).sort((x, y) => x[0] - y[0])
    let gc = NaN, gw = NaN
    for (let i = 0; i + 1 < ends.length; i++) { const g0 = ends[i][1], g1 = ends[i + 1][0]; if (g1 - g0 > 3 && Number.isNaN(gc)) { gc = (g0 + g1) / 2; gw = g1 - g0 } }
    const gE = A[0] + d[0] * gc
    row('D11', 'the south gate cut: centre E', gE, 445687.5, 1.5, 'abs', 'PRECINCT 1.3: the forecourt between 445677 and 445698 E')
    row('D11', 'the south gate cut: width', gw, 21, 1.0, 'abs', 'PRECINCT 1.3: 21 x 27 m forecourt; P2021 p. 208 21 x 25 m')
    // the stair's axis meets the wall's centre line
    const ax = [Math.sin(bearing * D2R), Math.cos(bearing * D2R)]
    const den = ax[0] * d[1] - ax[1] * d[0]
    const tt = ((A[0] - c[0]) * d[1] - (A[1] - c[1]) * d[0]) / den
    row('D11', "the gate cut's centre east of the stair's axis", gE - (c[0] + ax[0] * tt), 11.5, 1.5, 'abs', 'PRECINCT 1.6: with the sheet\'s 165.6 the stair lies 11 to 12 m west of the gate')
    const st = b.boxes.filter((r) => r.group === 'tower-stage').sort((p, q) => p.y1 - q.y1)
    const sides = [91.5, 78, 60, 51, 42, 33, 24], across = [91.5, 78, 60, 51, 42, 33, 21], hts = [33, 18, 6, 6, 6, 6, 15]
    row('T', 'tower: stage sides, largest offset from the tablet (base as measured)', st.length === 7 ? Math.max(...st.map((r, i) => Math.max(Math.abs(r.sx - sides[i]), Math.abs(r.sz - across[i])))) : NaN, 0, 0.05, 'abs', 'W-C2-01 at 6 m a gar: 90 (built 91.5, P2021 p. 153), 78, 60, 51, 42, (33 Smith), top 24 x 21')
    const tops = st.map((r) => r.y1), base = ms ? ms.y0 : NaN
    const h = tops.map((y, i) => y - (i === 0 ? base : tops[i - 1]))
    row('T', 'tower: stage heights, largest offset from the tablet', st.length === 7 ? Math.max(...h.map((v, i) => Math.abs(v - hts[i]))) : NaN, 0, 0.05, 'abs', 'W-C2-01: 33, 18, 6, 6, 6, (6), 15 m')
    row('T', 'tower: total height', b.facts.tower ? b.facts.tower.height : NaN, 90, 0.05, 'abs', 'W-C2-01: 15 gar, about 90 m (SETTLED-C2)')
    row('T', 'tower: stages above the base not classed guessed', st.filter((r, i) => (i === 0 ? r.height !== 'G' : r.plan !== 'G' || r.height !== 'G')).length, 0, 0, 'abs', 'SETTLED-C2: the tower above its base shown "Guessed"', 'count')
    const notes = JSON.stringify(plan.notes ?? {}), all = JSON.stringify(plan)
    const label = 'the stages follow the Esagila tablet, a later school text\'s figures, read at about 6 m to the gar'
    const count = (s, t) => s.split(t).length - 1
    row('T', 'the tablet label in the notes (and nowhere twice)', count(notes, label) === 1 && count(all, label) === 1 ? 1 : count(notes, label), 1, 0, 'abs', 'SETTLED-C2 G-C2-2', 'count')
    const alt = JSON.stringify(plan.notes?.alternatives ?? [])
    row('T', "Pedersén's figures in the notes' alternatives", /Pedersén/.test(alt) && /80\.5/.test(alt) && /91\.5 m/.test(alt) && /15 gar/.test(alt) ? 1 : 0, 1, 0, 'abs', 'SETTLED-C2: widths 80.5 ... 27, 91.5 m, about 30 m first terrace; the tablet\'s 15 gar = 90 m', 'count')
  }

  /* ── D12 Esagila (PRECINCT 1.4, 1.6) ── */
  {
    const e = prism1('esagila')
    const [NW, NE, SE, SW] = e ? e.utm : [[NaN, NaN], [NaN, NaN], [NaN, NaN], [NaN, NaN]]
    row('D12', 'east side bearing', bearingOf(NE, SE), 166.3, 0.5, 'abs', 'PRECINCT 1.6: 166.3 degrees', 'deg')
    row('D12', 'south side length', Math.hypot(SE[0] - SW[0], SE[1] - SW[1]), 79.5, 1.0, 'abs', 'PRECINCT 1.6: 79.5 m')
    const sh = [[445620.9, 3599756.3], [445698.4, 3599769.6], [445717.4, 3599691.4], [445640.4, 3599671.7]]
    row('D12', 'corners: largest offset from C6.2', e ? Math.max(...e.utm.map((p, i) => Math.hypot(p[0] - sh[i][0], p[1] - sh[i][1]))) : NaN, 0, 2.0, 'abs', 'PRECINCT 1.4 (by eye, plus or minus 2 m)')
  }

  /* ── G-C2-19 the turn; G-C2-20 Esagila's north side ── */
  {
    const C = [446012, 3599936]
    const nE = [Math.sin(74.8 * D2R), Math.cos(74.8 * D2R)], nS = [Math.sin(168.68 * D2R), Math.cos(168.68 * D2R)], off = 2 + 6.4 / 2
    const det = nE[0] * nS[1] - nE[1] * nS[0]
    const T = [C[0] + (off * nS[1] - nE[1] * off) / det, C[1] + (nE[0] * off - nS[0] * off) / det]
    const turn = streetUTM.reduce((m, p) => (Math.hypot(p[0] - C[0], p[1] - C[1]) < Math.hypot(m[0] - C[0], m[1] - C[1]) ? p : m))
    row('G19', `the street's turn vertex from the centre line round S10-02's corner (${T[0].toFixed(1)}, ${T[1].toFixed(1)})`, Math.hypot(turn[0] - T[0], turn[1] - T[1]), 0, 2.0, 'abs', 'S10-02 corner 446012, 3599936; the street\'s centre 2 m plus 3.2 m off both faces (S9-08); sides 164.8 and 258.7 (PRECINCT 1.3)')
    const old = [446000, 3599880]
    const pts = [...streetUTM, ...(cams ? cams.path.map((p) => p.at) : [])]
    row('G19', "MAP and path points within 10 m of WALK's old turn (446000, 3599880)", pts.filter((p) => Math.hypot(p[0] - old[0], p[1] - old[1]) < 10).length, 0, 0, 'abs', 'G-C2-19', 'count')
    const e = prism1('esagila')
    if (e) {
      const mid = [(e.utm[0][0] + e.utm[1][0]) / 2, (e.utm[0][1] + e.utm[1][1]) / 2]
      const sd = Math.min(...streetUTM.slice(1).map((q, i) => segD(mid, streetUTM[i], q)))
      row('G20', "Esagila's north front to the street's centre line", sd, 100, 10, 'abs', 'G-C2-20, S11-10: about 100 m of undug ground')
      const band = [e.utm[0], e.utm[1], [e.utm[1][0], e.utm[1][1] + sd], [e.utm[0][0], e.utm[0][1] + sd]]
      const n = [...b.prisms.map((p) => ({ id: p.id, name: p.name, pts: p.poly.map(U) })), ...b.ramps.map((r) => ({ id: r.id, name: '', pts: [U(r.a), U(r.b)] }))]
        .filter((q) => /gate|door|ramp/i.test(`${q.id} ${q.name}`) && !/^precinct|^gate-|^north-gate/.test(q.id) && q.pts.some((p) => inPoly(p, band))).length
      row('G20', "gate, door or ramp bodies between Esagila's north front and the street", n, 0, 0, 'abs', 'G-C2-20: no gate drawn on the street', 'count')
    }
    row('G20', 'the ground there classed guessed', plan.ground.plan === 'G' && plan.ground.height === 'G' ? 1 : 0, 1, 0, 'abs', 'G-C2-14, G-C2-20', 'count')
  }

  /* ── N1 the Nabu temple's floor (the record's bab.nabu.plan, settled: +8.0 m, P2021 p. 168) ── */
  {
    const nb = plan.blocks.find((q) => q.id === 'nabu')
    row('N1', "Nabu temple: the block's base (its floor)", nb ? nb.base : NaN, 8.0, 0.05, 'abs', 'P2021 p. 168 (re-read): the rebuilt temple at +8.0 m')
    row('N1', "Nabu temple: the height's source names +8.0 m (P2021 p. 168)", nb && /\+8\.0 m/.test(nb.hsrc ?? '') && /P2021 p\. 168/.test(nb.hsrc ?? '') ? 1 : 0, 1, 0, 'abs', 'the record bab.nabu.plan', 'count')
  }

  /* ── B1, B2 two source lines (SETTLED B) ── */
  {
    const ng = plan.blocks.find((q) => q.id === 'north-gate')
    row('B1', "north-gate's source line names the door as ours", ng && JSON.stringify(ng).includes("door ours (4.6 m in Pedersén's model)") ? 1 : 0, 1, 0, 'abs', 'TO-SETTLE B1', 'count')
    row('B2', "the street's source line: 3 percent near the gate", plan.street.src.includes('about 3 percent near the gate') ? 1 : 0, 1, 0, 'abs', 'TO-SETTLE B2', 'count')
  }
  return rows
}

export function table(rows) {
  const f = (v) => (v === null || v === undefined ? 'none' : typeof v === 'number' ? String(+v.toFixed(3)) : String(v))
  const cmp = (r) => (r.cmp === 'le' ? `<= ${r.target}` : r.cmp === 'ge' ? `>= ${r.target}` : `${r.target} +- ${r.tol}`)
  const lines = ['| pt | measure | MAP | target | delta | pass |', '|---|---|---|---|---|---|']
  for (const r of rows) {
    const delta = r.value === null ? 'none' : f(r.value - r.target)
    lines.push(`| ${r.pt} | ${r.name} | ${f(r.value)} ${r.unit} | ${cmp(r)} | ${delta} | ${r.pass ? 'pass' : 'FAIL'} |`)
  }
  const n = rows.filter((r) => r.pass).length
  lines.push('', `${n} of ${rows.length} pass`)
  return lines.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
  // --map <dir>: another copy of the map's folder (plan.ts, map-plan.json, map-cams.json), e.g. a base for a like-for-like before
  const dir = arg('--map') ?? MAP
  const { buildPlan, makeFrame } = await import(join(dir, 'plan.ts'))
  const plan = JSON.parse(readFileSync(arg('--plan') ?? join(dir, 'map-plan.json'), 'utf8'))
  const cams = JSON.parse(readFileSync(join(dir, 'map-cams.json'), 'utf8'))
  const rows = measure(plan, cams, { buildPlan, makeFrame })
  const md = table(rows)
  console.log(md)
  if (arg('--md')) writeFileSync(arg('--md'), md + '\n')
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(rows, null, 1))
  process.exit(rows.every((r) => r.pass) ? 0 : 1)
}
