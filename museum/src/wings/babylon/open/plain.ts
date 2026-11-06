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
/** a plant of the plain: a date palm by its row (canal, river, outer, city; `detail` the palm's preset where the
    flight passes it closer than the far preset holds) or a bank plant by its kind (reed, tamarisk, poplar, willow) */
export interface Palm { x: number; z: number; s: number; yaw: number; lean: number; row: string; detail?: 'near' | 'mid' }

/** the flight's way down (open-cams.json as flight.ts resolves it, every 2 s, UTM and level): the palm presets' bands */
const DESCENT: Array<[number, number, number]> = [
  [445380, 3601950, 330], [445386, 3601930, 325], [445415, 3601830, 297], [445473, 3601657, 243], [445549, 3601475, 173],
  [445633, 3601314, 103], [445695, 3601195, 46], [445720, 3601115, 17], [445729, 3601069, 10], [445734, 3601041, 9],
  [445737, 3601021, 10], [445739, 3600991, 11],
]
export interface Plain {
  /** the area the plain's map covers (scene metres): x0, z0 and its side */
  domain: { x0: number; z0: number; size: number }
  canals: Canal[]
  fields: Field[]
  /** grove floors: polygons under the palms, for the map */
  groves: P2[][]
  palms: Palm[]
  /** the inner city's outline on each bank (the walls' lines closed along the river): inside the walls */
  inner: P2[][]
  /** how many of `fields` are the outer city's garden plots (the last ones) */
  gardens: number
  /** how many of `fields` are the river belt's plots (just before the gardens; tone 4 a plot under palms) */
  belt: number
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

