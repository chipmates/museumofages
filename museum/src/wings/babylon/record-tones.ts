/* THE RECORD'S CLASSES PAINTED: the class view's attributes on the map's bodies (mass.ts) and the gate's walls
   (gate-mesh.ts) rewritten from each body's record rows (record.ts). Only the class attributes change; the grey view,
   the geometry and the cameras do not. A body's own letters are kept from the first pass, so a page can paint again
   at another stop and a body without a row still falls back on its plan's letters. */

import type { BufferAttribute, BufferGeometry, InstancedBufferAttribute, Mesh, Object3D } from 'three/webgpu'
import type { Built as MapBuilt } from './map/plan'
import type { Panel } from './gate/gate-geom'
import { LETTER_OF_TONE, TONE, type BodyClasses, type Letter, type Namer, type Shown } from './record'

type Attr = BufferAttribute | InstancedBufferAttribute

/** the attribute's values as the plans set them, kept on the first pass */
const ORIGINAL = new WeakMap<Attr, Float32Array>()
function original(a: Attr): Float32Array {
  let o = ORIGINAL.get(a)
  if (!o) {
    o = Float32Array.from(a.array as ArrayLike<number>)
    ORIGINAL.set(a, o)
  }
  return o
}
const letterAt = (v: number): Letter => LETTER_OF_TONE[Math.max(0, Math.min(2, Math.round(v)))]!

/** what a pass painted: the bodies it named, and those a missing row left on their letters */
export interface Painted { bodies: number; byLetters: string[] }

function namerWithMemo(name: Namer): { of: (body: string, foot: Letter, above: Letter) => BodyClasses; done: () => Painted } {
  const memo = new Map<string, BodyClasses>()
  const byLetters = new Set<string>()
  const bodies = new Set<string>()
  return {
    of(body, foot, above) {
      const key = `${body}|${foot}${above}`
      let c = memo.get(key)
      if (!c) {
        c = name(body, [foot, above])
        memo.set(key, c)
        if (c.missing.length) byLetters.add(body)
      }
      bodies.add(body)
      return c
    },
    done: () => ({ bodies: bodies.size, byLetters: [...byLetters] }),
  }
}

/** the map's bodies as buildBodies made them: each prism by its plan id (the `pid` attribute, the ramps -1), each box
    by its own id, the houses as one type, the street; their `cls` is (above the band, the band) */
export function toneMapBodies(group: Object3D, built: MapBuilt, name: Namer): Painted {
  const n = namerWithMemo(name)
  const paint = (a: Attr, bodyOf: (i: number) => string): void => {
    const o = original(a), arr = a.array as Float32Array
    for (let i = 0; i < a.count; i++) {
      const c = n.of(bodyOf(i), letterAt(o[i * 2 + 1]!), letterAt(o[i * 2]!))
      arr[i * 2] = TONE[c.above]
      arr[i * 2 + 1] = TONE[c.foot]
    }
    a.needsUpdate = true
  }
  const blocks = group.getObjectByName('blocks') as Mesh | undefined
  if (blocks) {
    const pid = blocks.geometry.getAttribute('pid')
    paint(blocks.geometry.getAttribute('cls') as Attr, (i) => {
      const p = pid.getX(i)
      return p < 0 ? 'map:ramps' : `map:${built.prisms[p]!.id}`
    })
  }
  const houses = group.getObjectByName('houses') as Mesh | undefined
  if (houses) paint(houses.geometry.getAttribute('cls') as Attr, () => 'map:house')
  const rest = built.boxes.filter((b) => b.group !== 'house' && !b.hidden)
  const towers = group.getObjectByName('towers-and-piers') as Mesh | undefined
  if (towers) paint(towers.geometry.getAttribute('cls') as Attr, (i) => `map:${rest[i]!.id}`)
  const street = group.getObjectByName('street') as Mesh | undefined
  if (street) paint(street.geometry.getAttribute('cls') as Attr, () => 'map:street')
  return n.done()
}

/** a rows' top no point reaches: the gate's frame runs below 0 on the lion street, so -1 is no "none" there */
export const NO_ROWS = -1e6

/** the gate's wall soup, split at its body marks: `gCls` is (the band's class, above it, the band's top, the rows' top);
    the rows' top goes, since the relief rows are bodies of their own (the panels) with their own rows */
export function toneGateWalls(walls: BufferGeometry, marks: Array<{ id: string; from: number }>, name: Namer): Painted {
  const n = namerWithMemo(name)
  const a = walls.getAttribute('gCls') as Attr
  const o = original(a), arr = a.array as Float32Array
  marks.forEach((m, k) => {
    const to = k + 1 < marks.length ? marks[k + 1]!.from : a.count
    if (to <= m.from) return
    const c = n.of(`gate:${m.id}`, letterAt(o[m.from * 4]!), letterAt(o[m.from * 4 + 1]!))
    for (let i = m.from; i < to; i++) {
      arr[i * 4] = TONE[c.foot]
      arr[i * 4 + 1] = TONE[c.above]
      arr[i * 4 + 3] = NO_ROWS
    }
  })
  a.needsUpdate = true
  return n.done()
}

/** one body's (band, above) tones for a page's own attribute, from its letters where it has no row */
export function bodyTones(name: Namer, body: string, letters: readonly [Letter, Letter]): { foot: number; above: number; c: BodyClasses } {
  const c = name(body, letters)
  return { foot: TONE[c.foot], above: TONE[c.above], c }
}

/** each relief panel's tone, in the order a panel set lists them (gate-mesh.ts assemble) */
export function panelTones(panels: Panel[], name: Namer): number[] {
  return panels.map((q) => TONE[name(`panel:${q.id}`, [q.cls, q.cls]).above])
}

/** the paving's strip tones, the middle first: its strips' rows, else its one row for all three */
export function pavingTones(name: Namer, letters: readonly [Letter, Letter]): [number, number, number] {
  const c = name('gate:paving', letters)
  const s: Shown[] = c.strips.length === 3 ? c.strips.map((x) => x.shown) : [c.above, c.above, c.above]
  return [TONE[s[0]!], TONE[s[1]!], TONE[s[2]!]]
}
