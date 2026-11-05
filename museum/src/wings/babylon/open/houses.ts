/* THE ARRIVAL'S HOUSES, pure: the map's lots (plan.ts lays them on a grid,
   four ranges round a centred court), rebuilt as the type the record gives
   (REC bab.houses.type, Guessed): one storey about 3 m high, rooms round one
   court that takes 10 to 15 percent of the plot (0.12 on average), no windows
   on the street. So that the grid does not read as a pattern from the air (the
   dug quarters are crowded and irregular, K1914 on Merkes), each house takes
   its own court size and place, its own ranges' heights, a turn of about a
   degree and a little shift on its lot, and a few lots stay open ground. Every
   number here is ours. No imports.
   The map draws the same houses as trays (`trays`, the same lots and courts): each range a flat roof with its parapet
   round the outside and the court (House VI's 45 cm, P2021 p. 37 to 38 for the roofs), the street ranges higher than
   the side ranges, a room on some roofs (P2021 p. 242: one storey, a possible room on the flat roof), one street door
   a house; heights, sizes, the door's and the roof room's places Guessed, ours. */

/** `butt`: the box's sides that meet another room of the same house (1 its -u side, 2 +u, 4 -v, 8 +v), where no parapet runs;
    `block`: the block of lots between streets and lanes the house stands in */
export interface HouseBox { id: string; house: number; part: number; butt: number; block: number; x: number; z: number; sx: number; sz: number; yaw: number; y0: number; y1: number; gy: number }

/** one roof of a house seen from above: `rims` the sides with a parapet (bits as `butt`), `hide` per side (-u, +u, -v, +v)
    the level below which that side's face is not drawn (inside a neighbour), `door` the side carrying a door (-1 none)
    and its centre along that side from the side's -u or -v end; part 0 to 3 the ranges, 4 the court (its top only), 5 a
    room on the roof of tray `on` */
export interface HouseTray extends HouseBox { rims: number; hide: [number, number, number, number]; door: number; doorAt: number; doorW: number; doorH: number; on: number }

/** the parapet's width and its height over the roof (House VI's 45 cm wall; its height ours, House VI's is 60 cm) */
export const RIM = { w: 0.45, h: 0.5 }

interface MapBox { id: string; group: string; x: number; z: number; y0: number; y1: number; sx: number; sz: number; yaw: number }

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

