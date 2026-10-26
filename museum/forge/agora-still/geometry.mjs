// The still's frame geometry in CSS pixels, shared by the layout planner and
// the star sheet: the lens (a level eye with a shifted lens), what of the
// court stands in the frame, the safe areas, and the name boxes.
//
// A frame is { css: [w, h], tx, bot }: the half width of the view in tangent
// units at the eye, and the tangent of the lowest ray (the bottom edge).

/** the near colonnade: a ring of 10.6 m round the seat, its cornice at 2.9 m
    over the seated eye; the fire's bowl stands 5.6 m out, 0.55 m in radius */
const RING_R = 10.6
const RING_TOP = 2.9
const FIRE_Z = 5.6

/** where the eye stands: [x, y, z] from the seat, metres (z back from the fire) */
const eyeOf = (frame) => frame.eye ?? [0, 0, 0]

export function lens(frame) {
  const [w, h] = frame.css
  const top = frame.bot + (2 * frame.tx * h) / w
  const f = w / (2 * frame.tx)
  return {
    w,
    h,
    top,
    f,
    px: (xt, yt) => [w / 2 + xt * f, (top - yt) * f],
    tan: (x, y) => [(x - w / 2) / f, top - y / f],
  }
}

/** the lowest the sky reaches at a column of the frame, in CSS px from the top */
export function skyFloor(frame, x) {
  const L = lens(frame)
  const [, ey, ez] = eyeOf(frame)
  const [xt] = L.tan(x, 0)
  // the ray (xt, -1) in plan from (0, ez) meets the ring x^2 + z^2 = R^2 at depth t
  const a = xt * xt + 1
  const t = (ez + Math.sqrt(ez * ez - a * (ez * ez - RING_R * RING_R))) / a
  return L.px(xt, (RING_TOP - ey) / t)[1]
}

/** the fire and the air over it: the bowl and flame at 5.6 m, the plume as
    far as an ember climbs before it is spent */
export function fireBox(frame, plume) {
  const L = lens(frame)
  const [, ey, ez] = eyeOf(frame)
  const near = FIRE_Z + ez - 0.55
  const [x0, y0] = L.px(-0.75 / near, (plume - ey) / (FIRE_Z + ez))
  const [x1, y1] = L.px(0.75 / near, (-0.9 - ey) / near)
  return { x0, y0, x1, y1 }
}

/** the part of a frame every common screen shape keeps under `cover` */
export function safeArea(frame, shape) {
  const [w, h] = frame.css
  if (shape === 'wide') {
    // 16:9 down to 16:10 crops the sides
    const keep = (h * 16) / 10
    const off = (w - keep) / 2
    return { x0: off, y0: 0, x1: w - off, y1: h }
  }
  // 9:19.5 down to 9:16 crops top and bottom
  const keep = (w * 16) / 9
  const off = (h - keep) / 2
  return { x0: 0, y0: off, x1: w, y1: h - off }
}

export const NAME_BOX = { w: 170, h: 24, gap: 9 }
/** the band over the plume the page keeps for its one line of words: no name
    box enters it (css px above the plume's top) */
export const OVER_PLUME = 60
/** the room the page's line over the plume needs, from the plume's own box */
export const overPlume = (plume) => ({ x0: plume.x0, x1: plume.x1, y0: plume.y0 - OVER_PLUME, y1: plume.y0 })
/** a box may step away from its star when its own hairline would touch it at
    the standard gap: the side and alignment stay, only the distance grows */
export const GAPS = [9, 15, 21, 27, 33]
/** where a name may stand: beside the star (right, left), or over or under it,
    centred on it or starting just past its vertical (start) or ending just
    before it (end), which is what a hub star with four hairlines needs */
export const SIDES = [
  { side: 'right', align: 'center' },
  { side: 'left', align: 'center' },
  { side: 'above', align: 'center' },
  { side: 'below', align: 'center' },
  { side: 'above', align: 'start' },
  { side: 'below', align: 'start' },
  { side: 'above', align: 'end' },
  { side: 'below', align: 'end' },
]
/** how far a start or end box keeps off the star's own vertical */
const SHIFT = 8

/** the name box beside a star, in the same units as the star */
export function nameBox(x, y, cand, box = NAME_BOX) {
  const { w, h, gap } = box
  const { side, align } = cand
  if (side === 'right') return { x0: x + gap, y0: y - h / 2, x1: x + gap + w, y1: y + h / 2 }
  if (side === 'left') return { x0: x - gap - w, y0: y - h / 2, x1: x - gap, y1: y + h / 2 }
  const x0 = align === 'start' ? x + SHIFT : align === 'end' ? x - SHIFT - w : x - w / 2
  if (side === 'above') return { x0, y0: y - gap - h, x1: x0 + w, y1: y - gap }
  return { x0, y0: y + gap, x1: x0 + w, y1: y + gap + h }
}

