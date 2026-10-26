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

/** the line of type the page sets in a name box: the front's 15 px at a line
    height of 1.2, centred in the box's height */
export const TEXT_LINE = 18

/** where the page sets a name of width tw in its box: flush to the star's side
    beside it, at the box's start or end over or under it, else centred */
export function textRect(b, side, align, tw, line = TEXT_LINE) {
  const cy = (b.y0 + b.y1) / 2
  const toStart = side === 'right' || (side !== 'left' && align === 'start')
  const toEnd = side === 'left' || align === 'end'
  const x0 = toStart ? b.x0 : toEnd ? b.x1 - tw : (b.x0 + b.x1 - tw) / 2
  return { x0, y0: cy - line / 2, x1: x0 + tw, y1: cy + line / 2 }
}

/** the distance from a point to a rectangle (0 inside it) */
export const rectPointDist = (r, x, y) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1))

/** The wide's names as a reader takes them, measured on the text the page
    sets: each name's nearest figure star is its own by `near` (ratio and plus,
    whichever asks more); no other star stands level with the text within
    `row.reach` of its ends, nor over or under it within `column.reach`; the
    text stays within `close` of its star where the sky allows, beside the star
    first, over or under it next, a diagonal last (`kind`); two names' tap
    targets (the text and the link's padding, at least `hit.size` square)
    keep `hit.gap` between them, any two houses' names too. The hit size is
    44 page px where the frame shows smallest among the desk sizes checked
    (1280 x 800 shows it at 0.906, so 48.5 design px). */
export const READ = {
  near: { ratio: 2, plus: 16, must: 4 },
  price: { near: 4, row: 4, column: 3, far: 0.5 },
  /* two targets keep hit.gap at the 1280 x 800 page; where the stars stand too
     close for that, they may come nearer at hit.price a design px, never
     nearer than `least` (two 44 px targets touching where the frame shows at
     1, about the 1440 x 900 page) */
  row: { half: 12, reach: 60 },
  column: { margin: 4, reach: 36 },
  close: 14,
  kind: { side: 0, centre: 0.6, diagonal: 1.2 },
  /** the wide steps a box out from its star by 3 px at a time */
  gaps: [9, 12, 15, 18, 21, 24, 27, 30, 33],
  hit: { size: 44 / 0.9064, gap: 4 / 0.9064, pad: 6, least: 44 / 1.0299 + 4 / 1.0299 - 44 / 0.9064, price: 0.3 },
}

/** The phone's open houses read the same way, on the short names at 14 px
    (a 16.8 px line); their tap rules are PHONE's, and every name steps out
    past the glows, so `close` counts from the least seat a side allows */
export const READ_PHONE = {
  near: READ.near,
  price: READ.price,
  row: READ.row,
  column: READ.column,
  close: 6,
  kind: READ.kind,
  gaps: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30],
  hit: null,
  line: 16.8,
}

/** the gap between two tap targets (negative where they overlap) */
export const hitGap = (a, b) => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1)

/** where a name's text stands from its star at the least gap a side allows:
    beside it the gap, over or under it the gap and half the type's spare
    height, a diagonal that past the star's vertical; the reading's `close` is
    measured from there when glows push every name out */
function hypotClose(gap, side, align, plus, line = TEXT_LINE) {
  if (side === 'right' || side === 'left') return gap + plus
  const dy = gap + (NAME_BOX.h - line) / 2
  return (align === 'center' ? dy : Math.hypot(8, dy)) + plus
}

/** what another star at (x, y) costs a name's reading: Infinity when it stands
    nearer the text than the name's own star does (by READ.near.must), else
    the share of the margin, the row and the column it takes away */
export function readCost(t, own, x, y, cy, r = READ) {
  const d = rectPointDist(t, x, y)
  if (d < own + r.near.must) return Infinity
  let v = 0
  const want = Math.max(r.near.ratio * own, own + r.near.plus)
  if (d < want) v += r.price.near * (want - d) / want
  const gx = Math.max(t.x0 - x, 0, x - t.x1)
  if (Math.abs(y - cy) <= r.row.half && gx < r.row.reach) v += r.price.row * (1 - gx / r.row.reach)
  const gy = Math.max(t.y0 - y, 0, y - t.y1)
  if (x > t.x0 - r.column.margin && x < t.x1 + r.column.margin && gy < r.column.reach) v += r.price.column * (1 - gy / r.column.reach)
  return v
}

/** a name's tap target on the wide: the link pads its text by 0.4 em each side
    and is at least hit.size square, centred on its text */