export function rebuildHouses(boxes: MapBox[], ground: (x: number, z: number) => number): { boxes: HouseBox[]; houses: number; open: number; trays: HouseTray[]; parted: number } {
  const R = rng(5701)
  // the trays draw from their own stream, so the arrival's rooms stay as they were
  const R2 = rng(5702)
  const trays: HouseTray[] = []
  const by = new Map<number, Record<string, MapBox>>()
  for (const b of boxes) {
    const m = /^house-(\d+)-([nswe])$/.exec(b.id)
    if (!m) continue
    const k = Number(m[1])
    if (!by.has(k)) by.set(k, {})
    by.get(k)![m[2]!] = b
  }
  const out: HouseBox[] = []
  const lots = new Map<number, Lot>()
  let open = 0
  for (const [k, r] of by) {
    const n = r['n'], s = r['s'], w = r['w'], e = r['e']
    if (!n || !s || !w || !e) continue
    {
      const lu = [Math.cos(n.yaw), -Math.sin(n.yaw)], lv = [Math.sin(n.yaw), Math.cos(n.yaw)]
      const mx = (n.x + s.x) / 2, mz = (n.z + s.z) / 2
      lots.set(k, { U: mx * lu[0]! + mz * lu[1]!, V: mx * lv[0]! + mz * lv[1]!, hu: n.sx / 2, hv: (n.sz + s.sz + w.sz) / 2 })
    }
    if (R() < 0.025) { open++; continue }
    const yaw0 = n.yaw
    // the lot's own axes: u along the house's +x (the row), v across
    const cu = [Math.cos(yaw0), -Math.sin(yaw0)], cv = [Math.sin(yaw0), Math.cos(yaw0)]
    const cx = (n.x + s.x) / 2, cz = (n.z + s.z) / 2
    const W = n.sx - 0.6, D = n.sz + s.sz + w.sz - 0.6
    if (W < 6 || D < 6) continue
    const court = 0.1 + R() * 0.05
    const aspect = 0.8 + R() * 0.45
    let cw = Math.sqrt(court * W * D * aspect), cd = (court * W * D) / cw
    cw = Math.min(cw, W - 4.5)
    cd = Math.min(cd, D - 4.5)
    const fu = (W - cw) / 2, fv = (D - cd) / 2
    const ou = (R() - 0.5) * (fu - 2.2), ov = (R() - 0.35) * (fv - 2.2)
    const yaw = yaw0 + (R() - 0.5) * 0.04
    const du = (R() - 0.5) * 0.6, dv = (R() - 0.5) * 0.6
    const ox = cx + cu[0]! * du + cv[0]! * dv, oz = cz + cu[1]! * du + cv[1]! * dv
    const ca = [Math.cos(yaw), -Math.sin(yaw)], cb = [Math.sin(yaw), Math.cos(yaw)]
    const g = ground(ox, oz)
    const base = 2.8 + R() * 0.7
    // the court's edges in lot coordinates
    const u0 = ou - cw / 2, u1 = ou + cw / 2, v0 = ov - cd / 2, v1 = ov + cd / 2
    const ranges: Array<[string, number, number, number, number]> = [
      ['n', -W / 2, W / 2, -D / 2, v0],
      ['s', -W / 2, W / 2, v1, D / 2],
      ['w', -W / 2 + 0.012, u0, v0 - 0.02, v1 + 0.02],
      ['e', u1, W / 2 - 0.012, v0 - 0.02, v1 + 0.02],
    ]
    // each range cut into rooms 4 to 7 m long, each room's roof its own height (steps of 15 to 45 cm), so a roof is never one
    // plane; neighbours butt end to end; the court's floor of baked brick (the dug courts were paved so) a box of its own
    const put = (part: number, name: string, a0: number, a1: number, b0: number, b1: number, top: number, butt = 0): void => {
      const mu = (a0 + a1) / 2, mv = (b0 + b1) / 2
      out.push({ id: `house-${k}-${name}`, house: k, part, butt, block: 0, x: ox + ca[0]! * mu + cb[0]! * mv, z: oz + ca[1]! * mu + cb[1]! * mv, sx: a1 - a0, sz: b1 - b0, yaw, y0: g - 0.8, y1: top, gy: g })
    }
    ranges.forEach(([name, a0, a1, b0, b1], i) => {
      const alongU = a1 - a0 >= b1 - b0
      const len = alongU ? a1 - a0 : b1 - b0
      const rooms = Math.max(1, Math.round(len / (4 + R() * 3)))
      let last = -1
      // the side ranges meet the north and south ranges at both ends
      const ends = name === 'w' || name === 'e' ? 4 | 8 : 0
      for (let r = 0; r < rooms; r++) {
        let h = base + (Math.floor(R() * 4) - 1.5) * 0.15
        if (Math.abs(h - last) < 0.1) h += 0.15
        last = h
        const f0 = r / rooms, f1 = (r + 1) / rooms
        const seam = (r > 0 ? 1 : 0) | (r < rooms - 1 ? 2 : 0)
        if (alongU) put(i, `${name}${r}`, a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1, b0, b1, g + h, ends | seam)
        else put(i, `${name}${r}`, a0, a1, b0 + (b1 - b0) * f0, b0 + (b1 - b0) * f1, g + h, ends | (seam << 2))
      }
    })
    put(4, 'court', u0 - 0.01, u1 + 0.01, v0 - 0.01, v1 + 0.01, g + 0.12)
    houseTrays(trays, R2, k, { W, D, u0, u1, v0, v1, base, g, yaw, ox, oz })
  }
  const parted = partTops(out)
  const blockOf = blocks(lots)
  for (const b of out) b.block = blockOf.get(b.house) ?? 0
  for (const t of trays) t.block = blockOf.get(t.house) ?? 0
  streetDoors(trays, lots, blockOf, R2)
  return { boxes: out, houses: by.size - open, open, trays, parted }
}

