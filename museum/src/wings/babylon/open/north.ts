/* THE NORTH ENTRY, pure: the bodies the arrival flies past and lands among, at
   the detail the coverage asks for, in the lion street's frame (a along the
   street from the Ishtar Gate's north face toward the North Gate, c across it,
   + east; map-plan.json `frames.lion`). North to south: the dam over the moat
   with its sloping walls, the bastions at the moat's edge with small towers at
   their street angles, the walled stretch, the North Gate (two cross walls, each
   with a door on the axis, round a court), and the palace's north wall on the
   moat with its limestone foot. Every number here is a plan value with its
   record row in `piece`; heights, the doors and the battlements are ours (the
   rows say Guessed). No imports: node mounts it for the checks. */

export type Cls = 'M' | 'R' | 'G'
export type P2 = [number, number]

/** material kinds the page's north material branches on */
export const KIND = { gate: 0, dam: 1, wall: 2, brick: 3 } as const

/** a vertical body over an outline (scene x, z); `top`, vertex for vertex, where its sides lean in */
export interface NorthPrism {
  id: string
  piece: string
  plan: Cls
  height: Cls
  /** the plan's class below this level, the height's above (the evidence switch) */
  band: number
  kind: number
  foot: P2[]
  top?: P2[]
  /** openings through the body, top to foot (a ring of walls); not with a leaning `top` */
  holes?: P2[][]
  y0: number
  y1: number
}

/** a cross wall with a round-headed door on the street's axis, built as its elevation pushed through its thickness */
export interface NorthArched {
  id: string
  piece: string
  plan: Cls
  height: Cls
  band: number
  kind: number
  a0: number
  a1: number
  c0: number
  c1: number
  y0: number
  y1: number
  door: { half: number; floor: number; spring: number }
}

/** a row of battlements along an edge: from, to (scene), the wall's top, the side the wall lies on (unit, scene) */
export interface MerlonRun { id: string; piece: string; plan: Cls; height: Cls; band: number; kind: number; from: P2; to: P2; y: number; inward: P2 }

export interface NorthEntry {
  prisms: NorthPrism[]
  arched: NorthArched[]
  merlons: MerlonRun[]
  /** the map's bodies the entry replaces, and the two it trims (their new outlines, UTM) */
  drop: string[]
  trim: Record<string, Array<[number, number]>>
  /** the lion frame, for the material (scene origin, along, across) and the culvert's place along the dam */
  frame: { o: P2; a: P2; c: P2 }
  culvert: { a: number; half: number; crown: number }
  says: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const D2R = Math.PI / 180

export function northEntry(mapPlan: J, streetLevel: (x: number, z: number) => number, groundBand: number): NorthEntry {
  const E0: number = mapPlan.frame.E0, N0: number = mapPlan.frame.N0
  const L = mapPlan.frames.lion
  const o: P2 = [L.origin[0] - E0, N0 - L.origin[1]]
  const A: P2 = [Math.sin(L.bearing * D2R), -Math.cos(L.bearing * D2R)]
  const C: P2 = [Math.sin((L.bearing + 90) * D2R), -Math.cos((L.bearing + 90) * D2R)]
  const at = (a: number, c: number): P2 => [o[0] + a * A[0] + c * C[0], o[1] + a * A[1] + c * C[1]]
  /** the scene point back to (a, c) */
  const ac = (x: number, z: number): P2 => [(x - o[0]) * A[0] + (z - o[1]) * A[1], (x - o[0]) * C[0] + (z - o[1]) * C[1]]
  const quad = (a0: number, a1: number, c0: number, c1: number): P2[] => [at(a0, c0), at(a1, c0), at(a1, c1), at(a0, c1)]
  const lv = (a: number): number => {
    const [x, z] = at(a, 0)
    return streetLevel(x, z)
  }
  const utmOf = (p: P2): [number, number] => [+(p[0] + E0).toFixed(2), +(N0 - p[1]).toFixed(2)]
  /** the map outline cut where c passes `cMax` (westward bodies): each edge clipped, as a convex outline */
  const clipC = (polyUtm: number[][], cMax: number): Array<[number, number]> => {
    const pts = polyUtm.map((q) => ac(q[0]! - E0, N0 - q[1]!))
    const out: P2[] = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!
      const pin = p[1] <= cMax, qin = q[1] <= cMax
      if (pin) out.push(p)
      if (pin !== qin) {
        const t = (cMax - p[1]) / (q[1] - p[1])
        out.push([p[0] + (q[0] - p[0]) * t, cMax])
      }
    }
    return out.map(([a, c]) => utmOf(at(a, c)))
  }

  const prisms: NorthPrism[] = [], arched: NorthArched[] = [], merlons: MerlonRun[] = []
  const BAND = groundBand

