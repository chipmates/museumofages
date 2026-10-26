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

/**
 * The name side of every star: no box over another star or another name, none
 * across a hairline, the fire or the court, all inside the safe area. Returns
 * the sides in star order, or null when no such set exists.
 *   stars: [{ x, y, group, outward: [dx, dy] }], lines: [[i, j]] in star indices
 *   keep(box) -> true when the box stands in the open sky
 */
export function solveSides(stars, lines, keep, opts = {}) {
  const budget = opts.steps ?? 200000
  const starPad = opts.starPad ?? 7
  const groupPad = opts.groupPad ?? 30
  const boxPad = opts.boxPad ?? 14
  const box = opts.box ?? NAME_BOX
  const cands = stars.map((s, i) => {
    const out = []
    for (const cand of SIDES) {
      const { side, align } = cand
      const b = nameBox(s.x, s.y, cand, s.box ?? box)
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
      // type has side bearings: a hairline that only grazes a corner of the
      // box passes beside the letters
      const t = { x0: b.x0 + 4, y0: b.y0 + 3, x1: b.x1 - 4, y1: b.y1 - 3 }
      // houses in the frame whose names are not asked for still keep their room
      for (const o of opts.others ?? []) if (o.x > b.x0 - groupPad && o.x < b.x1 + groupPad && o.y > b.y0 - groupPad && o.y < b.y1 + groupPad) bad = true
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
      if (bad) continue
      // outward and level reads best: a name on the far side from its group's middle
      const [ox, oy] = s.outward
      const sx = align === 'start' ? 0.7 : align === 'end' ? -0.7 : 0
      const dir = side === 'right' ? [1, 0] : side === 'left' ? [-1, 0] : side === 'above' ? [sx, -1] : [sx, 1]
      const level = side === 'right' || side === 'left' ? 0 : align === 'center' ? 0.6 : 0.35
      const cost = level - 0.8 * (dir[0] * ox + dir[1] * oy) + extra
      out.push({ side, align, b, cost })
    }
    return out.sort((p, q) => p.cost - q.cost)
  })
  if (opts.explain) return cands.map((c, i) => `${stars[i].slug}:${c.map((x) => x.side[0] + x.align[0]).join(',')}`)
  const order = stars.map((_, i) => i).sort((a, b) => cands[a].length - cands[b].length)
  const chosen = new Array(stars.length).fill(null)
  let best = null
  let bestCost = Infinity
  let steps = 0
  function dfs(k, cost) {
    if (++steps > budget) return
    if (cost >= bestCost) return
    if (k === order.length) {
      best = chosen.slice()
      bestCost = cost
      return
    }
    const i = order[k]
    for (const c of cands[i]) {
      let clash = false
      for (let j = 0; j < chosen.length && !clash; j++) if (chosen[j] && overlaps(chosen[j].b, c.b, stars[j].group === stars[i].group ? 2 : boxPad)) clash = true
      if (clash) continue
      chosen[i] = c
      dfs(k + 1, cost + c.cost)
      chosen[i] = null
    }
  }
  if (cands.some((c) => c.length === 0)) return opts.count ? { open: cands.filter((c) => c.length === 0).length } : null
  dfs(0, 0)
  if (opts.count) return best ? { open: 0, sides: best } : { open: 0.5 }
  return best ? best.map((c) => ({ side: c.side, align: c.align, box: c.b })) : null
}

const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

/**
 * A smooth measure of how far a set of stars is from seating every name, for
 * a search: each star greedily takes its least bad box, and the badness is the
 * area it shares with stars, names, hairlines and whatever `cost(box)` says
 * of the court, the fire and the frame. 0 means a greedy set already stands.
 */
export function namePenalty(stars, lines, cost, box = NAME_BOX) {
  const chosen = []
  let total = 0
  const order = stars.map((_, i) => i)
  for (const i of order) {
    const s = stars[i]
    let best = Infinity
    let bestBox = null
    for (const cand of SIDES) {
      const b = nameBox(s.x, s.y, cand, box)
      let v = cost(b)
      for (let j = 0; j < stars.length; j++) {
        if (j === i) continue
        const r = stars[j].group === s.group ? 7 : 30
        v += area(b, { x0: stars[j].x - r, y0: stars[j].y - r, x1: stars[j].x + r, y1: stars[j].y + r }) * 0.6
      }
      for (const c of chosen) {
        const pad = c.group === s.group ? 2 : 14
        v += area({ x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, c) * 0.08
      }
      const t = { x0: b.x0 + 4, y0: b.y0 + 3, x1: b.x1 - 4, y1: b.y1 - 3 }
      for (const [a, c] of lines) {
        const A = stars[a]
        const C = stars[c]
        if (a === i || c === i) {
          const far = a === i ? C : A
          if (segmentHits(t, s.x + (far.x - s.x) * 0.22, s.y + (far.y - s.y) * 0.22, far.x, far.y)) v += 40
        } else if (segmentHits(t, A.x, A.y, C.x, C.y)) v += 40
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