/** the step a room's top takes down where it would share its level with a room it overlaps, and the nearness that counts
    as shared (the geometry check's bed is 2 mm) */
export const PART = { step: 0.005, near: 0.003 }

/** no two rooms whose plans overlap keep one top: the later room steps down PART.step (5 mm, unseen), so the two roofs
    never fight where a side range reaches 2 cm into an end range, or where two neighbours' turned houses meet; the
    later room lies inside the earlier one there, so nothing of it shows. Returns the rooms stepped */
function partTops(list: HouseBox[]): number {
  const CELL = 16, grid = new Map<number, number[]>()
  const key = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096)
  const axes = list.map((b) => [Math.cos(b.yaw), -Math.sin(b.yaw), Math.sin(b.yaw), Math.cos(b.yaw)] as const)
  const cells = (b: HouseBox, a: readonly number[]): number[] => {
    const ex = (Math.abs(a[0]!) * b.sx + Math.abs(a[2]!) * b.sz) / 2, ez = (Math.abs(a[1]!) * b.sx + Math.abs(a[3]!) * b.sz) / 2
    const out: number[] = []
    for (let i = Math.floor((b.x - ex) / CELL); i <= Math.floor((b.x + ex) / CELL); i++) for (let j = Math.floor((b.z - ez) / CELL); j <= Math.floor((b.z + ez) / CELL); j++) out.push(key(i, j))
    return out
  }
  // two turned rectangles overlap by more than a millimetre on every separating axis (a butt end to end does not count)
  const overlap = (p: number, q: number): boolean => {
    const A = list[p]!, B = list[q]!, a = axes[p]!, b = axes[q]!
    const dx = B.x - A.x, dz = B.z - A.z
    for (const [ax, az] of [[a[0]!, a[1]!], [a[2]!, a[3]!], [b[0]!, b[1]!], [b[2]!, b[3]!]] as Array<[number, number]>) {
      const rA = (A.sx * Math.abs(a[0]! * ax + a[1]! * az) + A.sz * Math.abs(a[2]! * ax + a[3]! * az)) / 2
      const rB = (B.sx * Math.abs(b[0]! * ax + b[1]! * az) + B.sz * Math.abs(b[2]! * ax + b[3]! * az)) / 2
      if (rA + rB - Math.abs(dx * ax + dz * az) <= 0.001) return false
    }
    return true
  }
  let stepped = 0
  list.forEach((b, i) => {
    const ks = cells(b, axes[i]!)
    const near = new Set<number>()
    for (const k of ks) for (const j of grid.get(k) ?? []) near.add(j)
    const over = [...near].filter((j) => overlap(i, j))
    for (let tries = 0; tries < 4 && over.some((j) => Math.abs(list[j]!.y1 - b.y1) < PART.near); tries++) {
      b.y1 -= PART.step
      if (tries === 0) stepped++
    }
    for (const k of ks) (grid.get(k) ?? grid.set(k, []).get(k)!).push(i)
  })
  return stepped
}

const NONE = Infinity, ALL = -Infinity

/** one house's trays in its lot's frame: the north and south ranges (-v and +v) full width, each cut in two at a step
    now and then, the west and east ranges between them, lower, their ends inside the end ranges; the court's floor; a
    room on some south roofs */
