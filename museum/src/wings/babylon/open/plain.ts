/* THE PLAIN ROUND THE CITY, pure: canals, fields and date-palm groves as the
   record lets them stand (GREEN.settled rows). The plain was "cut up into
   channels" and watered from them (bab.green.water.channels, Known as a type,
   their lines at our date not known: these lines are ours); the fields lie
   between groves and canals in rectangles divided by low embankments
   (bab.green.field.plain, Known as a type); date palms grow in groves along the
   river and the canals outside the walls (bab.green.palm.plain, Known as a
   mass) and, guessed, by the canal and the moats inside them
   (bab.green.palm.city); gardens and groves fill the eastern outer city,
   guessed (bab.green.outercity). Nothing is planted between the lion walls, on
   a quay or in a dug court. Scene frame: x = E - E0, z = N0 - N. No imports. */

export type P2 = [number, number]

export interface Canal { id: string; pts: P2[]; w: number }
export interface Field { pts: P2[]; tone: number }
export interface Palm { x: number; z: number; s: number; yaw: number; lean: number; row: string }
export interface Plain {
  /** the area the plain's map covers (scene metres): x0, z0 and its side */
  domain: { x0: number; z0: number; size: number }
  canals: Canal[]
  fields: Field[]
  /** grove floors: polygons under the palms, for the map */
  groves: P2[][]
  palms: Palm[]
  says: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const inPoly = (x: number, z: number, poly: P2[]): boolean => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!, [xj, zj] = poly[j]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}
const segD = (x: number, z: number, a: P2, b: P2): number => {
  const ex = b[0] - a[0], ez = b[1] - a[1], L = ex * ex + ez * ez
  const u = L > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L)) : 0
  return Math.hypot(x - a[0] - u * ex, z - a[1] - u * ez)
}
const lineD = (x: number, z: number, line: P2[]): number => {
  let d = Infinity
  for (let i = 0; i + 1 < line.length; i++) d = Math.min(d, segD(x, z, line[i]!, line[i + 1]!))
  return d
}
const polyD = (x: number, z: number, poly: P2[]): number => {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segD(x, z, poly[i]!, poly[(i + 1) % poly.length]!))
  return d
}

/** the canals' lines (UTM), ours: off the river north and south of the city, on both banks, and across the outer plain */
const CANALS: Array<{ id: string; utm: Array<[number, number]>; w: number }> = [
  { id: 'north-east', utm: [[445860, 3602950], [446400, 3603080], [447300, 3602950], [448400, 3602720], [449800, 3602560], [451600, 3602300]], w: 9 },
  { id: 'north-east-b', utm: [[447300, 3602950], [448100, 3602250], [449300, 3601450], [450500, 3600500], [451700, 3599700]], w: 6 },
  { id: 'south-east', utm: [[446060, 3598560], [446900, 3598250], [448000, 3597950], [449500, 3597750], [451400, 3597600]], w: 9 },
  { id: 'south-east-b', utm: [[448000, 3597950], [449000, 3598700], [450100, 3599150], [451500, 3599300]], w: 5 },
  { id: 'west-north', utm: [[445330, 3601650], [444600, 3601850], [443500, 3602150], [442100, 3602250], [440600, 3602500]], w: 8 },
  { id: 'west-mid', utm: [[444380, 3600520], [443400, 3600650], [442200, 3600500], [440800, 3600700]], w: 6 },
  { id: 'west-south', utm: [[445620, 3598350], [444700, 3598000], [443400, 3597600], [441900, 3597400]], w: 8 },
  { id: 'outer-city', utm: [[446860, 3601420], [447400, 3600900], [447900, 3600300], [448300, 3599700]], w: 5 },
]