  /* the outer city's gardens north of the moat (bab.green.outercity, Guessed): a mosaic of small plots on a jittered
     lattice, so no two are the same shape, some bare or fallow, fed by a few small channels off the river along the
     lattice's rows; every line ours */
  const gardens: Field[] = []
  const gChannels: Canal[] = []
  {
    const GR = rng(5701)
    const cellE = 58, cellN = 46, E0g = 445420, N0g = 3601200, nE = 24, nN = 30
    const tilt = 0.21
    const node = (i: number, j: number): P2 => {
      const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453, h2 = Math.sin(i * 269.5 + j * 183.3) * 43758.5453
      const jx = (h - Math.floor(h) - 0.5) * cellE * 0.45, jz = (h2 - Math.floor(h2) - 0.5) * cellN * 0.45
      const e = E0g + i * cellE + j * cellN * tilt + jx, n = N0g + j * cellN - i * cellE * tilt * 0.35 + jz
      return s(e, n)
    }
    const inOuter = (x: number, z: number): boolean => inPoly(x, z, outerCity)
    for (let j = 0; j < nN; j++) {
      for (let i = 0; i < nE; i++) {
        const q = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)]
        const mx = (q[0]![0] + q[2]![0]) / 2, mz = (q[0]![1] + q[2]![1]) / 2
        if (!inOuter(mx, mz) || blocked(mx, mz, 8)) continue
        const u = GR()
        if (u < 0.2) continue
        // a plot keeps a metre or two of its cell for the bank between plots
        const inset = 1.6 + GR() * 1.2
        const pts = q.map((v) => [v[0] + (mx - v[0]) * (inset / 26), v[1] + (mz - v[1]) * (inset / 22)] as P2)
        gardens.push({ pts, tone: u < 0.62 ? 0 : u < 0.8 ? 1 : u < 0.92 ? 2 : 3 })
      }
    }
    for (const j of [4, 11, 19, 26]) {
      const pts: P2[] = []
      for (let i = 0; i <= nE; i++) {
        const v = node(i, j)
        if (inOuter(v[0], v[1]) && !blocked(v[0], v[1], -6)) pts.push(v)
        else if (pts.length > 1) break
      }
      if (pts.length > 2) gChannels.push({ id: `garden-${j}`, pts, w: 3 })
    }
  }

  /* the green belt along the river outside the walls (fields, dates and water: the kinds Known as a whole, every plot,
     channel and tree ours): strips running back from each bank, some under date palms with a crop beneath them, most
     open barley or wheat, a few fallow, and now and then a small channel off the river between two strips */
  const belt: Field[] = []
  const bChannels: Canal[] = []
  const beltCells = new Map<string, number[]>()
  {
    const BR = rng(9091)
    const D = { x0: -5200, z0: -5400, size: 12800 }
    const inDom = (q: P2): boolean => q[0] > D.x0 && q[0] < D.x0 + D.size && q[1] > D.z0 && q[1] < D.z0 + D.size
    const nearCanal = (x: number, z: number): boolean => canals.some((c) => lineD(x, z, c.pts) < 95)
    const n = river.length
    for (let i = 0; i < n; i++) {
      const a = river[i]!, b = river[(i + 1) % n]!
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (L < 40) continue
      const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nn: P2 = [-d[1], d[0]]
      const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const side = inPoly(m[0] + nn[0] * 6, m[1] + nn[1] * 6, river) ? -1 : 1
      const P = (tt: number, rr: number): P2 => [a[0] + d[0] * tt + nn[0] * side * rr, a[1] + d[1] * tt + nn[1] * side * rr]
      let t = 0
      while (t < L - 15) {
        const t1 = Math.min(L, t + 34 + BR() * 44)
        const r0 = 24 + BR() * 10, len = 150 + BR() * 120
        const cuts = BR() < 0.45 ? 2 : 1
        let ra = r0
        for (let c = 0; c < cuts; c++) {
          const rb = r0 + (len * (c + 1)) / cuts
          const pts: P2[] = [P(t + 1.4, ra + 1.4), P(t1 - 1.4, ra + 1.4), P(t1 - 1.4, rb - 1.4), P(t + 1.4, rb - 1.4)]
          const mid = P((t + t1) / 2, (ra + rb) / 2)
          // a strip in a bend's inside overlaps its neighbour's: kept only where it stands as far out as it was drawn
          const ok = inDom(mid) && !inPoly(mid[0], mid[1], river) && Math.abs(polyD(mid[0], mid[1], river) - (ra + rb) / 2) < 25 &&
            !blocked(mid[0], mid[1], 10) && !inPoly(mid[0], mid[1], outerCity) && !nearCanal(mid[0], mid[1]) &&
            pts.every((q) => !inPoly(q[0], q[1], river))
          if (ok) {
            // the date gardens keep to the water, the open fields lie further back
            const u = BR(), palmy = cuts === 1 ? 0.48 : c === 0 ? 0.66 : 0.26
            const v = (u - palmy) / (1 - palmy)
            const tone = u < palmy ? 4 : v < 0.55 ? 0 : v < 0.77 ? 1 : v < 0.92 ? 2 : 3
            const idx = belt.length
            belt.push({ pts, tone })
            const xs = pts.map((q) => q[0]), zs = pts.map((q) => q[1])
            for (let cx = Math.floor(Math.min(...xs) / 80); cx <= Math.floor(Math.max(...xs) / 80); cx++) {
              for (let cz = Math.floor(Math.min(...zs) / 80); cz <= Math.floor(Math.max(...zs) / 80); cz++) {
                const key = `${cx},${cz}`
                const l = beltCells.get(key)
                if (l) l.push(idx)
                else beltCells.set(key, [idx])
              }
            }
          }
          ra = rb
        }
        if (BR() < 0.22) {
          const e = P(t1, r0 + len), q = P(t1, 60)
          if (inDom(e) && !blocked(e[0], e[1], 0) && !blocked(q[0], q[1], -8) && !inPoly(e[0], e[1], outerCity)) {
            bChannels.push({ id: `belt-${i}-${Math.round(t)}`, pts: [P(t1, 2), e], w: 2.5 })
          }
        }
        t = t1
      }
    }
  }
  /** the belt plot a point stands in, or -1 */
  const beltAt = (x: number, z: number): number => {
    for (const idx of beltCells.get(`${Math.floor(x / 80)},${Math.floor(z / 80)}`) ?? []) if (inPoly(x, z, belt[idx]!.pts)) return idx
    return -1
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
    /* a grove is planted in rows, but every grove its own: a cell of about 240 m (its edges warped) gives the rows' direction,
       spacing and drift; a slow density field makes clumps and clearings. A candidate is moved onto its grove's own row
       lattice, and a lattice point is taken once */
    const fr = (v: number): number => v - Math.floor(v)
    const hs = (a: number, b: number, k: number): number => fr(Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453)
    const taken = new Set<string>()
    const grove = (x: number, z: number): { x: number; z: number; key: string; dens: number } | null => {
      const GS = 240
      const wx = x + 70 * Math.sin(z * 0.0061 + 1.3) + 35 * Math.sin(z * 0.017), wz = z + 70 * Math.sin(x * 0.0057 + 0.4) + 35 * Math.sin(x * 0.019)
      const gi = Math.floor(wx / GS), gj = Math.floor(wz / GS)
      const th = hs(gi, gj, 1) * Math.PI, sp = 7.2 + hs(gi, gj, 2) * 3.4
      const c = Math.cos(th), sn = Math.sin(th)
      const u = x * c + z * sn, v = -x * sn + z * c
      const drift = (5 + hs(gi, gj, 3) * 9) * Math.sin(v / (70 + hs(gi, gj, 4) * 90) + hs(gi, gj, 5) * 6.3)
      const iu = Math.round((u - drift) / sp), iv = Math.round(v / (sp * (0.9 + hs(gi, gj, 6) * 0.35)))
      const key = `${gi},${gj},${iu},${iv}`
      if (taken.has(key)) return null
      taken.add(key)
      const u0 = iu * sp + drift + (hs(iu, iv, 7) - 0.5) * 2.4, v0 = iv * sp * (0.9 + hs(gi, gj, 6) * 0.35) + (hs(iu, iv, 8) - 0.5) * 2.4
      // clumps and clearings, a few hundred metres across, and a grove now and then left out
      const d0 = Math.sin(x * 0.0093 + 2.1) * Math.sin(z * 0.0107 + 0.7) + 0.6 * Math.sin(x * 0.023 + z * 0.017 + 4.2)
      const dens = Math.max(0, Math.min(1.7, 0.75 + d0 * 0.9)) * (hs(gi, gj, 9) < 0.14 ? 0.15 : 1)
      return { x: u0 * c - v0 * sn, z: u0 * sn + v0 * c, key, dens }
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
    // along the river's banks outside the walls: the belt's palm plots full, its open plots bare, a few trees between
    for (let x = centre[0] - reach; x < centre[0] + reach; x += 9) {
      for (let z = centre[1] - reach; z < centre[1] + reach; z += 9) {
        const jx = x + (R() - 0.5) * 7, jz = z + (R() - 0.5) * 7
        if (inPoly(jx, jz, river)) continue
        const dr = polyD(jx, jz, river)
        const inOuter = inPoly(jx, jz, outerCity)
        if (dr < 330 && !inOuter) {
          const g = grove(jx, jz)
          if (!g) continue
          const bi = beltAt(g.x, g.z)
          const p = dr < 22 ? 0 : bi >= 0 ? (belt[bi]!.tone === 4 ? 0.62 + Math.min(g.dens, 1) * 0.3 : 0) : dr < 260 ? (0.5 - (dr - 22) * 0.0018) * g.dens : 0
          if (R() < p) put(g.x, g.z, 'river', 0)
        } else if (inOuter) {
          // the outer city's gardens: the river's grove band inside its wall as before, further in groves in clumps
          // between the plots, bare ground between them
          const g = grove(jx, jz)
          if (!g) continue
          if (dr < 260) { if (R() < (dr < 30 ? 0 : (0.78 - (dr - 30) * 0.0026) * g.dens)) put(g.x, g.z, 'river', 0) }
          else if (R() < Math.max(0, g.dens - 0.55) * 0.42) put(g.x, g.z, 'outer', 0)
        }
      }
    }
    /* the banks outside the walls where the bank is earth, as the record places each kind (every place ours): reed beds
       at the canals' edges and in the low ground by the river away from the city's quays (bab.green.reed); tamarisk on
       the canal banks (bab.green.tamarisk); Euphrates poplar and willow on the river and canal banks (bab.green.poplar).
       Mid-April: the reed's new shoots among last year's stems (it flowers July to October), the poplar and the willow
       in new leaf, the tamarisk not in bloom (June to October) */
    const BK = rng(5702)
    const nearCity = (x: number, z: number): boolean => inPoly(x, z, innerE) || inPoly(x, z, innerW) || polyD(x, z, innerE) < 70 || polyD(x, z, innerW) < 70
    const inWater = (x: number, z: number): boolean => water.some((w) => inPoly(x, z, w))
    const ok = (x: number, z: number): boolean => Math.hypot(x - centre[0], z - centre[1]) < reach * 0.8 && !inWater(x, z) && !nearCity(x, z) &&
      !keepOut.some((k) => (k.poly && inPoly(x, z, k.poly)) || (k.line && lineD(x, z, k.line) < 10))
    const patch = (x: number, z: number): number => Math.sin(x * 0.021 + 1.7) * Math.sin(z * 0.017 + 0.3) + 0.5 * Math.sin((x + z) * 0.043)
    const bank = (a: P2, b: P2, side: number, edge: number, treeEvery: number, kind: (u: number) => string, reedFrom: number): void => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (L < 1) return
      const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: P2 = [-d[1] * side, d[0] * side]
      for (let t = BK() * 3; t < L; t += 2 + BK() * 2) {
        const x = a[0] + d[0] * t, z = a[1] + d[1] * t
        // reed in beds along about half the bank, a clump a metre or two from the water
        if (patch(x, z) > -0.1) {
          const off = edge + 0.8 + BK() * 2.2
          const rx = x + n[0] * off, rz = z + n[1] * off
          if (ok(rx, rz) && polyD(rx, rz, innerE) > reedFrom && polyD(rx, rz, innerW) > reedFrom) palms.push({ x: rx, z: rz, s: 0.75 + BK() * 0.5, yaw: BK() * Math.PI * 2, lean: 0, row: 'reed' })
        }
        if (BK() < 4 / treeEvery) {
          const off = edge + 6 + BK() * 9
          const tx = x + n[0] * off, tz = z + n[1] * off
          const u = BK()
          if (ok(tx, tz)) palms.push({ x: tx, z: tz, s: 0.8 + BK() * 0.4, yaw: BK() * Math.PI * 2, lean: 0, row: kind(u) })
        }
      }
    }
    // the river: its outline's edges, the land side of each
    for (let i = 0; i < river.length; i++) {
      const a = river[i]!, b = river[(i + 1) % river.length]!
      const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      const nn: P2 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]
      const side = inPoly(m[0] + nn[0] * 6, m[1] + nn[1] * 6, river) ? -1 : 1
      bank(a, b, side, 0, 70, (u) => (u < 0.62 ? 'poplar' : 'willow'), 250)
    }
    // the plain's canals: both banks, the reed at the cut's edge, fewer trees than the river (the palms line them)
    for (const c of CANALS) {
      const pts = c.utm.map(([E, N]) => s(E, N))
      for (let i = 0; i + 1 < pts.length; i++) for (const side of [1, -1]) bank(pts[i]!, pts[i + 1]!, side, c.w / 2, 160, (u) => (u < 0.5 ? 'tamarisk' : u < 0.8 ? 'poplar' : 'willow'), 0)
    }
    /* the presets by the eye's distance to a palm's crown along the flight: the near preset within 110 m (a palm within
       about 60 m of an eye is near, and the mid's teeth read as teeth to about 120 m), the mid within 400 m */
    /* an orchard close outside the North Gate's road in the outer city (bab.green.palm.gate: groves in front of a city's
       gate are attested elsewhere, Babylon's are ours): clumps with gaps from the road's verge out to about 200 m on its
       west side and 70 m on its east, north of the lion walls' line and the dam, never on the road; its own numbers */
    {
      const RG = rng(5703)
      const road: P2[] = [s(445708.8, 3601172.8), s(445650.4, 3601472.1), s(445700, 3601700), s(445790, 3601920)]
      const near = new Map<string, Palm[]>()
      const cell = (x: number, z: number): string => `${Math.floor(x / 8)},${Math.floor(z / 8)}`
      for (const p of palms) { const k = cell(p.x, p.z); if (!near.has(k)) near.set(k, []); near.get(k)!.push(p) }
      const crowded = (x: number, z: number): boolean => {
        const i = Math.floor(x / 8), j = Math.floor(z / 8)
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of near.get(`${i + a},${j + b}`) ?? []) if (Math.hypot(q.x - x, q.z - z) < 5.5) return true
        return false
      }
      const [, zN] = s(0, 3601600), [, zS] = s(0, 3601205)
      for (let z = zN; z < zS; z += 10) {
        for (let x = -320; x < 160; x += 10) {
          const jx = x + (RG() - 0.5) * 8, jz = z + (RG() - 0.5) * 8
          const d = lineD(jx, jz, road)
          // west or east of the road: the road's x at this z
          const west = jx < road[0]![0] + ((road[1]![0] - road[0]![0]) * (jz - road[0]![1])) / (road[1]![1] - road[0]![1])
          const reachOut = west ? 205 : 70
          if (d < 16 || d > reachOut) continue
          // clumps and clearings, a few tens of metres across, thinning away from the road
          const field = Math.sin(jx * 0.071 + 1.7) * Math.sin(jz * 0.064 + 0.3) + 0.5 * Math.sin(jx * 0.13 - jz * 0.11)
          const p = Math.max(0, field + 0.15) * (1 - 0.55 * (d - 16) / (reachOut - 16))
          if (RG() > p) continue
          if (blocked(jx, jz, 2) || crowded(jx, jz)) continue
          const q: Palm = { x: jx, z: jz, s: 0.62 + RG() * 0.68, yaw: RG() * Math.PI * 2, lean: (RG() - 0.5) * 0.18, row: 'gate' }
          palms.push(q)
          const k = cell(jx, jz)
          if (!near.has(k)) near.set(k, [])
          near.get(k)!.push(q)
        }
      }
    }
    const way = DESCENT.map(([E, N, y]) => { const [x, z] = s(E, N); return [x, y, z] as [number, number, number] })
    const eyeD = (x: number, y: number, z: number): number => {
      let d = Infinity
      for (let i = 0; i + 1 < way.length; i++) {
        const a = way[i]!, b = way[i + 1]!
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [x - a[0], y - a[1], z - a[2]]
        const t = Math.max(0, Math.min(1, (ab[0]! * ap[0]! + ab[1]! * ap[1]! + ab[2]! * ap[2]!) / (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2 || 1)))
        d = Math.min(d, Math.hypot(ap[0]! - ab[0]! * t, ap[1]! - ab[1]! * t, ap[2]! - ab[2]! * t))
      }
      return d
    }
    for (const p of palms) {
      if (['reed', 'tamarisk', 'poplar', 'willow'].includes(p.row)) continue
      const d = eyeD(p.x, 3 + 10 * p.s, p.z)
      if (d < 110) p.detail = 'near'
      else if (d < 400) p.detail = 'mid'
    }
    /* inside the walls (bab.green.palm.city, the kind attested, every place ours): palms want low ground near water, so
       they stand in clumps of two to five with gaps between, on the Libil-hegalla canal's south bank (its north bank is
       the South Palace), leaning out over the water, and on the low strip inside the north wall by the moats, short of
       the first houses; never on a quay, a street, a roof or in a court. Their own numbers, so the groves stay as drawn */
    const RC = rng(5702)
    const inner = (x: number, z: number): boolean => (inPoly(x, z, innerE) || inPoly(x, z, innerW)) && !water.some((w) => inPoly(x, z, w))
    const clump = (cx: number, cz: number, n: number, spread: number, lean: () => [number, number]): void => {
      for (let k = 0; k < n; k++) {
        const a = RC() * Math.PI * 2, r = k === 0 ? 0 : 2.6 + RC() * spread
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r
        if (!inner(x, z)) continue
        const [yaw, ln] = lean()
        palms.push({ x, z, s: 0.58 + RC() * 0.66, yaw, lean: ln, row: 'city', detail: 'mid' })
      }
    }
    const cl: P2[] = mapPlan.canal.line.map((q: number[]) => s(q[0]!, q[1]!))
    for (let i = 0; i + 1 < cl.length; i++) {
      const a = cl[i]!, b = cl[i + 1]!
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      for (let t = 6 + RC() * 8; t < L - 6; t += 15 + RC() * 21) {
        if (RC() < 0.16) continue
        const x = a[0] + ((b[0] - a[0]) * t) / L, z = a[1] + ((b[1] - a[1]) * t) / L + 7 + RC() * 3.5
        // toward the water (north, -z): the instance tilts about an east-west axis
        clump(x, z, 2 + Math.floor(RC() * 3.4), 2.4, () => [Math.PI + (RC() - 0.5) * 0.9, 0.05 + RC() * 0.17])
      }
    }
    const nw: P2[] = [s(445800, 3600830), s(446737, 3601360)]
    {
      const [a, b] = nw as [P2, P2]
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: P2 = [d[1], -d[0]]
      for (let t = 235 + RC() * 20; t < L - 60; t += 34 + RC() * 44) {
        if (RC() < 0.3) continue
        const r = -(12 + RC() * 18)
        clump(a[0] + d[0] * t + n[0] * r, a[1] + d[1] * t + n[1] * r, 2 + Math.floor(RC() * 4), 3.2, () => [RC() * Math.PI * 2, (RC() - 0.5) * 0.16])
      }
    }
  }
  return {
    domain: { x0: -5200, z0: -5400, size: 12800 },
    canals: [...canals, ...bChannels, ...gChannels], fields: [...fields, ...belt, ...gardens], groves, palms, inner: [innerE, innerW], gardens: gardens.length, belt: belt.length,
    says: 'canals, fields and groves of the plain: kinds Known as types (GREEN.settled), every line and place ours',
  }
}