function houseTrays(out: HouseTray[], R: () => number, k: number, h: { W: number; D: number; u0: number; u1: number; v0: number; v1: number; base: number; g: number; yaw: number; ox: number; oz: number }): void {
  const { W, D, u0, u1, v0, v1, base, g, yaw, ox, oz } = h
  const ca = [Math.cos(yaw), -Math.sin(yaw)], cb = [Math.sin(yaw), Math.cos(yaw)]
  const first = out.length
  const put = (part: number, name: string, a0: number, a1: number, b0: number, b1: number, top: number, rims: number, hide: [number, number, number, number], y0 = g - 0.8): HouseTray => {
    const mu = (a0 + a1) / 2, mv = (b0 + b1) / 2
    const t: HouseTray = { id: `house-${k}-${name}`, house: k, part, butt: 15 & ~rims, block: 0, x: ox + ca[0]! * mu + cb[0]! * mv, z: oz + ca[1]! * mu + cb[1]! * mv, sx: a1 - a0, sz: b1 - b0, yaw, y0, y1: top, gy: g, rims, hide, door: -1, doorAt: 0, doorW: 0, doorH: 0, on: -1 }
    out.push(t)
    return t
  }
  // the south range's parapet tops where the rooms' highest roof stood (so the city's skyline and its long shadows stay),
  // its deck one storey about 3 m over the street; the north range a little lower, the side ranges lower still
  const sDeck = base + 0.2 - RIM.h
  const nDeck = sDeck - (0.1 + R() * 0.15)
  const hW = nDeck - (0.15 + R() * 0.1), hE = nDeck - (0.15 + R() * 0.1)
  const floorS = Math.max(hW, hE) + 0.15
  // now and then a range cut in two, its second part a step lower
  const endRange = (part: number, name: string, b0: number, b1: number, deck: number, outer: number, court: number): void => {
    const lower = Math.max(floorS, deck - (0.3 + R() * 0.2))
    if (W >= 12 && R() < 0.5 && deck - lower > 0.12) {
      const us = -W / 2 + W * (0.35 + R() * 0.3)
      const aHigh = R() < 0.5
      const ha = aHigh ? deck : lower, hb = aHigh ? lower : deck
      put(part, `${name}0`, -W / 2, us, b0, b1, g + ha, 1 | outer | court | (aHigh ? 2 : 0), [ALL, aHigh ? g + hb : NONE, ALL, ALL])
      put(part, `${name}1`, us, W / 2, b0, b1, g + hb, 2 | outer | court | (aHigh ? 0 : 1), [aHigh ? NONE : g + ha, ALL, ALL, ALL])
    } else put(part, name, -W / 2, W / 2, b0, b1, g + deck, 15, [ALL, ALL, ALL, ALL])
  }
  endRange(0, 'n', -D / 2, v0, nDeck, 4, 8)
  endRange(1, 's', v1, D / 2, sDeck, 8, 4)
  // the side ranges reach 2 cm into the end ranges, their ends never drawn
  put(2, 'w', -W / 2 + 0.012, u0, v0 - 0.02, v1 + 0.02, g + hW, 1 | 2, [ALL, ALL, NONE, NONE])
  put(3, 'e', u1, W / 2 - 0.012, v0 - 0.02, v1 + 0.02, g + hE, 1 | 2, [ALL, ALL, NONE, NONE])
  put(4, 'court', u0 - 0.01, u1 + 0.01, v0 - 0.01, v1 + 0.01, g + 0.12, 0, [NONE, NONE, NONE, NONE])
  // a room on the south roof of about one house in five, at one end of its longest part, inside the parapets
  if (R() < 0.22) {
    let host = -1
    for (let i = first; i < out.length; i++) if (out[i]!.part === 1 && (host < 0 || out[i]!.sx > out[host]!.sx)) host = i
    const H = out[host]!
    const inU0 = -H.sx / 2 + (H.rims & 1 ? RIM.w : 0) + 0.08, inU1 = H.sx / 2 - (H.rims & 2 ? RIM.w : 0) - 0.08
    const inV0 = -H.sz / 2 + RIM.w + 0.08, inV1 = H.sz / 2 - RIM.w - 0.08
    const len = Math.min(3 + R() * 1.5, inU1 - inU0)
    if (len > 2.4 && inV1 - inV0 > 1.8) {
      const atEnd = R() < 0.5
      const a0 = atEnd ? inU0 : inU1 - len, a1 = a0 + len
      // the host's local frame: its centre is (H.x, H.z); the room sits on its deck
      const hu = (H.x - ox) * ca[0]! + (H.z - oz) * ca[1]!, hv = (H.x - ox) * cb[0]! + (H.z - oz) * cb[1]!
      const r = put(5, 'roofroom', hu + a0, hu + a1, hv + inV0, hv + inV1, H.y1 + 2.0 + R() * 0.4, 0, [ALL, ALL, ALL, ALL], H.y1 - 0.05)
      r.on = host
      // its door faces the court (-v), in its middle
      r.door = 2; r.doorAt = len / 2; r.doorW = 0.85; r.doorH = 1.75
    }
  }
}