export function buildPlain(mapPlan: J, opts: { palms?: boolean; reach?: number } = {}): Plain {
  const E0: number = mapPlan.frame.E0, N0: number = mapPlan.frame.N0
  const s = (E: number, N: number): P2 => [E - E0, N0 - N]
  const R = rng(570)
  const river: P2[] = mapPlan.water.find((w: J) => w.id === 'euphrates').poly.map((q: number[]) => s(q[0]!, q[1]!))
  const water: P2[][] = mapPlan.water.map((w: J) => w.poly.map((q: number[]) => s(q[0]!, q[1]!)))
  const circuit = (id: string): P2[] => mapPlan.circuits.find((c: J) => c.id === id).line.map((q: number[]) => s(q[0]!, q[1]!))
  const innerEast = circuit('inner-east'), westCity = circuit('west-city'), outer = circuit('outer-east')
  // the inner city on both banks, closed along the river (the walls' own lines and the river front)
  const innerE: P2[] = [...innerEast, s(445560, 3599020), s(445480, 3600600), s(445520, 3600980), s(445720, 3601080)]
  const innerW: P2[] = [...westCity]
  // the outer city: the outer east wall's line closed along the river
  const outerCity: P2[] = [...outer, s(445980, 3598900), s(445800, 3599200), s(445600, 3600000), s(445500, 3600700), s(445460, 3601200), s(445600, 3601800), s(445800, 3602100), s(445905, 3603467)]
  const keepOut: Array<{ poly?: P2[]; line?: P2[]; d: number }> = [
    { poly: innerE, d: 95 }, { poly: innerW, d: 95 },
    { line: outer, d: 105 },
    // the lion street's line north of the moat, the North Palace's outworks, the Summer Palace (Babil)
    { line: [s(445697, 3601320), s(445703, 3601200), s(445735, 3601035)], d: 40 },
    // the way north of the dam and its painted continuation (city.ts OUTER_STREET, OUTER_TRACK)
    { line: [s(445708.8, 3601172.8), s(445650.4, 3601472.1), s(445700, 3601700), s(445790, 3601920)], d: 14 },
    { poly: [s(445340, 3600590), s(445720, 3600590), s(445730, 3601170), s(445340, 3601170)], d: 20 },
    { poly: [s(445900, 3603230), s(446080, 3603230), s(446080, 3603390), s(445900, 3603390)], d: 40 },
  ]
  const blocked = (x: number, z: number, extra = 0): boolean => {
    for (const w of water) if (inPoly(x, z, w) || polyD(x, z, w) < 14 + extra) return true
    for (const k of keepOut) {
      if (k.poly && (inPoly(x, z, k.poly) || polyD(x, z, k.poly) < k.d + extra)) return true
      if (k.line && lineD(x, z, k.line) < k.d + extra) return true
    }
    return false
  }
  const canals: Canal[] = CANALS.map((c) => ({ id: c.id, pts: c.utm.map(([E, N]) => s(E, N)), w: c.w }))

  /* fields: strips at right angles to each canal on both sides beyond its grove band, cut into rectangles with ditches */
  const fields: Field[] = []
  const groves: P2[][] = []
  for (const c of canals) {
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i]!, b = c.pts[i + 1]!
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: P2 = [-d[1], d[0]]
      for (const side of [-1, 1]) {
        const grove = 45 + R() * 70
        // the grove band along the levee
        const g0: P2 = [a[0] + n[0] * side * (c.w / 2 + 6), a[1] + n[1] * side * (c.w / 2 + 6)]
        const g1: P2 = [b[0] + n[0] * side * (c.w / 2 + 6), b[1] + n[1] * side * (c.w / 2 + 6)]
        const off = c.w / 2 + 6 + grove
        groves.push([g0, g1, [g1[0] + n[0] * side * grove, g1[1] + n[1] * side * grove], [g0[0] + n[0] * side * grove, g0[1] + n[1] * side * grove]])
        let t = 0
        while (t < L - 20) {
          const sw = 28 + R() * 46
          const len = 180 + R() * 320
          const t1 = Math.min(L, t + sw)
          let r0 = off
          // each strip cut once or twice across by a ditch
          const cuts = 1 + Math.floor(R() * 2)
          for (let k = 0; k < cuts; k++) {
            const r1 = off + (len * (k + 1)) / cuts
            const P = (tt: number, rr: number): P2 => [a[0] + d[0] * tt + n[0] * side * rr, a[1] + d[1] * tt + n[1] * side * rr]
            const pts = [P(t + 1.2, r0 + 1.2), P(t1 - 1.2, r0 + 1.2), P(t1 - 1.2, r1 - 1.2), P(t + 1.2, r1 - 1.2)]
            const mid = P((t + t1) / 2, (r0 + r1) / 2)
            if (!blocked(mid[0], mid[1])) {
              const u = R()
              fields.push({ pts, tone: u < 0.5 ? 0 : u < 0.72 ? 1 : u < 0.92 ? 2 : 3 })
            }
            r0 = r1
          }
          t = t1
        }
      }
    }
  }

  /* the palms: groves along the canals and the river outside the walls (a mass), gardens in the outer city, a few by the
     canal inside the walls; within `reach` metres of the city only, the far groves left to the map's tone */
  const palms: Palm[] = []
  if (opts.palms !== false) {
    const reach = opts.reach ?? 3600
    const centre = s(445800, 3600700)
    const put = (x: number, z: number, row: string, gap: number): void => {
      if (Math.hypot(x - centre[0], z - centre[1]) > reach) return
      if (blocked(x, z, gap)) return
      palms.push({ x, z, s: 0.75 + R() * 0.55, yaw: R() * Math.PI * 2, lean: (R() - 0.5) * 0.12, row })
    }
    // along the canals' levees, in a loose band
    for (const c of canals) {
      for (let i = 0; i + 1 < c.pts.length; i++) {
        const a = c.pts[i]!, b = c.pts[i + 1]!
        const L = Math.hypot(b[0] - a[0], b[1] - a[1])
        const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: P2 = [-d[1], d[0]]
        for (let t = 0; t < L; t += 9) for (const side of [-1, 1]) for (let r = c.w / 2 + 8; r < c.w / 2 + 70; r += 10) {
          if (R() > 0.62 - (r - c.w / 2) * 0.004) continue
          put(a[0] + d[0] * (t + (R() - 0.5) * 6) + n[0] * side * (r + (R() - 0.5) * 5), a[1] + d[1] * (t + (R() - 0.5) * 6) + n[1] * side * (r + (R() - 0.5) * 5), 'canal', 0)
        }
      }
    }
    // along the river's banks outside the walls: a band 30 to 260 m from the water
    for (let x = centre[0] - reach; x < centre[0] + reach; x += 9) {
      for (let z = centre[1] - reach; z < centre[1] + reach; z += 9) {
        const jx = x + (R() - 0.5) * 7, jz = z + (R() - 0.5) * 7
        if (inPoly(jx, jz, river)) continue
        const dr = polyD(jx, jz, river)
        const inOuter = inPoly(jx, jz, outerCity)
        if (dr < 260) {
          const p = dr < 30 ? 0 : 0.7 - (dr - 30) * 0.0024
          if (R() < p) put(jx, jz, 'river', 0)
        } else if (inOuter && R() < 0.05 + 0.1 * Math.max(0, Math.sin(jx * 0.004) * Math.cos(jz * 0.0031))) put(jx, jz, 'outer', 0)
      }
    }
    // inside the walls: a sparse row by the Libil-hegalla canal (guessed)
    const cl: P2[] = mapPlan.canal.line.map((q: number[]) => s(q[0]!, q[1]!))
    for (let i = 0; i + 1 < cl.length; i++) {
      const a = cl[i]!, b = cl[i + 1]!
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      for (let t = 20; t < L - 25; t += 17 + R() * 10) {
        const x = a[0] + ((b[0] - a[0]) * t) / L, z = a[1] + ((b[1] - a[1]) * t) / L + 6.5
        palms.push({ x, z, s: 0.7 + R() * 0.4, yaw: R() * Math.PI * 2, lean: (R() - 0.5) * 0.1, row: 'city' })
      }
    }
  }
  return {
    domain: { x0: -5200, z0: -5400, size: 12800 },
    canals, fields, groves, palms,
    says: 'canals, fields and groves of the plain: kinds Known as types (GREEN.settled), every line and place ours',
  }
}
