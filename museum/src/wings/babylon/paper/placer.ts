/* THE LABELS ON A PLATE ARE PAGE TEXT, PLACED BY THE PLAN PLATE'S RULE:
   NOTHING DRAWN OVERLAPS ANYTHING ELSE DRAWN. Each label is tried at its
   places in order against everything already taken (the drawing's shapes as
   boxes, its lines as segments, the labels placed before it) and takes the
   first that is free; one that fits nowhere is left off, because the list
   beside the plate carries every one of them.

   A label is measured as the page draws it (any language, any face), so the
   rule holds without trusting one engine's text metrics to match another's.
   In a right-to-left page the places mirror: a label that stood to the right
   of its anchor stands to its left. The core is pure, so node tests it. */

export interface Box { l: number; t: number; r: number; b: number }
export interface Seg { ax: number; ay: number; bx: number; by: number }

/** where a label may stand round its anchor, in the order it is tried */
export type Side = 'right' | 'left' | 'above' | 'below' | 'above-right' | 'above-left' | 'below-right' | 'below-left' | 'on'

export interface LabelAsk {
  id: string
  /** the label's own size, measured */
  w: number
  h: number
  /** the point it names, in the plate's pixels */
  x: number
  y: number
  sides: readonly Side[]
  /** the air between the anchor and the label's near edge */
  gap: number
  /** how many steps of `gap` further out a side may go before it gives up */
  reach?: number
  /** labels that may touch this one's anchor shape, by the ids of taken boxes it names */
  over?: readonly string[]
}

export interface Taken extends Box { id?: string }
export interface Placed { id: string; box: Box | null; side: Side | null }

export const meets = (a: Box, b: Box): boolean => Math.min(a.r, b.r) > Math.max(a.l, b.l) && Math.min(a.b, b.b) > Math.max(a.t, b.t)
export const grown = (a: Box, by: number): Box => ({ l: a.l - by, t: a.t - by, r: a.r + by, b: a.b + by })

/** a segment crosses or touches a box (the plan plate's clip, for a wall that is a line and not a box) */
export function crosses(seg: Seg, box: Box): boolean {
  const inside = (x: number, y: number): boolean => x >= box.l && x <= box.r && y >= box.t && y <= box.b
  if (inside(seg.ax, seg.ay) || inside(seg.bx, seg.by)) return true
  const dx = seg.bx - seg.ax, dy = seg.by - seg.ay
  let near = 0, far = 1
  for (const [into, room] of [[-dx, seg.ax - box.l], [dx, box.r - seg.ax], [-dy, seg.ay - box.t], [dy, box.b - seg.ay]] as const) {
    if (into === 0) { if (room < 0) return false; continue }
    const at = room / into
    if (into < 0) { if (at > far) return false; if (at > near) near = at }
    else { if (at < near) return false; if (at < far) far = at }
  }
  return near <= far
}

const mirrorSide = (s: Side): Side => (s.includes('right') ? s.replace('right', 'left') : s.includes('left') ? s.replace('left', 'right') : s) as Side

function at(side: Side, x: number, y: number, w: number, h: number, gap: number): Box {
  switch (side) {
    case 'right': return { l: x + gap, t: y - h / 2, r: x + gap + w, b: y + h / 2 }
    case 'left': return { l: x - gap - w, t: y - h / 2, r: x - gap, b: y + h / 2 }
    case 'above': return { l: x - w / 2, t: y - gap - h, r: x + w / 2, b: y - gap }
    case 'below': return { l: x - w / 2, t: y + gap, r: x + w / 2, b: y + gap + h }
    case 'above-right': return { l: x + gap * .7, t: y - gap * .7 - h, r: x + gap * .7 + w, b: y - gap * .7 }
    case 'above-left': return { l: x - gap * .7 - w, t: y - gap * .7 - h, r: x - gap * .7, b: y - gap * .7 }
    case 'below-right': return { l: x + gap * .7, t: y + gap * .7, r: x + gap * .7 + w, b: y + gap * .7 + h }
    case 'below-left': return { l: x - gap * .7 - w, t: y + gap * .7, r: x - gap * .7, b: y + gap * .7 + h }
    case 'on': return { l: x - w / 2, t: y - h / 2, r: x + w / 2, b: y + h / 2 }
  }
}