/** each house's street door, on the side of its lot no other lot of its block touches (the two rows stand back to back),
    in the longest part of that range, a metre or more from its ends */
function streetDoors(trays: HouseTray[], lots: Map<number, Lot>, blockOf: Map<number, number>, R: () => number): void {
  const inBlock = new Map<number, Array<[number, Lot]>>()
  for (const [k, l] of lots) (inBlock.get(blockOf.get(k) ?? -1) ?? inBlock.set(blockOf.get(k) ?? -1, []).get(blockOf.get(k) ?? -1)!).push([k, l])
  const front = new Map<number, number>()
  for (const [k, l] of lots) {
    let minus = false, plus = false
    for (const [j, o] of inBlock.get(blockOf.get(k) ?? -1) ?? []) {
      if (j === k || Math.abs(o.U - l.U) >= o.hu + l.hu - 1) continue
      if (Math.abs(o.V + o.hv - (l.V - l.hv)) < 1.5) minus = true
      if (Math.abs(o.V - o.hv - (l.V + l.hv)) < 1.5) plus = true
    }
    if (!minus) front.set(k, 0)
    else if (!plus) front.set(k, 1)
  }
  const best = new Map<number, HouseTray>()
  for (const t of trays) {
    const f = front.get(t.house)
    if (f === undefined || t.part !== f || t.sx < 3) continue
    const b = best.get(t.house)
    if (!b || t.sx > b.sx) best.set(t.house, t)
  }
  for (const t of best.values()) {
    t.door = t.part === 0 ? 2 : 3
    t.doorAt = 1 + R() * (t.sx - 2)
    t.doorW = 1 + R() * 0.2
    t.doorH = 1.9 + R() * 0.2
  }
}

interface Lot { U: number; V: number; hu: number; hv: number }

/** the lots' blocks: lots touch inside a block (within a metre), lanes and streets (3.2 m and more) part them; first the
    columns across the grid, then the blocks along each column */
function blocks(lots: Map<number, Lot>): Map<number, number> {
  const out = new Map<number, number>()
  const L = [...lots.entries()].sort((a, b) => a[1].U - a[1].hu - (b[1].U - b[1].hu))
  let col: Array<[number, Lot]> = [], end = -Infinity, nb = 0
  const flush = (): void => {
    col.sort((a, b) => a[1].V - a[1].hv - (b[1].V - b[1].hv))
    let vEnd = -Infinity
    for (const [k, l] of col) {
      if (l.V - l.hv > vEnd + 1) nb++
      vEnd = Math.max(vEnd, l.V + l.hv)
      out.set(k, nb)
    }
    col = []
  }
  for (const e of L) {
    if (e[1].U - e[1].hu > end + 1) { flush(); end = -Infinity }
    col.push(e)
    end = Math.max(end, e[1].U + e[1].hu)
  }
  flush()
  return out
}