export function textHit(t, hit = READ.hit) {
  const cx = (t.x0 + t.x1) / 2
  const cy = (t.y0 + t.y1) / 2
  const hw = Math.max(t.x1 - t.x0 + 2 * hit.pad, hit.size) / 2
  return { x0: cx - hw, y0: cy - hit.size / 2, x1: cx + hw, y1: cy + hit.size / 2 }
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
 *   opts.read: the wide's reading rules (READ), with each star's text width
 *     as s.tw; the cost becomes the reading order and the text's distance
 *   opts.glow: { radius(j), share, gap } no text (with opts.read, else no box)
 *     nearer a star's centre than share times its glow's reach and gap (j over
 *     stars, then others); the own star's name steps out past it
 */
export function solveSides(stars, lines, keep, opts = {}) {
  const budget = opts.steps ?? 200000
  const starPad = opts.starPad ?? 7
  const groupPad = opts.groupPad ?? 30
  const boxPad = opts.boxPad ?? 14
  const box = opts.box ?? NAME_BOX
  const clear = opts.clear ?? LINE_CLEAR
  const others = opts.others ?? []
  const glowR = (j) => (opts.glow ? opts.glow.radius(j) : 0)
  /** how far a box keeps from a star's centre when glows are kept */
  const clearOf = (j) => glowR(j) * (opts.glow.share ?? 1) + (opts.glow.gap ?? 0)
  /** over or under its star the text stands this far inside its box */
  const insetOf = (side) => (opts.read && (side === 'above' || side === 'below') ? (NAME_BOX.h - (opts.read.line ?? TEXT_LINE)) / 2 : 0)
  /** the gaps a star's box may stand at: its text past its own glow when glows are kept */
  const gapsOf = (i, side) => {
    const steps = opts.read?.gaps ?? GAPS
    if (!opts.glow) return opts.read ? steps : opts.segs ? GAPS : [(box ?? NAME_BOX).gap]
    const g0 = Math.max(steps[0], Math.ceil(clearOf(i) - insetOf(side)))
    return steps.map((g) => g0 + (g - steps[0]))
  }
  const cands = stars.map((s, i) => {
    const out = []
    for (const cand of SIDES) for (const gap of gapsOf(i, cand.side)) {
      const { side, align } = cand
      const gaps = gapsOf(i, side)
      const b = nameBox(s.x, s.y, cand, { ...(s.box ?? box), gap })
      if (opts.allow && !opts.allow(i, side, align, gap)) continue
      const kept = keep(b)
      if (kept === false) continue
      const extra = typeof kept === 'number' ? kept : 0
      let bad = false
      const t = opts.read ? textRect(b, side, align, s.tw ?? b.x1 - b.x0, opts.read.line) : null
      if (opts.glow) {
        // every glow in the frame, the own star's too, stays clear of the text
        // (of the box when no text is read)
        const g = t ?? b
        for (let j = 0; j < stars.length && !bad; j++) if (rectPointDist(g, stars[j].x, stars[j].y) < clearOf(j)) bad = true
        for (let j = 0; j < others.length && !bad; j++) if (rectPointDist(g, others[j].x, others[j].y) < clearOf(stars.length + j)) bad = true
      }
      const own = t ? rectPointDist(t, s.x, s.y) : 0
      // the reading rules: the own star nearest is a rule, its margin and the
      // row and the column are priced, so a crowded sky still seats every name
      let misread = 0
      if (t && !bad) {
        const cy = (t.y0 + t.y1) / 2
        for (const o of [...stars.filter((_, j) => j !== i), ...others]) {
          const v = readCost(t, own, o.x, o.y, cy, opts.read)
          if (v === Infinity) bad = true
          misread += v
          if (bad) break
        }
      }
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
      let cost = level - 0.8 * (dir[0] * ox + dir[1] * oy) + extra + (gap - gaps[0]) * 0.06
      if (t) {
        // the reading order first, then the text's distance past `close`; a
        // bright pixel to clear costs less than a worse side
        const r = opts.read
        const kind = side === 'right' || side === 'left' ? r.kind.side : align === 'center' ? r.kind.centre : r.kind.diagonal
        const close = opts.glow ? hypotClose(gaps[0], side, align, r.close, r.line) : r.close
        cost = kind + r.price.far * Math.max(0, own - close) + misread - 0.3 * (dir[0] * ox + dir[1] * oy) + extra / 4
      }
      out.push({ side, align, gap, b, cost, ...(t ? { t, h: opts.read.hit ? textHit(t, opts.read.hit) : null, own } : {}) })
    }
    return out.sort((p, q) => p.cost - q.cost)
  })
  if (opts.explain) return cands.map((c, i) => `${stars[i].slug}:${c.map((x) => x.side[0] + x.align[0] + (x.gap === GAPS[0] ? '' : x.gap)).join(',')}`)
  const pairCost = (a, b) => {
    if (!opts.read?.hit) return 0
    const g = hitGap(a.h, b.h)
    return g >= opts.read.hit.gap ? 0 : opts.read.hit.price * (opts.read.hit.gap - g)
  }
  const clashes = (i, a, j, b) =>
    (opts.read?.hit && hitGap(a.h, b.h) < opts.read.hit.least) ||
    (stars[j].group === stars[i].group
      ? overlaps(a.b, b.b, 2) || Boolean(opts.hit && hitsClash(a.b, b.b, opts.hit))
      : opts.segs ? housesClash(a.b, b.b) : overlaps(a.b, b.b, boxPad))
  if (cands.some((c) => c.length === 0)) return opts.count ? { open: cands.filter((c) => c.length === 0).length } : null
  // stars whose boxes can never meet are searched apart: two independent
  // parts of the sky would otherwise multiply each other's dead ends
  const root = stars.map((_, i) => i)
  const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])))
  const meets = []
  for (let i = 0; i < stars.length; i++)
    for (let j = i + 1; j < stars.length; j++) {
      if (cands[i].some((a) => cands[j].some((b) => clashes(i, a, j, b) || pairCost(a, b) > 0))) {
        meets.push([i, j])
        root[find(i)] = find(j)
      }
    }
  const parts = new Map()
  for (let i = 0; i < stars.length; i++) parts.set(find(i), [...(parts.get(find(i)) ?? []), i])
  const result = new Array(stars.length).fill(null)
  let unreached = 0
  let searchCut = 0
  /* the next star is the one with the fewest seats still free, and a branch
     ends the moment any unseated star has none left. Seats of `fixed` stars
     (in result) stand: every seat is checked and priced against them. */
  const search = (members, fixed, bound0 = Infinity, steps0 = budget) => {
    const chosen = new Map()
    let best = null
    let bestCost = bound0
    let steps = 0
    let deepest = 0
    const live = new Map(
      members.map((i) => [
        i,
        cands[i]
          .filter((c) => fixed.every((j) => !clashes(i, c, j, result[j])))
          .map((c) => ({ c, k: c.cost + fixed.reduce((v, j) => v + pairCost(c, result[j]), 0) }))
          .sort((p, q) => p.k - q.k),
      ])
    )
    const dfs = (left, cost) => {
      if (++steps > steps0) return
      // every star still to seat pays at least its cheapest live seat; a seat
      // may cost less than nothing, so the running cost alone bounds nothing
      let bound = cost
      for (const j of left) bound += live.get(j)?.[0]?.k ?? 0
      if (bound >= bestCost) return
      deepest = Math.max(deepest, members.length - left.length)
      if (!left.length) {
        best = members.map((i) => chosen.get(i))
        bestCost = cost
        return
      }
      let pick = -1
      for (const j of left) if (pick < 0 || (live.get(j)?.length ?? 0) < (live.get(pick)?.length ?? 0)) pick = j
      const rest = left.filter((j) => j !== pick)
      for (const w of live.get(pick) ?? []) {
        const saved = []
        let dead = false
        for (const j of rest) {
          const was = live.get(j) ?? []
          const now = was.filter((d) => !clashes(pick, w.c, j, d.c))
          saved.push([j, was])
          live.set(j, now)
          if (!now.length) {
            dead = true
            break
          }
        }
        if (!dead) {
          let pc = 0
          if (opts.read) for (const d of chosen.values()) pc += pairCost(w.c, d)
          chosen.set(pick, w.c)
          dfs(rest, cost + w.k + pc)
          chosen.delete(pick)
        }
        for (const [j, was] of saved) live.set(j, was)
      }
    }
    dfs(members.slice(), 0)
    return { best, cost: bestCost, cut: steps > steps0, deepest }
  }
  for (const members of parts.values()) {
    const got = search(members, [])
    if (got.cut) searchCut++
    if (!got.best) {
      unreached += members.length - got.deepest
      if (!opts.count) return null
      continue
    }
    members.forEach((i, q) => (result[i] = got.best[q]))
  }
  if (opts.read && !opts.count) {
    // a search too large to finish is followed by exact searches of one star
    // and every star whose seats can meet its seats, then of one house and
    // its neighbours, the rest standing, until no such search lowers the total
    const near = stars.map(() => new Set())
    for (const [i, j] of meets) {
      near[i].add(j)
      near[j].add(i)
    }
    const groups = [...new Set(stars.map((st) => st.group))]
    const hoods = [
      ...stars.map((_, i) => [i, ...near[i]].sort((p, q) => p - q)),
      ...groups.map((g) => {
        const own = stars.map((st, i) => (st.group === g ? i : -1)).filter((i) => i >= 0)
        return stars.map((_, i) => i).filter((i) => own.includes(i) || own.some((k) => near[k].has(i) && Math.hypot(stars[i].x - stars[k].x, stars[i].y - stars[k].y) < (opts.read.redo ?? 110)))
      }),
      // two houses whose seats meet, whole
      ...groups.flatMap((g, a) =>
        groups.slice(a + 1).filter((h) => meets.some(([i, j]) => (stars[i].group === g && stars[j].group === h) || (stars[i].group === h && stars[j].group === g)))
          .map((h) => stars.map((st, i) => (st.group === g || st.group === h ? i : -1)).filter((i) => i >= 0))),
    ]
    const priced = (members, fixed) => {
      let v = 0
      members.forEach((i, q) => {
        v += result[i].cost
        for (const j of fixed) v += pairCost(result[i], result[j])
        for (const k of members.slice(q + 1)) v += pairCost(result[i], result[k])
      })
      return v
    }
    for (let round = 0; round < 8; round++) {
      let moved = false
      for (const members of hoods) {
        const fixed = stars.map((_, i) => i).filter((i) => !members.includes(i))
        const now = priced(members, fixed)
        const got = search(members, fixed)
        if (got.cut) searchCut++
        if (got.best && got.cost < now - 1e-9) {
          members.forEach((i, q) => (result[i] = got.best[q]))
          moved = true
        }
      }
      if (!moved) break
    }
    // the polished total bounds an exact search of each part once more
    if (opts.read.prove) {
      for (const members of parts.values()) {
        const now = priced(members, [])
        const got = search(members, [], now - 1e-9, opts.read.prove)
        searchCut += got.cut ? 1 : 0
        if (got.best) members.forEach((i, q) => (result[i] = got.best[q]))
        Object.defineProperty(result, 'proved', { value: [...(result.proved ?? []), got.cut ? 'cut' : got.best ? 'better' : 'best'], enumerable: false, configurable: true })
      }
    }
  }
  // a failed search says how many names it could not reach, as a fraction of one
  if (opts.count) return unreached === 0 ? { open: 0, sides: result } : { open: 0.05 + (0.9 * unreached) / stars.length }
  if (opts.read) polish(result, cands, meets, clashes, pairCost)
  const seated = result.map((c) => ({ side: c.side, align: c.align, gap: c.gap, box: c.b, cost: c.cost, ...(c.t ? { text: c.t, hit: c.h, own: c.own } : {}) }))
  // a search its budget cut short holds a seating, not the best one
  Object.defineProperty(seated, 'cut', { value: searchCut, enumerable: false })
  Object.defineProperty(seated, 'proved', { value: result.proved ?? null, enumerable: false })
  return seated
}