/** THE RULE: in the asks' order, each at its first free place; `clear` is
 * the air every label keeps from everything else */
export function placeLabels(asks: readonly LabelAsk[], world: { taken: readonly Taken[]; walls: readonly Seg[]; bounds: Box; clear?: number; mirror?: boolean }): Placed[] {
  const clear = world.clear ?? 3
  const taken: Taken[] = [...world.taken]
  const inside = (b: Box): boolean => b.l >= world.bounds.l && b.t >= world.bounds.t && b.r <= world.bounds.r && b.b <= world.bounds.b
  const out: Placed[] = []
  for (const ask of asks) {
    let put: Placed = { id: ask.id, box: null, side: null }
    const reach = ask.reach ?? 3
    search: for (let step = 0; step < reach; step++) {
      for (const own of ask.sides) {
        const side = world.mirror ? mirrorSide(own) : own
        if (side === 'on' && step > 0) continue
        const box = at(side, ask.x, ask.y, ask.w, ask.h, ask.gap * (1 + step))
        const test = grown(box, clear)
        if (!inside(box)) continue
        if (taken.some(held => !(held.id && ask.over?.includes(held.id)) && meets(test, held))) continue
        if (world.walls.some(wall => crosses(wall, test))) continue
        put = { id: ask.id, box, side }
        break search
      }
    }
    if (put.box) taken.push({ ...put.box, id: `label:${ask.id}` })
    out.push(put)
  }
  return out
}

/** every pair that overlaps among the placed labels and the drawing: empty is the guarantee */
export function overlaps(placed: readonly Placed[], taken: readonly Taken[], walls: readonly Seg[], asks?: readonly LabelAsk[]): string[] {
  const bad: string[] = []
  const boxes = placed.filter(p => p.box) as { id: string; box: Box }[]
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!
    const over = asks?.find(x => x.id === a.id)?.over ?? []
    for (let j = i + 1; j < boxes.length; j++) if (meets(a.box, boxes[j]!.box)) bad.push(`${a.id} on ${boxes[j]!.id}`)
    for (const held of taken) if (!(held.id && over.includes(held.id)) && meets(a.box, held)) bad.push(`${a.id} on ${held.id ?? 'a shape'}`)
    for (const wall of walls) if (crosses(wall, a.box)) bad.push(`${a.id} on a line`)
  }
  return bad
}

/** THE DOM SIDE: each label is set in its own element first, measured as the
 * page draws it, then placed; a label left off is hidden, not shrunk */
export function placeElements(layer: HTMLElement, asks: readonly (Omit<LabelAsk, 'w' | 'h'> & { node: HTMLElement })[],
  world: { taken: readonly Taken[]; walls: readonly Seg[]; bounds: Box; clear?: number; mirror?: boolean }): { placed: Placed[]; asks: LabelAsk[] } {
  for (const ask of asks) {
    if (ask.node.parentElement !== layer) layer.append(ask.node)
    ask.node.style.left = '0px'
    ask.node.style.top = '0px'
    ask.node.hidden = false
  }
  const measured: LabelAsk[] = asks.map(({ node, ...rest }) => {
    const box = node.getBoundingClientRect()
    return { ...rest, w: Math.ceil(box.width), h: Math.ceil(box.height) }
  })
  const placed = placeLabels(measured, world)
  placed.forEach((p, i) => {
    const node = asks[i]!.node
    if (!p.box) { node.hidden = true; return }
    node.style.left = `${p.box.l}px`
    node.style.top = `${p.box.t}px`
    node.dataset['side'] = p.side ?? ''
  })
  return { placed, asks: measured }
}
