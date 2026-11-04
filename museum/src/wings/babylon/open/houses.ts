/* THE ARRIVAL'S HOUSES, pure: the map's lots (plan.ts lays them on a grid,
   four ranges round a centred court), rebuilt as the type the record gives
   (REC bab.houses.type, Guessed): one storey about 3 m high, rooms round one
   court that takes 10 to 15 percent of the plot (0.12 on average), no windows
   on the street. So that the grid does not read as a pattern from the air (the
   dug quarters are crowded and irregular, K1914 on Merkes), each house takes
   its own court size and place, its own ranges' heights, a turn of about a
   degree and a little shift on its lot, and a few lots stay open ground. Every
   number here is ours. No imports. */

/** `butt`: the box's sides that meet another room of the same house (1 its -u side, 2 +u, 4 -v, 8 +v), where no parapet runs;
    `block`: the block of lots between streets and lanes the house stands in */
export interface HouseBox { id: string; house: number; part: number; butt: number; block: number; x: number; z: number; sx: number; sz: number; yaw: number; y0: number; y1: number; gy: number }

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

export function rebuildHouses(boxes: MapBox[], ground: (x: number, z: number) => number): { boxes: HouseBox[]; houses: number; open: number } {
  const R = rng(5701)
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
  }
  const blockOf = blocks(lots)
  for (const b of out) b.block = blockOf.get(b.house) ?? 0
  return { boxes: out, houses: by.size - open, open }
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