  /* the North Gate: cross walls at a 178.5 to 181.8 and 208.2 to 212.0, 44.2 m across (c -21.9 to 22.3), the court 30.2 m
     clear between the side walls (c -14.9 and +15.3) (C6.2; REC bab.northgate.plan); its walls, door and top are ours */
  const NG = { c0: -21.9, c1: 22.3, top: 19.5, side: 18.5, door: 2.3, spring: 6.0 }
  for (const [id, a0, a1] of [['northgate-south', 178.5, 181.8], ['northgate-north', 208.2, 212.0]] as Array<[string, number, number]>) {
    const floor = lv((a0 + a1) / 2)
    arched.push({ id, piece: 'bab.northgate.body', plan: 'M', height: 'G', band: floor - 0.25 + BAND, kind: KIND.gate, a0, a1, c0: NG.c0, c1: NG.c1, y0: floor - 4, y1: NG.top, door: { half: NG.door, floor: floor - 0.3, spring: floor + NG.spring } })
    merlons.push(
      { id: `${id}-m-out`, piece: 'bab.northgate.body', plan: 'M', height: 'G', band: 0, kind: KIND.gate, from: at(id.endsWith('south') ? a0 : a1, NG.c0), to: at(id.endsWith('south') ? a0 : a1, NG.c1), y: NG.top, inward: id.endsWith('south') ? A : [-A[0], -A[1]] },
      { id: `${id}-m-in`, piece: 'bab.northgate.body', plan: 'M', height: 'G', band: 0, kind: KIND.gate, from: at(id.endsWith('south') ? a1 : a0, NG.c0), to: at(id.endsWith('south') ? a1 : a0, NG.c1), y: NG.top, inward: id.endsWith('south') ? [-A[0], -A[1]] : A },
    )
  }
  for (const [id, c0, c1, out] of [['northgate-side-w', -21.6, -14.9, -1], ['northgate-side-e', 15.3, 22.0, 1]] as Array<[string, number, number, number]>) {
    const floor = lv(195)
    prisms.push({ id, piece: 'bab.northgate.body', plan: 'M', height: 'G', band: floor - 0.25 + BAND, kind: KIND.gate, foot: quad(181.3, 208.7, c0, c1), y0: floor - 4, y1: NG.side })
    const edge = out < 0 ? c0 : c1, inner = out < 0 ? c1 : c0
    merlons.push(
      { id: `${id}-m-out`, piece: 'bab.northgate.body', plan: 'M', height: 'G', band: 0, kind: KIND.gate, from: at(182.3, edge), to: at(207.7, edge), y: NG.side, inward: out < 0 ? C : [-C[0], -C[1]] },
      { id: `${id}-m-in`, piece: 'bab.northgate.body', plan: 'M', height: 'G', band: 0, kind: KIND.gate, from: at(182.3, inner), to: at(207.7, inner), y: NG.side, inward: out < 0 ? [-C[0], -C[1]] : C },
    )
  }

  /* the walled stretch north of the gate: walls about 7 m thick, 30.0 to 32.9 m apart, splaying (REC bab.street.north-stretch);
     their height ours, a lion wall's 10 m over the street */
  const ST = { a0: 211.5, a1: 233, top: lv(220) + 10 }
  for (const [id, cIn0, cIn1, s] of [['stretch-w', -15.0, -16.4, -1], ['stretch-e', 15.3, 16.5, 1]] as Array<[string, number, number, number]>) {
    const foot: P2[] = [at(ST.a0, cIn0), at(ST.a1, cIn1), at(ST.a1, cIn1 + s * 7), at(ST.a0, cIn0 + s * 7)]
    prisms.push({ id, piece: 'bab.street.north-stretch', plan: 'R', height: 'G', band: lv(220) - 0.25 + BAND, kind: KIND.brick, foot, y0: lv(220) - 4, y1: ST.top })
    merlons.push({ id: `${id}-m`, piece: 'bab.street.north-stretch', plan: 'R', height: 'G', band: 0, kind: KIND.brick, from: at(212.6, cIn0 + s * 7), to: at(226.4, cIn0 + s * 7 + (cIn1 - cIn0) * 0.69), y: ST.top, inward: s < 0 ? C : [-C[0], -C[1]] })
  }