export const overlaps = (a, b, pad = 0) =>
  a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad

export const inside = (a, b) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1

/** does a segment cross a box (Liang-Barsky) */
export function segmentHits(box, ax, ay, bx, by) {
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dy = by - ay
  const p = [-dx, dx, -dy, dy]
  const q = [ax - box.x0, box.x1 - ax, ay - box.y0, box.y1 - ay]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false
    } else {
      const r = q[i] / p[i]
      if (p[i] < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
      if (t0 > t1) return false
    }
  }
  return true
}

/** how far a name box keeps from every drawn hairline, corners included */
export const LINE_CLEAR = 5
/** two houses' names never line up as one list: boxes that share more than
    COLUMN_SHARE of their width stand y apart, boxes that share a line stand x
    apart, and any two keep the pad between houses */
export const HOUSE_GAP = { x: 30, y: 40, pad: 14 }
const COLUMN_SHARE = 0.4

/** the shortest distance from a segment to a box (0 when it enters it) */
export function boxSegDist(b, ax, ay, bx, by) {
  if (segmentHits(b, ax, ay, bx, by)) return 0
  const dPt = (px, py) => Math.hypot(Math.max(b.x0 - px, 0, px - b.x1), Math.max(b.y0 - py, 0, py - b.y1))
  const dSeg = (px, py) => {
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(px - ax - t * dx, py - ay - t * dy)
  }
  return Math.min(dPt(ax, ay), dPt(bx, by), dSeg(b.x0, b.y0), dSeg(b.x1, b.y0), dSeg(b.x0, b.y1), dSeg(b.x1, b.y1))
}

/** the hairlines as the atlas draws them: each one leaves its star at an inset
    of the star's own disc (atlas.ts figureGeometry: size x 0.34 + 0.02 patch
    units), so a segment runs inset to inset. inset(i) is in the stars' units. */
export function drawnSegments(stars, lines, inset) {
  const out = []
  for (const [a, b] of lines) {
    const A = stars[a]
    const B = stars[b]
    if (!A || !B) continue
    const dx = B.x - A.x
    const dy = B.y - A.y
    const n = Math.hypot(dx, dy) || 1
    const ia = inset(a)
    const ib = inset(b)
    out.push([A.x + (dx / n) * ia, A.y + (dy / n) * ia, B.x - (dx / n) * ib, B.y - (dy / n) * ib])
  }
  return out
}

/** two boxes of different houses that crowd, or read as one column or row */
export function housesClash(a, b) {
  const gx = Math.max(b.x0 - a.x1, a.x0 - b.x1)
  const gy = Math.max(b.y0 - a.y1, a.y0 - b.y1)
  if (gx < HOUSE_GAP.pad && gy < HOUSE_GAP.pad) return true
  const shareX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const shareY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  if (shareX > COLUMN_SHARE * Math.min(a.x1 - a.x0, b.x1 - b.x0) && gy < HOUSE_GAP.y) return true
  return shareY > 0 && gx < HOUSE_GAP.x
}

/** the phone's house plates: the page's tap area of a house is its figure's
    box grown by pad; two plates keep margin between them (css px of the tall) */
export const HOUSE_PLATE = { pad: 14, margin: 28 }
export const PLATE_GAP = 2 * HOUSE_PLATE.pad + HOUSE_PLATE.margin

/** the phone's names are tap targets: each hit box (the name box grown to 44
    css px, centred on it) keeps hit.gap from every other, and a name never
    stands in another star's column (its x within the box, its y within reach
    of the box: over or under a star a name reads as that star's) */
export const PHONE = { hit: { size: 44, gap: 4 }, column: { margin: 4, reach: 48, reachSide: 24 } }
export function hitBox(b, size = PHONE.hit.size) {
  const cx = (b.x0 + b.x1) / 2
  const cy = (b.y0 + b.y1) / 2
  const hw = Math.max(b.x1 - b.x0, size) / 2
  const hh = Math.max(b.y1 - b.y0, size) / 2
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }
}
export const hitsClash = (a, b, hit = PHONE.hit) => overlaps(hitBox(a, hit.size), hitBox(b, hit.size), hit.gap)
/** does a name box of the given side stand in the column of a star at (x, y) */
export function inColumn(b, side, x, y, column = PHONE.column) {
  const reach = side === 'above' || side === 'below' ? column.reach : column.reachSide
  return x > b.x0 - column.margin && x < b.x1 + column.margin && y > b.y0 - reach && y < b.y1 + reach
}

/**
 * The name side of every star: no box over another star or another name, none
 * within LINE_CLEAR of a drawn hairline, none on the fire or the court, all
 * inside the safe area. Returns the sides in star order, or null when no such
 * set exists.
 *   stars: [{ x, y, group, outward: [dx, dy] }], lines: [[i, j]] in star indices
 *   keep(box) -> true when the box stands in the open sky
 *   opts.segs: every drawn hairline in the frame, this house's and the others'
 *   opts.hit, opts.column: the phone's tap rules (PHONE)
 */