/** After the search: move one seat, then two seats that meet, whenever the
    total falls and every rule still holds, until nothing moves. A search its
    budget stopped early still ends where no such move is left. */
function polish(result, cands, meets, clashes, pairCost) {
  const n = result.length
  const free = (i, c, skip) => {
    for (let j = 0; j < n; j++) if (j !== i && j !== skip && clashes(i, c, j, result[j])) return false
    return true
  }
  const paid = (i, c, skip) => {
    let v = c.cost
    for (let j = 0; j < n; j++) if (j !== i && j !== skip) v += pairCost(c, result[j])
    return v
  }
  for (let round = 0; round < 50; round++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      let best = paid(i, result[i], -1) - 1e-9
      for (const c of cands[i]) {
        if (c === result[i] || !free(i, c, -1)) continue
        const v = paid(i, c, -1)
        if (v < best) [best, result[i], moved] = [v, c, true]
      }
    }
    for (const [i, j] of meets) {
      let best = paid(i, result[i], j) + paid(j, result[j], i) + pairCost(result[i], result[j]) - 1e-9
      const ci = cands[i].filter((c) => free(i, c, j))
      const cj = cands[j].filter((c) => free(j, c, i))
      const pi = ci.map((c) => paid(i, c, j))
      const pj = cj.map((c) => paid(j, c, i))
      let pick = null
      for (let a = 0; a < ci.length; a++)
        for (let b = 0; b < cj.length; b++) {
          if (pi[a] + pj[b] >= best || clashes(i, ci[a], j, cj[b])) continue
          const v = pi[a] + pj[b] + pairCost(ci[a], cj[b])
          if (v < best) [best, pick] = [v, [ci[a], cj[b]]]
        }
      if (pick) [result[i], result[j], moved] = [pick[0], pick[1], true]
    }
    if (!moved) return round
  }
  return 50
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