  /* the bastions where the palace's north wall turns west and the East Fortification's wall turns east, at about a 227 to 256,
     their street faces at c -12.0 and +11.8 (REC bab.street.north-bastions, in place as dug); small towers at their street
     angles (S1-17); every height ours */
  const BS = { a0: 227, a1: 256, top: lv(240) + 11, tower: lv(240) + 13 }
  for (const [id, cs, cw, s] of [['bastion-w', -12.0, -27.0, -1], ['bastion-e', 11.8, 27.0, 1]] as Array<[string, number, number, number]>) {
    prisms.push({ id, piece: 'bab.street.north-bastions', plan: 'M', height: 'G', band: lv(240) - 0.25 + BAND, kind: KIND.brick, foot: quad(BS.a0, BS.a1, Math.min(cs, cw), Math.max(cs, cw)), y0: -5, y1: BS.top })
    const t0 = cs + s * -0.6, t1 = cs + s * 6.4
    prisms.push({ id: `${id}-tower`, piece: 'bab.street.north-bastions', plan: 'M', height: 'G', band: lv(240) - 0.25 + BAND, kind: KIND.brick, foot: quad(249.4, 256.8, Math.min(t0, t1), Math.max(t0, t1)), y0: -5, y1: BS.tower })
    // battlements on the bastion's outer (moat) edge and its far side, and round the tower's top
    merlons.push(
      { id: `${id}-m-n`, piece: 'bab.street.north-bastions', plan: 'M', height: 'G', band: 0, kind: KIND.brick, from: at(BS.a1, cs + s * 7.6), to: at(BS.a1, cw - s * 0.9), y: BS.top, inward: [-A[0], -A[1]] },
      { id: `${id}-m-s`, piece: 'bab.street.north-bastions', plan: 'M', height: 'G', band: 0, kind: KIND.brick, from: at(233.6, cs + s * 0.9), to: at(248.6, cs + s * 0.9), y: BS.top, inward: s < 0 ? [-C[0], -C[1]] : C },
      { id: `${id}-tower-m-n`, piece: 'bab.street.north-bastions', plan: 'M', height: 'G', band: 0, kind: KIND.brick, from: at(256.8, Math.min(t0, t1) + 0.5), to: at(256.8, Math.max(t0, t1) - 0.5), y: BS.tower, inward: [-A[0], -A[1]] },
      { id: `${id}-tower-m-st`, piece: 'bab.street.north-bastions', plan: 'M', height: 'G', band: 0, kind: KIND.brick, from: at(250.0, t0), to: at(256.2, t0), y: BS.tower, inward: s < 0 ? [-C[0], -C[1]] : C },
    )
  }

  /* the dam over the moat: the street on a dam with sloping walls each side, about 36 m over the walls and 30 m between their
     inner lines (REC bab.dam.plan); its crest at the street (REC bab.dam.crest, ours); a narrow roofed culvert west to east
     through it (S1-02), its mouths drawn on the walls by the material */
  const DM = { a0: 236, a1: 330, foot: [-18.4, 18.6] as [number, number], crest: [-15.0, 15.2] as [number, number], y0: -5, top: 7.35 }
  prisms.push({
    id: 'dam', piece: 'bab.dam.crest', plan: 'R', height: 'G', band: -1.0, kind: KIND.dam,
    foot: quad(DM.a0, DM.a1, DM.foot[0], DM.foot[1]), top: quad(DM.a0, DM.a1, DM.crest[0], DM.crest[1]), y0: DM.y0, y1: DM.top,
  })

  /* the palace's north wall on the moat: the map's outline, its east end cut inside the west bastion; limestone to about +0.5,
     baked brick above (SET D7; REC bab.northpalace.limestone, .northwall.brick); battlements on its moat edge, ours */
  const nw = mapPlan.blocks.find((b: J) => b.id === 'north-wall')
  const nwPoly = clipC(nw.poly, -13)
  prisms.push({ id: 'northwall', piece: 'bab.northpalace.northwall.brick', plan: 'M', height: 'G', band: 0.5, kind: KIND.wall, foot: nwPoly.map(([E, N]) => [E - E0, N0 - N] as P2), y0: nw.base, y1: nw.top })
  {
    const north = Math.max(...nw.poly.map((q: number[]) => q[1]!))
    const west = Math.min(...nw.poly.map((q: number[]) => q[0]!))
    const eastAt = Math.max(...nwPoly.filter((q) => Math.abs(q[1] - north) < 0.01).map((q) => q[0]))
    merlons.push({ id: 'northwall-m', piece: 'bab.northpalace.northwall.brick', plan: 'M', height: 'G', band: 0, kind: KIND.wall, from: [west + 1 - E0, N0 - north], to: [eastAt - 1.5 - E0, N0 - north], y: nw.top, inward: [0, 1] })
  }
  /* the North Fortification behind it, cut the same way inside the walled stretch's west wall */
  const nf = mapPlan.blocks.find((b: J) => b.id === 'north-fortification')
  const trim = { 'north-fortification': clipC(nf.poly, -17) }

  return {
    prisms, arched, merlons,
    drop: ['north-gate', 'north-gate-north', 'north-gate-side-w', 'north-gate-side-e', 'dam-wall-w', 'dam-wall-e', 'north-wall'],
    trim,
    frame: { o, a: A, c: C },
    culvert: { a: 280, half: 0.6, crown: 0.7 },
    says: 'the north entry in the lion frame: plan values from C6.2 and E2.2 with their record rows; heights, doors, battlements and the culvert mouths ours',
  }
}
