/* THE WEST FORTIFICATION IN THE RIVER, pure: the map's one block (its outline on
   C6.2, REC bab.westoutwork, In place) built as the record lets it stand: a low
   embankment 14 m wide on its river side, outer walls about 20 m thick round the
   space they close (P2021 p. 130 to 131; K1914 ch. XXIII). Every height is ours
   (REC bab.westoutwork.body, Guessed: the map's +12 against Pedersén's provisional
   +18); the embankment's top, the batter on its water face and the inner floor's
   level are ours too, each set over the map's ground so the ground never shows
   through them. No imports: node mounts it for the checks. */

import type { NorthPrism, P2 } from './north'

export interface OutworkSpec {
  /** the map's outline, UTM: north-west, north-east, south-east, south-west (the map's order) */
  poly: number[][]
  E0: number
  N0: number
  /** the plan's class band (the switch) */
  band: number
  kind: number
  /** the map's ground (scene x, z): the embankment and the inner floor stand over it, never under it */
  ground?: (x: number, z: number) => number
}

export function westOutwork(o: OutworkSpec): NorthPrism[] {
  const s = (q: number[]): P2 => [q[0]! - o.E0, o.N0 - q[1]!]
  const [NW, NE, SE, SW] = o.poly.map(s) as [P2, P2, P2, P2]
  const lerp = (a: P2, b: P2, f: number): P2 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  const lenW = Math.hypot(NW[0] - SW[0], NW[1] - SW[1])
  /** a point d metres in from the river face (d < 0: -d in from the land face) at fraction f of the length, 0 south */
  const pt = (d: number, f: number): P2 => {
    const w = lerp(SW, NW, f), e = lerp(SE, NE, f)
    const L = Math.hypot(e[0] - w[0], e[1] - w[1])
    const k = d >= 0 ? d / L : 1 + d / L
    return lerp(w, e, k)
  }
  const EMB = 14, WALL = 20
  const fw = WALL / lenW
  const base = { piece: 'bab.westoutwork.body', plan: 'M' as const, height: 'G' as const, band: o.band, kind: o.kind, y0: -5 }
  const inner: P2[] = [pt(EMB + WALL, fw), pt(-WALL, fw), pt(-WALL, 1 - fw), pt(EMB + WALL, 1 - fw)]
  /** the highest ground over a band of the outline (d0 to d1 in from the river face, d < 0 from the land face) */
  const highest = (d0: number, d1: number, f0: number, f1: number): number => {
    let h = -Infinity
    if (!o.ground) return h
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 40; j++) {
      const f = f0 + ((f1 - f0) * j) / 40, a = pt(d0, f), b = pt(d1, f), k = i / 12
      h = Math.max(h, o.ground(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k))
    }
    return h
  }
  // the embankment's top at least the later quay's +4.0 (REC bab.river.quay570), the inner floor at least +8; both clear of
  // the map's ground under them by 0.3 m (the Kasr's rise reaches about +10 under the north-east corner)
  const embTop = Math.max(4.0, highest(0, EMB, 0, 1) + 0.3)
  const floor = Math.min(11.0, Math.max(8.0, highest(EMB + WALL, -WALL, fw, 1 - fw) + 0.3))
  return [
    // the embankment on the river side, its water face battered 1.2 m
    { ...base, id: 'outwork-embankment', piece: 'bab.westoutwork', foot: [pt(0, 0), pt(EMB, 0), pt(EMB, 1), pt(0, 1)], top: [pt(1.2, 0), pt(EMB, 0), pt(EMB, 1), pt(1.2, 1)], y1: embTop },
    // the outer walls as one ring
    { ...base, id: 'outwork-walls', foot: [pt(EMB, 0), lerp(SE, NE, 0), lerp(SE, NE, 1), pt(EMB, 1)], holes: [inner], y1: 12.0 },
    // the space they close, its floor ours
    { ...base, id: 'outwork-inner', foot: inner, y1: floor },
  ]
}