export function solveSides(stars, lines, keep, opts = {}) {
  const budget = opts.steps ?? 200000
  const starPad = opts.starPad ?? 7
  const groupPad = opts.groupPad ?? 30
  const boxPad = opts.boxPad ?? 14
  const box = opts.box ?? NAME_BOX
  const clear = opts.clear ?? LINE_CLEAR
  const gaps = opts.segs ? GAPS : [(box ?? NAME_BOX).gap]
  const cands = stars.map((s, i) => {
    const out = []
    for (const cand of SIDES) for (const gap of gaps) {
      const { side, align } = cand
      const b = nameBox(s.x, s.y, cand, { ...(s.box ?? box), gap })
      const kept = keep(b)
      if (kept === false) continue
      const extra = typeof kept === 'number' ? kept : 0
      let bad = false
      for (let j = 0; j < stars.length && !bad; j++) {
        if (j === i) continue
        const o = stars[j]
        // a star of another house keeps well clear, or the name reads as its
        const pad = o.group === s.group ? starPad : groupPad
        if (o.x > b.x0 - pad && o.x < b.x1 + pad && o.y > b.y0 - pad && o.y < b.y1 + pad) bad = true
      }
      // houses in the frame whose names are not asked for still keep their room
      for (const o of opts.others ?? []) if (o.x > b.x0 - groupPad && o.x < b.x1 + groupPad && o.y > b.y0 - groupPad && o.y < b.y1 + groupPad) bad = true
      if (opts.column && !bad) {
        for (let j = 0; j < stars.length && !bad; j++) if (j !== i && inColumn(b, side, stars[j].x, stars[j].y, opts.column)) bad = true
        for (const o of opts.others ?? []) if (!bad && inColumn(b, side, o.x, o.y, opts.column)) bad = true
      }
      if (opts.segs) {
        // every drawn hairline, its own star's too, stays clear of the box
        for (const [ax, ay, cx, cy] of opts.segs) if (!bad && boxSegDist(b, ax, ay, cx, cy) < clear) bad = true
      } else {
        // type has side bearings: a hairline that only grazes a corner of the
        // box passes beside the letters
        const t = { x0: b.x0 + 4, y0: b.y0 + 3, x1: b.x1 - 4, y1: b.y1 - 3 }
        for (const [ax, ay, cx, cy] of opts.otherLines ?? []) if (!bad && segmentHits(t, ax, ay, cx, cy)) bad = true
        for (const [a, c] of lines) {
          if (bad) break
          const A = stars[a]
          const C = stars[c]
          // a hairline that ends at this star leaves it under the box's near edge
          if (segmentHits(t, A.x, A.y, C.x, C.y) && !(a === i || c === i)) bad = true
          if (!bad && (a === i || c === i)) {
            const far = a === i ? C : A
            const mx = s.x + (far.x - s.x) * 0.22
            const my = s.y + (far.y - s.y) * 0.22
            if (segmentHits(t, mx, my, far.x, far.y)) bad = true
          }
        }
      }
      if (bad) continue
      // outward and level reads best: a name on the far side from its group's middle
      const [ox, oy] = s.outward
      const sx = align === 'start' ? 0.7 : align === 'end' ? -0.7 : 0
      const dir = side === 'right' ? [1, 0] : side === 'left' ? [-1, 0] : side === 'above' ? [sx, -1] : [sx, 1]
      const level = side === 'right' || side === 'left' ? 0 : align === 'center' ? 0.6 : 0.35
      const cost = level - 0.8 * (dir[0] * ox + dir[1] * oy) + extra + (gap - gaps[0]) * 0.06
      out.push({ side, align, gap, b, cost })
    }
    return out.sort((p, q) => p.cost - q.cost)
  })
  if (opts.explain) return cands.map((c, i) => `${stars[i].slug}:${c.map((x) => x.side[0] + x.align[0] + (x.gap === gaps[0] ? '' : x.gap)).join(',')}`)
  const clashes = (i, a, j, b) =>
    stars[j].group === stars[i].group
      ? overlaps(a.b, b.b, 2) || Boolean(opts.hit && hitsClash(a.b, b.b, opts.hit))
      : opts.segs ? housesClash(a.b, b.b) : overlaps(a.b, b.b, boxPad)
  if (cands.some((c) => c.length === 0)) return opts.count ? { open: cands.filter((c) => c.length === 0).length } : null
  // stars whose boxes can never meet are searched apart: two independent
  // parts of the sky would otherwise multiply each other's dead ends
  const root = stars.map((_, i) => i)
  const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])))
  for (let i = 0; i < stars.length; i++)
    for (let j = i + 1; j < stars.length; j++) {
      if (find(i) === find(j)) continue
      if (cands[i].some((a) => cands[j].some((b) => clashes(i, a, j, b)))) root[find(i)] = find(j)
    }
  const parts = new Map()
  for (let i = 0; i < stars.length; i++) parts.set(find(i), [...(parts.get(find(i)) ?? []), i])
  const chosen = new Array(stars.length).fill(null)
  const result = new Array(stars.length).fill(null)
  let unreached = 0
  for (const members of parts.values()) {
    // the next star is the one with the fewest sides still free, and a branch
    // ends the moment any unseated star has none left
    let best = null
    let bestCost = Infinity
    let steps = 0
    let deepest = 0
    const live = new Map(members.map((i) => [i, cands[i]]))
    const dfs = (left, cost) => {
      if (++steps > budget) return
      if (cost >= bestCost) return
      deepest = Math.max(deepest, members.length - left.length)
      if (!left.length) {
        best = members.map((i) => chosen[i])
        bestCost = cost
        return
      }
      let pick = -1
      for (const j of left) if (pick < 0 || (live.get(j)?.length ?? 0) < (live.get(pick)?.length ?? 0)) pick = j
      const rest = left.filter((j) => j !== pick)
      for (const c of live.get(pick) ?? []) {
        const saved = []
        let dead = false
        for (const j of rest) {
          const was = live.get(j) ?? []
          const now = was.filter((d) => !clashes(pick, c, j, d))
          saved.push([j, was])
          live.set(j, now)
          if (!now.length) {
            dead = true
            break
          }
        }
        if (!dead) {
          chosen[pick] = c
          dfs(rest, cost + c.cost)
          chosen[pick] = null
        }
        for (const [j, was] of saved) live.set(j, was)
      }
    }
    dfs(members.slice(), 0)
    if (!best) {
      unreached += members.length - deepest
      if (!opts.count) return null
      continue
    }
    members.forEach((i, q) => (result[i] = best[q]))
  }
  // a failed search says how many names it could not reach, as a fraction of one
  if (opts.count) return unreached === 0 ? { open: 0, sides: result } : { open: 0.05 + (0.9 * unreached) / stars.length }
  return result.map((c) => ({ side: c.side, align: c.align, gap: c.gap, box: c.b }))
}

const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

/**
 * A smooth measure of how far a set of stars is from seating every name, for
 * a search: each star greedily takes its least bad box, and the badness is the
 * area it shares with stars, names, hairlines and whatever `cost(box)` says
 * of the court, the fire and the frame. 0 means a greedy set already stands.
 */
export function namePenalty(stars, lines, cost, box = NAME_BOX, segs = null) {
  const chosen = []
  let total = 0
  const order = stars.map((_, i) => i)
  for (const i of order) {
    const s = stars[i]
    let best = Infinity
    let bestBox = null
    for (const [cand, gap] of SIDES.flatMap((c) => (segs ? GAPS : [box.gap]).map((g) => [c, g]))) {
      const b = nameBox(s.x, s.y, cand, { ...box, gap })
      let v = cost(b) + (gap - box.gap) * 0.06
      for (let j = 0; j < stars.length; j++) {
        if (j === i) continue
        const r = stars[j].group === s.group ? 7 : 30
        v += area(b, { x0: stars[j].x - r, y0: stars[j].y - r, x1: stars[j].x + r, y1: stars[j].y + r }) * 0.6
      }
      for (const c of chosen) {
        if (segs && c.group !== s.group) {
          if (housesClash(b, c)) v += 30
          continue
        }
        const pad = c.group === s.group ? 2 : 14
        v += area({ x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, c) * 0.08
      }
      if (segs) {
        for (const [ax, ay, cx, cy] of segs) {
          const d = boxSegDist(b, ax, ay, cx, cy)
          if (d < LINE_CLEAR) v += 20 + (LINE_CLEAR - d) * 4
        }
      } else {
        const t = { x0: b.x0 + 4, y0: b.y0 + 3, x1: b.x1 - 4, y1: b.y1 - 3 }
        for (const [a, c] of lines) {
          const A = stars[a]
          const C = stars[c]
          if (a === i || c === i) {
            const far = a === i ? C : A
            if (segmentHits(t, s.x + (far.x - s.x) * 0.22, s.y + (far.y - s.y) * 0.22, far.x, far.y)) v += 40
          } else if (segmentHits(t, A.x, A.y, C.x, C.y)) v += 40
        }
      }
      const level = cand.side === 'right' || cand.side === 'left' ? 0 : cand.align === 'center' ? 0.6 : 0.35
      if (v + level < best) {
        best = v + level
        bestBox = b
      }
    }
    chosen.push({ ...bestBox, group: s.group })
    total += Math.max(0, best - 0.6)
  }
  return total
}
