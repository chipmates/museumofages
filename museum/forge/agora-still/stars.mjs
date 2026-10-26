// The data a frame hands to the page that puts the names on it: every figure
// star projected through the frame's own camera and proved on its pixels, the
// six groups, the fire, the safe area, a free name box beside every star with
// the contrast under it, and (tall) the zoom that parts a group's stars.
import { join } from 'node:path'
import sharp from 'sharp'
import { boxSegDist, drawnSegments, hitBox, housesClash, inColumn, inside, nameBox, overlaps, overPlume, safeArea, skyFloor, solveSides, HOUSE_PLATE, LINE_CLEAR, NAME_BOX, PHONE, SIDES } from './geometry.mjs'
const nameBoxFor = (p, k) => nameBox(p.x, p.y, SIDES[k])
/** the hairline's inset from its star, as atlas.ts figureGeometry draws it,
    from the star's disc in patch units */
const insetOf = (disc) => disc * 0.34 + 0.02

/** the name's own colour: a light paper tone, sRGB luminance about 0.83 */
const NAME_LUM = 0.83
/** a pixel brighter than this under a name leaves under 4.5:1 for it */
const BRIGHT = (NAME_LUM + 0.05) / 4.5 - 0.05
const TAP = 44
/** the six houses as the page knows them: key, star slugs, hairlines */
let CONSTELLATIONS = []

const LIN = new Float64Array(256)
for (let c = 0; c < 256; c++) {
  const v = c / 255
  LIN[c] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
/** relative luminance of a pixel of a raw RGB buffer */
function lum(raw, w, x, y) {
  const i = (y * w + x) * 3
  return 0.2126 * LIN[raw[i]] + 0.7152 * LIN[raw[i + 1]] + 0.0722 * LIN[raw[i + 2]]
}

/** the brightest pixel near a projected point, and how far it stands from it */
function proveOnPixels(raw, w, h, x, y, reach) {
  let best = -1
  let bx = 0
  let by = 0
  for (let j = Math.max(0, Math.floor(y - reach)); j <= Math.min(h - 1, Math.ceil(y + reach)); j++)
    for (let i = Math.max(0, Math.floor(x - reach)); i <= Math.min(w - 1, Math.ceil(x + reach)); i++) {
      if ((i - x) ** 2 + (j - y) ** 2 > reach * reach) continue
      const l = lum(raw, w, i, j)
      if (l > best) {
        best = l
        bx = i
        by = j
      }
    }
  // a plateau of equal brightest pixels is measured at its centre
  let sx = 0
  let sy = 0
  let n = 0
  for (let j = by - 3; j <= by + 3; j++)
    for (let i = bx - 3; i <= bx + 3; i++) {
      if (i < 0 || j < 0 || i >= w || j >= h) continue
      if (lum(raw, w, i, j) >= best * 0.97) {
        sx += i + 0.5
        sy += j + 0.5
        n++
      }
    }
  const px = sx / n
  const py = sy / n
  return { peak: [+px.toFixed(2), +py.toFixed(2)], off: +Math.hypot(px - x, py - y).toFixed(2), lum: +best.toFixed(4) }
}

/** distance from a point to a segment */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

/** what a name would stand on: the box's luminance in the frame's own pixels.
    A star or the fire under a name is a defect; a hairline grazing the box
    where it leaves its star is the figure's own drawing, counted apart. */
/** the frame's luminance as a summed table, so a cell's mean is four reads */
let summed = null
function summedOf(raw, w, h) {
  if (summed?.raw === raw) return summed.t
  const t = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += lum(raw, w, x, y)
      t[(y + 1) * (w + 1) + x + 1] = t[y * (w + 1) + x + 1] + row
    }
  }
  summed = { raw, t }
  return t
}
/** the mean luminance of the n x n cell whose top left pixel is (x, y) */
function cellMean(t, w, x, y, n) {
  const W1 = w + 1
  return (t[(y + n) * W1 + x + n] - t[y * W1 + x + n] - t[(y + n) * W1 + x] + t[y * W1 + x]) / (n * n)
}

function underBox(raw, w, h, b, s, segs = []) {
  const vals = []
  let graze = 0
  let star = 0
  let pointPx = 0
  const t = summedOf(raw, w, h)
  // a letter's stroke is about two CSS px: a star is bright under a name when
  // a cell that size around it crosses the 4.5:1 line
  const n = Math.max(1, Math.round(2 * s))
  const near = segs.filter(([ax, ay, bx, by]) => Math.max(ax, bx) > b.x0 - 4 && Math.min(ax, bx) < b.x1 + 4 && Math.max(ay, by) > b.y0 - 4 && Math.min(ay, by) < b.y1 + 4)
  for (let y = Math.max(0, Math.floor(b.y0 * s)); y < Math.min(h, Math.ceil(b.y1 * s)); y++)
    for (let x = Math.max(0, Math.floor(b.x0 * s)); x < Math.min(w, Math.ceil(b.x1 * s)); x++) {
      const l = lum(raw, w, x, y)
      vals.push(l)
      if (l <= BRIGHT) continue
      const cx = (x + 0.5) / s
      const cy = (y + 0.5) / s
      if (near.some(([ax, ay, bx, by]) => segDist(cx, cy, ax, ay, bx, by) < 2.5)) {
        graze++
        continue
      }
      pointPx++
      // the brightest stroke-sized cell over this pixel
      for (let dy = -n + 1; dy <= 0; dy++)
        for (let dx = -n + 1; dx <= 0; dx++) {
          const qx = Math.min(w - n, Math.max(0, x + dx))
          const qy = Math.min(h - n, Math.max(0, y + dy))
          star = Math.max(star, cellMean(t, w, qx, qy, n))
        }
    }
  vals.sort((a, c) => a - c)
  const mean = vals.reduce((a, c) => a + c, 0) / Math.max(1, vals.length)
  const p95 = vals[Math.floor(vals.length * 0.95)] ?? 0
  const max = vals[vals.length - 1] ?? 0
  const ratio = (l) => +((NAME_LUM + 0.05) / (l + 0.05)).toFixed(2)
  // any single pixel over the line that is not a hairline is a star, a
  // companion or an ember under the name: the box is bright
  return {
    mean: +mean.toFixed(4), p95: +p95.toFixed(4), max: +max.toFixed(4), contrast: ratio(p95), contrastAtMax: ratio(max),
    brightCell: +star.toFixed(4), bright: pointPx > 0, starPx: pointPx, hairlinePx: graze,
  }
}

/** the ring round a name box (css px wide) where a field star would touch the
    letters: pixels over the C8 line there that are no hairline's and no
    figure star's own light. mask marks each figure star's own light. */
function ringPoints(raw, w, h, b, s, segs, ring) {
  const m = ring.margin
  const near = segs.filter(([ax, ay, bx, by]) => Math.max(ax, bx) > b.x0 - m - 4 && Math.min(ax, bx) < b.x1 + m + 4 && Math.max(ay, by) > b.y0 - m - 4 && Math.min(ay, by) < b.y1 + m + 4)
  let n = 0
  for (let y = Math.max(0, Math.floor((b.y0 - m) * s)); y < Math.min(h, Math.ceil((b.y1 + m) * s)); y++)
    for (let x = Math.max(0, Math.floor((b.x0 - m) * s)); x < Math.min(w, Math.ceil((b.x1 + m) * s)); x++) {
      const cx = (x + 0.5) / s
      const cy = (y + 0.5) / s
      if (cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1) continue
      if (ring.mask[y * w + x] || lum(raw, w, x, y) <= BRIGHT) continue
      if (near.some(([ax, ay, bx, by]) => segDist(cx, cy, ax, ay, bx, by) < 2.5)) continue
      n++
    }
  return n
}

/** each figure star's own light: the pixels over the C8 line joined to its
    brightest pixel, as far as its glow reaches */
function ownLight(raw, w, h, stars, reach) {
  const mask = new Uint8Array(w * h)
  for (const st of stars) {
    const [px, py] = st.proof.peak.map(Math.floor)
    if (px < 0 || py < 0 || px >= w || py >= h) continue
    const r = reach(st)
    const todo = [[px, py]]
    mask[py * w + px] = 1
    while (todo.length) {
      const [x, y] = todo.pop()
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny * w + nx]) continue
        if ((nx - px) ** 2 + (ny - py) ** 2 > r * r || lum(raw, w, nx, ny) <= BRIGHT) continue
        mask[ny * w + nx] = 1
        todo.push([nx, ny])
      }
    }
  }
  return mask
}

const r2 = (v) => +v.toFixed(2)

const frac = (v) => +v.toFixed(5)

/** stars of a frame as data, from the page's own projection */
async function project(page, raw, info, cssW, plume) {
  const s = info.width / cssW
  const stars = (await page.evaluate(() => window.__still.stars())).map((st) => {
    const proof = proveOnPixels(raw, info.width, info.height, st.x, st.y, 6 * s)
    return { ...st, proof, css: [st.x / s, st.y / s] }
  })
  const fire = await page.evaluate(([p]) => window.__still.fire(p), [plume])
  return { s, stars, fire }
}

function groupsOf(stars, s, info) {
  return CONSTELLATIONS.map((c) => {
    const own = stars.filter((x) => x.group === c.key)
    const xs = own.map((x) => x.x)
    const ys = own.map((x) => x.y)
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
    const cx = xs.reduce((a, v) => a + v, 0) / xs.length
    const cy = ys.reduce((a, v) => a + v, 0) / ys.length
    let near = Infinity
    for (let i = 0; i < own.length; i++)
      for (let j = i + 1; j < own.length; j++) near = Math.min(near, Math.hypot(own[i].x - own[j].x, own[i].y - own[j].y) / s)
    return {
      key: c.key,
      centre: { x: frac(cx / info.width), y: frac(cy / info.height), px: [r2(cx), r2(cy)] },
      box: {
        x0: frac(box.x0 / info.width), y0: frac(box.y0 / info.height), x1: frac(box.x1 / info.width), y1: frac(box.y1 / info.height),
        px: [r2(box.x0), r2(box.y0), r2(box.x1), r2(box.y1)],
      },
      closestCss: r2(near),
      cssBox: { x0: box.x0 / s, y0: box.y0 / s, x1: box.x1 / s, y1: box.y1 / s },
    }
  })
}

/** every star's free name side in this frame, judged on its pixels too */
function seatNames(stars, groups, frame, shape, fireBox, raw, info, s, cssBox, allowBright = false, widths = null, others = [], kCss = frame.k, ring = null) {
  const safe = cssBox ?? safeArea(frame, shape)
  const m = 8
  const inner = { x0: safe.x0 + m, y0: safe.y0 + m, x1: safe.x1 - m, y1: safe.y1 - m }
  const fireCss = { x0: fireBox.x0 / s - 12, y0: fireBox.y0 / s - 12, x1: fireBox.x1 / s + 12, y1: fireBox.y1 / s }
  // the band over the plume where the page sets its line (the frame's own fire)
  const over = overPlume({ x0: fireBox.x0 / s, y0: fireBox.y0 / s, x1: fireBox.x1 / s })
  const keep = (b) => {
    if (!inside(b, inner)) return false
    if (b.x0 < fireCss.x1 && fireCss.x0 < b.x1 && b.y0 < fireCss.y1 && fireCss.y0 < b.y1) return false
    if (!cssBox && overlaps(b, over)) return false
    if (!cssBox && (b.y1 > skyFloor(frame, b.x0) - 6 || b.y1 > skyFloor(frame, b.x1) - 6)) return false
    const u = underBox(raw, info.width, info.height, b, s, segs)
    if (u.contrast < 4.5) return false
    // a bright star under a name (or, on the phone, touching it) is allowed
    // only at a price: it costs one of the sky's eight reserved rectangles
    const bright = u.bright || (ring ? ringPoints(raw, info.width, info.height, b, s, segs, ring) > 0 : false)
    return bright ? (allowBright ? 4 : false) : 0
  }
  // every hairline in the frame as the atlas draws it, this house's and the
  // others', inset from both its stars
  const everyone = [...stars, ...others]
  const at = Object.fromEntries(everyone.map((st, i) => [st.slug, i]))
  const pairs = []
  for (const c of CONSTELLATIONS)
    for (const [a, b] of c.lines) {
      const A = at[c.stars[a]]
      const B = at[c.stars[b]]
      if (A != null && B != null) pairs.push([A, B])
    }
  const segs = drawnSegments(everyone.map((st) => ({ x: st.css[0], y: st.css[1] })), pairs, (i) => insetOf(everyone[i].disc) * kCss)
  const centre = Object.fromEntries(groups.map((g) => [g.key, [g.centre.px[0] / s, g.centre.px[1] / s]]))
  const pts = stars.map((st) => {
    const [x, y] = st.css
    const [gx, gy] = centre[st.group]
    const dx = x - gx
    const dy = y - gy
    const n = Math.hypot(dx, dy) || 1
    const w = widths?.[st.slug]
    return { x, y, group: st.group, slug: st.slug, outward: [dx / n, dy / n], ...(w ? { box: { ...NAME_BOX, w } } : {}) }
  })
  const lines = []
  const order = stars.map((st) => st.slug)
  for (const c of CONSTELLATIONS)
    for (const [a, b] of c.lines) {
      const i = order.indexOf(c.stars[a])
      const j = order.indexOf(c.stars[b])
      if (i >= 0 && j >= 0) lines.push([i, j])
    }
  const near = { others: others.map((st) => ({ x: st.css[0], y: st.css[1] })), segs, ...(shape === 'tall' ? { hit: PHONE.hit, column: PHONE.column } : {}) }
  const seated = solveSides(pts, lines, keep, near)
  if (!seated && process.env.SEAT_EXPLAIN) {
    const why = (b) => {
      if (!inside(b, inner)) return 'o'
      if (b.x0 < fireCss.x1 && fireCss.x0 < b.x1 && b.y0 < fireCss.y1 && fireCss.y0 < b.y1) return 'f'
      if (!cssBox && (b.y1 > skyFloor(frame, b.x0) - 6 || b.y1 > skyFloor(frame, b.x1) - 6)) return 'g'
      const u = underBox(raw, info.width, info.height, b, s, segs)
      return u.bright ? 'b' : u.contrast < 4.5 ? 'c' : '+'
    }
    console.log(solveSides(pts, lines, () => true, { explain: true }).join(' '))
    console.log(solveSides(pts, lines, keep, { explain: true }).join(' '))
    for (const p of pts) console.log(p.slug, ['right', 'left', 'above', 'below', 'above-s', 'below-s', 'above-e', 'below-e'].map((_, k) => why(nameBoxFor(p, k))).join(''))
  }
  if (!seated) return null
  const out = seated.map((x) => ({ ...x, under: underBox(raw, info.width, info.height, x.box, s, segs), ringPx: ring ? ringPoints(raw, info.width, info.height, x.box, s, segs, ring) : 0 }))
  // what the checks read: the nearest hairline to every box, own lines too
  Object.defineProperty(out, 'clear', { value: out.map((x) => Math.min(Infinity, ...segs.map((q) => boxSegDist(x.box, ...q)))), enumerable: false })
  Object.defineProperty(out, 'segs', { value: segs, enumerable: false })
  return out
}

function pairs(stars, s) {
  let min = Infinity
  let at = null
  for (let i = 0; i < stars.length; i++)
    for (let j = i + 1; j < stars.length; j++) {
      const d = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y) / s
      if (d < min) {
        min = d
        at = [stars[i].slug, stars[j].slug]
      }
    }
  return { minCss: r2(min), between: at }
}

function groupGaps(groups) {
  let min = Infinity
  let at = null
  for (let a = 0; a < groups.length; a++)
    for (let b = a + 1; b < groups.length; b++) {
      const A = groups[a].cssBox
      const B = groups[b].cssBox
      const gx = Math.max(B.x0 - A.x1, A.x0 - B.x1, 0)
      const gy = Math.max(B.y0 - A.y1, A.y0 - B.y1, 0)
      const gap = Math.hypot(gx, gy)
      if (gap < min) {
        min = gap
        at = [groups[a].key, groups[b].key]
      }
    }
  return { minCss: r2(min), between: at }
}

function starRecord(st, info, seat) {
  const rec = {
    slug: st.slug,
    group: st.group,
    alpha: st.alpha,
    x: frac(st.x / info.width),
    y: frac(st.y / info.height),
    px: [r2(st.x), r2(st.y)],
    proof: st.proof,
  }
  if (seat) {
    const sx = info.width / info.css[0]
    rec.label = seat.side
    rec.align = seat.align
    rec.nameBox = {
      x0: frac((seat.box.x0 * sx) / info.width), y0: frac((seat.box.y0 * sx) / info.height),
      x1: frac((seat.box.x1 * sx) / info.width), y1: frac((seat.box.y1 * sx) / info.height),
      css: [r2(seat.box.x0), r2(seat.box.y0), r2(seat.box.x1), r2(seat.box.y1)],
    }
    rec.under = seat.under
  }
  return rec
}

/** the frame with every projected point ringed and every name box drawn */
async function proofSheet(master, file, stars, seats, info, fireBox, safe, s, over = null) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">`
  svg += `<rect x="${safe.x0 * s}" y="${safe.y0 * s}" width="${(safe.x1 - safe.x0) * s}" height="${(safe.y1 - safe.y0) * s}" fill="none" stroke="#3fd0c0" stroke-width="${s}" stroke-dasharray="${8 * s} ${6 * s}"/>`
  svg += `<rect x="${fireBox.x0}" y="${fireBox.y0}" width="${fireBox.x1 - fireBox.x0}" height="${fireBox.y1 - fireBox.y0}" fill="none" stroke="#ff7a30" stroke-width="${s}"/>`
  if (over) svg += `<rect x="${over.x0 * s}" y="${over.y0 * s}" width="${(over.x1 - over.x0) * s}" height="${(over.y1 - over.y0) * s}" fill="none" stroke="#ff7a30" stroke-dasharray="${4 * s} ${4 * s}" stroke-width="${s}"/>`
  stars.forEach((st, i) => {
    svg += `<circle cx="${st.x}" cy="${st.y}" r="${9 * s}" fill="none" stroke="#7CFC00" stroke-width="${s}"/>`
    const b = seats?.[i]?.box
    if (b) {
      svg += `<rect x="${b.x0 * s}" y="${b.y0 * s}" width="${(b.x1 - b.x0) * s}" height="${(b.y1 - b.y0) * s}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="${s}"/>`
      // a tick from the star's ring to its box says whose name it is
      const tx = Math.min(Math.max(st.x / s, b.x0), b.x1)
      const ty = Math.min(Math.max(st.y / s, b.y0), b.y1)
      const n = Math.hypot(tx - st.x / s, ty - st.y / s) || 1
      svg += `<line x1="${st.x + ((tx - st.x / s) / n) * 9 * s}" y1="${st.y + ((ty - st.y / s) / n) * 9 * s}" x2="${tx * s}" y2="${ty * s}" stroke="#7CFC00" stroke-width="${s}"/>`
    }
  })
  svg += '</svg>'
  await sharp(master).composite([{ input: Buffer.from(svg) }]).png().toFile(file)
}

/** the points over the C8 line under the given boxes (css px), a hairline's
    own pixels aside: field stars, companions, embers */
function brightPoints(raw, w, h, boxes, s, segs, ring = null) {
  const pts = []
  const m = Math.max(2, ring?.margin ?? 0)
  for (const b of boxes) {
    const near = segs.filter(([ax, ay, bx, by]) => Math.max(ax, bx) > b.x0 - m - 4 && Math.min(ax, bx) < b.x1 + m + 4 && Math.max(ay, by) > b.y0 - m - 4 && Math.min(ay, by) < b.y1 + m + 4)
    for (let y = Math.max(0, Math.floor((b.y0 - m) * s)); y < Math.min(h, Math.ceil((b.y1 + m) * s)); y++)
      for (let x = Math.max(0, Math.floor((b.x0 - m) * s)); x < Math.min(w, Math.ceil((b.x1 + m) * s)); x++) {
        if (ring?.mask[y * w + x] || lum(raw, w, x, y) <= BRIGHT) continue
        const cx = (x + 0.5) / s
        const cy = (y + 0.5) / s
        if (near.some(([ax, ay, bx, by]) => segDist(cx, cy, ax, ay, bx, by) < 2.5)) continue
        if (!pts.some((q) => Math.abs(q.x - cx) < 4 && Math.abs(q.y - cy) < 4)) pts.push({ x: cx, y: cy })
      }
  }
  return pts
}

/** clear points of the sky in batches of the scene's eight page rects and keep
    each pixel's darkest value: a reserve only takes light away and the frame
    draws the same every time, so the result is every rect at once */
async function clearPoints(page, points, shootFn, base) {
  const rects = points.map((p) => ({ x0: p.x - 6, y0: p.y - 6, x1: p.x + 6, y1: p.y + 6 }))
  const out = Buffer.from(base)
  for (let i = 0; i < rects.length; i += 8) {
    await page.evaluate(([r]) => window.__still.reserve(r), [rects.slice(i, i + 8)])
    const shot = await shootFn()
    for (let j = 0; j < out.length; j++) if (shot.raw[j] < out[j]) out[j] = shot.raw[j]
  }
  await page.evaluate(() => window.__still.reserve([]))
  return { raw: out, rects }
}

const writeMaster = (raw, info, file) =>
  sharp(raw, { raw: { width: info.width, height: info.height, channels: 3 } }).withIccProfile('srgb').png({ compressionLevel: 9 }).toFile(file)

/**
 * Seat the names on a frame with no pixel over the C8 line under any of them:
 * seat strictly; failing that, seat at a price per bright box, clear what
 * stands under those boxes, and seat again on the cleared frame.
 */
async function seatClean({ page, seat, raw, info, s, file, shootFn, reproject, ring = null }) {
  const base = Buffer.from(raw)
  let seats = seat(false)
  let cleared = []
  let rects = []
  for (let round = 0; !seats && round < 4; round++) {
    const loose = seat(true)
    if (!loose) break
    const more = brightPoints(raw, info.width, info.height, loose.filter((x) => x.under.bright || x.ringPx > 0).map((x) => x.box), s, loose.segs, ring)
    if (!more.length) break
    cleared = [...cleared, ...more]
    const done = await clearPoints(page, cleared, shootFn, base)
    rects = done.rects
    raw.set(done.raw)
    summed = null
    await writeMaster(raw, info, file)
    await reproject()
    seats = seat(false)
  }
  return { seats, rects }
}

/** a field star brighter than a figure star inside its glow reads as a
    double and fails the proof: clear it, so each figure star is the
    brightest point at its own place */
async function clearCrowders({ page, stars, raw, info, s, file, shootFn, reproject }) {
  const inside = (st) => st.x >= 0 && st.y >= 0 && st.x < info.width && st.y < info.height
  const pts = stars.filter((st) => inside(st) && st.proof.off > 2).map((st) => ({ x: st.proof.peak[0] / s, y: st.proof.peak[1] / s }))
  if (!pts.length) return []
  const done = await clearPoints(page, pts, shootFn, raw)
  raw.set(done.raw)
  summed = null
  await writeMaster(raw, info, file)
  await reproject()
  return done.rects
}

/** a field star inside the glow of a named star crowds it, which the scene's
    own companions never do (they keep 0.34 patch units off the thirty): clear
    the points over the C8 line there that are no figure star's own light and
    no hairline's */
async function clearBeside({ page, stars, raw, info, s, file, shootFn, reproject, mask, reach, segs }) {
  const w = info.width
  const h = info.height
  const pts = []
  for (const st of stars) {
    const [cx, cy] = st.proof.peak
    const r = reach(st)
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(h, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(w, Math.ceil(cx + r)); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue
        if (mask[y * w + x] || lum(raw, w, x, y) <= BRIGHT) continue
        const p = { x: (x + 0.5) / s, y: (y + 0.5) / s }
        if (segs.some(([ax, ay, bx, by]) => segDist(p.x, p.y, ax, ay, bx, by) < 2.5)) continue
        if (!pts.some((q) => Math.abs(q.x - p.x) < 4 && Math.abs(q.y - p.y) < 4)) pts.push(p)
      }
  }
  if (!pts.length) return []
  const done = await clearPoints(page, pts, shootFn, raw)
  raw.set(done.raw)
  summed = null
  await writeMaster(raw, info, file)
  await reproject()
  return done.rects
}

export async function buildStars({ page, name, frame, shot, master, out, samples, sub, zoom, shootZoom, redraw }) {
  const { info, raw } = shot
  CONSTELLATIONS = await page.evaluate(() => window.__still.houses())
  const shape = name === 'wide' ? 'wide' : 'tall'
  const cssW = frame.css[0]
  const { s, stars, fire } = await project(page, raw, info, cssW, frame.plume)
  const groups = groupsOf(stars, s, info)
  const safe = safeArea(frame, shape)
  const inSafe = (x, y) => x >= safe.x0 && x <= safe.x1 && y >= safe.y0 && y <= safe.y1
  const fireCss = { x0: fire.flame.x0 / s, y0: fire.flame.y0 / s, x1: fire.flame.x1 / s, y1: fire.flame.y1 / s }
  let seats = null
  const crowded = await clearCrowders({
    page, stars, raw, info, s, file: master, shootFn: redraw,
    reproject: async () => {
      const proj = await project(page, raw, info, cssW, frame.plume)
      stars.splice(0, stars.length, ...proj.stars)
    },
  })
  let reserved = crowded
  if (shape === 'wide') {
    const got = await seatClean({
      page, raw, info, s, file: master, shootFn: redraw,
      seat: (allow) => seatNames(stars, groups, frame, shape, fire.plume, raw, info, s, undefined, allow),
      reproject: async () => {
        const proj = await project(page, raw, info, cssW, frame.plume)
        stars.splice(0, stars.length, ...proj.stars)
      },
    })
    seats = got.seats
    reserved = [...crowded, ...got.rects]
  }
  const data = {
    size: [info.width, info.height],
    css: info.css,
    deviceRatio: s,
    tier: info.tier,
    samples: { ...samples, subFrames: sub },
    camera: info.camera,
    safeArea: {
      shapes: shape === 'wide' ? '16:9 down to 16:10 (object-fit: cover)' : '9:19.5 down to 9:16 (object-fit: cover)',
      x0: frac(safe.x0 / cssW), y0: frac(safe.y0 / frame.css[1]), x1: frac(safe.x1 / cssW), y1: frac(safe.y1 / frame.css[1]),
      css: [r2(safe.x0), r2(safe.y0), r2(safe.x1), r2(safe.y1)],
    },
    fire: {
      x0: frac(fire.flame.x0 / info.width), y0: frac(fire.flame.y0 / info.height), x1: frac(fire.flame.x1 / info.width), y1: frac(fire.flame.y1 / info.height),
      px: [r2(fire.flame.x0), r2(fire.flame.y0), r2(fire.flame.x1), r2(fire.flame.y1)],
      plume: { px: [r2(fire.plume.x0), r2(fire.plume.y0), r2(fire.plume.x1), r2(fire.plume.y1)] },
      insideSafe: inSafe(fireCss.x0, fireCss.y0) && inSafe(fireCss.x1, fireCss.y1),
    },
    groups: groups.map(({ cssBox, ...g }) => g),
    reservedNameBoxes: reserved.map((b) => [r2(b.x0), r2(b.y0), r2(b.x1), r2(b.y1)]),
    stars: stars.map((st, i) => starRecord(st, info, seats?.[i])),
    checks: {
      projectedOnPixels: { worstOffPx: Math.max(...stars.map((st) => st.proof.off)), within2px: stars.every((st) => st.proof.off <= 2) },
      allStarsInSafe: stars.every((st) => inSafe(st.css[0], st.css[1])),
      closestStars: pairs(stars, s),
      groupGap: groupGaps(groups),
      namesSeated: shape === 'wide' ? Boolean(seats) : 'phone shows groups; names are seated in the zoom frames',
      worstNameContrast: seats ? Math.min(...seats.map((x) => x.under.contrast)) : null,
      brightUnderName: seats ? seats.filter((x) => x.under.bright).length : null,
      hairlinePxUnderNames: seats ? Math.max(...seats.map((x) => x.under.hairlinePx)) : null,
      brightestCellUnderNames: seats ? Math.max(...seats.map((x) => x.under.brightCell)) : null,
      brightLine: +BRIGHT.toFixed(4),
      nameBox: NAME_BOX,
      tapCss: TAP,
    },
  }
  await proofSheet(master, join(out, `stars-proof-${name}.png`), stars, seats, info, fire.plume, safe, s, shape === 'wide' ? overPlume({ x0: fire.plume.x0 / s, y0: fire.plume.y0 / s, x1: fire.plume.x1 / s }) : null)
  if (shape === 'tall' && zoom) data.zooms = await zoomFrames({ page, groups, frame, info, out, shootZoom, tallStars: stars, flame: fire.flame, plume: fire.plume })
  // the round's own checks travel beside the data, never inside stars.json
  const props = await page.evaluate(() => window.__still.props())
  const extra = {
    props: props.map((p) => ({ name: p.name, box: [r2(p.x0), r2(p.y0), r2(p.x1), r2(p.y1)], state: cutState(p, info.width, info.height) })),
    ...(seats ? nameChecks(seats, stars) : {}),
    ...(shape === 'tall' ? { plates: plateChecks(groups, stars, s) } : {}),
    zooms: (data.zooms ?? []).map((z) => z.extra),
  }
  Object.defineProperty(data, 'extra', { value: extra, enumerable: false })
  return data
}

/** a box against a frame: whole inside, wholly outside, or cut by an edge */
function cutState(b, W, H) {
  if (b.x0 >= 0 && b.y0 >= 0 && b.x1 <= W && b.y1 <= H) return 'whole'
  if (b.x1 <= 0 || b.y1 <= 0 || b.x0 >= W || b.y0 >= H) return 'out'
  return 'CUT'
}

/** the seated names against the rules: the nearest hairline to any box, the
    boxes that stepped away from their star, pixels over the C8 line, and any
    two houses' names that line up */
function nameChecks(seats, stars, others = null) {
  let clashes = 0
  for (let i = 0; i < seats.length; i++)
    for (let j = i + 1; j < seats.length; j++) if (stars[i].group !== stars[j].group && housesClash(seats[i].box, seats[j].box)) clashes++
  const out = {
    nearestHairlineCss: r2(Math.min(...seats.clear)),
    lineClearRule: LINE_CLEAR,
    steppedAway: seats.filter((x) => x.gap > NAME_BOX.gap).length,
    boxesWithBrightPixels: seats.filter((x) => x.under.starPx > 0).length,
    ...(seats.some((x) => 'ringPx' in x) ? { boxesWithBrightRing: seats.filter((x) => x.ringPx > 0).length } : {}),
    hairlinePxUnderNames: Math.max(...seats.map((x) => x.under.hairlinePx)),
    houseLineUps: clashes,
  }
  if (!others) return out
  // the phone's tap rules, read back from the seats
  let gap = Infinity
  let pair = null
  for (let i = 0; i < seats.length; i++)
    for (let j = i + 1; j < seats.length; j++) {
      const a = hitBox(seats[i].box)
      const b = hitBox(seats[j].box)
      const g = Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1)
      if (g < gap) [gap, pair] = [g, [stars[i].slug, stars[j].slug]]
    }
  const crossings = []
  seats.forEach((x, i) => {
    for (const o of [...stars, ...others]) if (o !== stars[i] && inColumn(x.box, x.side, o.css[0], o.css[1])) crossings.push(`${stars[i].slug} over ${o.slug}`)
  })
  return { ...out, hitGapCss: { min: r2(gap), between: pair, rule: PHONE.hit }, columnCrossings: crossings, columnRule: PHONE.column }
}

/** the phone overview's house plates (each figure's box grown by the pad):
    the narrowest gap between two plates, and between a plate and another
    house's star (css px of the tall) */
function plateChecks(groups, stars, s) {
  const { pad, margin } = HOUSE_PLATE
  const plate = (g) => ({ x0: g.box.px[0] / s - pad, y0: g.box.px[1] / s - pad, x1: g.box.px[2] / s + pad, y1: g.box.px[3] / s + pad })
  const sep = (a, b) => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1)
  let plates = { min: Infinity }
  let toStar = { min: Infinity }
  for (const a of groups) {
    const A = plate(a)
    for (const b of groups) {
      if (b === a) continue
      const g = sep(A, plate(b))
      if (a.key < b.key && g < plates.min) plates = { min: g, between: [a.key, b.key] }
      for (const st of stars.filter((x) => x.group === b.key)) {
        const d = sep(A, { x0: st.css[0], y0: st.css[1], x1: st.css[0], y1: st.css[1] })
        if (d < toStar.min) toStar = { min: d, plate: a.key, star: st.slug }
      }
    }
  }
  return {
    rule: HOUSE_PLATE,
    plateGapCss: { ...plates, min: r2(plates.min) },
    plateToOtherStarCss: { ...toStar, min: r2(toStar.min) },
    pass: plates.min >= margin && toStar.min >= margin,
  }
}

/** how far over the flame box's top every house frame ends (css px of the tall) */
const OVER_FLAME = 6
/** the share of a star sprite's half width its glow is seen to (measured) */
const GLOW = 0.75
/** two house frames are alike when a tap from one to the other leaves the
    figure stars both show near where they were: their median move must reach
    this share of the frame's width, or the frames share no figure star */
const APART = 0.25
/** a house's middle stays within this share of the frame's width of the
    frame's middle */
const CENTRE = 1 / 8
/** what the joint choice weighs: a neighbour in part, one of its stars inside
    the frame, a star whose glow a 9:16 screen's edge would cut, one css px off
    centre, and (between equals) one unit of zoom, so a frame stays as close to
    the overview as its rules allow */
const WEIGH = { part: 1000, star: 10, trim: 10, off: 0.5, zoom: 1 }

/** where a crop of the tall at zoom z cuts a figure star: true when the star
    stands whole inside the crop or wholly outside it (its disc radius r) */
function wholeOrOut(x, y, r, x0, y0, cw, ch) {
  const inX = x >= x0 + r && x <= x0 + cw - r
  const inY = y >= y0 + r && y <= y0 + ch - r
  const outside = x <= x0 - r || x >= x0 + cw + r || y <= y0 - r || y >= y0 + ch + r
  return (inX && inY) || outside
}

/** the share of a segment's length inside a box */
function shareInside(ax, ay, bx, by, b) {
  let t0 = 0
  let t1 = 1
  const p = [ax - bx, bx - ax, ay - by, by - ay]
  const q = [ax - b.x0, b.x1 - ax, ay - b.y0, b.y1 - ay]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return 0
    } else {
      const r = q[i] / p[i]
      if (p[i] < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
      if (t0 > t1) return 0
    }
  }
  return t1 - t0
}

/** every other house against a crop (px of the tall): whole (its stars and
    glows inside), out (no star, glow or hairline inside), or in part with the
    count of its stars and the share of its hairlines inside */
function neighbourStates(key, crop, stars, radius, segs) {
  const out = {}
  for (const other of new Set(stars.map((st) => st.group))) {
    if (other === key) continue
    const c = { key: other }
    const own = stars.filter((st) => st.group === c.key)
    const ins = own.filter((st) => {
      const r = radius[st.slug]
      return st.x - r >= crop.x0 && st.x + r <= crop.x1 && st.y - r >= crop.y0 && st.y + r <= crop.y1
    }).length
    const lines = segs.filter((q) => q.group === c.key)
    const len = lines.reduce((a, q) => a + Math.hypot(q.s[2] - q.s[0], q.s[3] - q.s[1]), 0)
    const inLen = lines.reduce((a, q) => a + shareInside(...q.s, crop) * Math.hypot(q.s[2] - q.s[0], q.s[3] - q.s[1]), 0)
    if (ins === own.length) out[c.key] = 'whole'
    else if (ins === 0 && inLen === 0) out[c.key] = 'out'
    else out[c.key] = { stars: ins, of: own.length, lines: +(inLen / (len || 1)).toFixed(3) }
  }
  return out
}

/** the median move (css px) of the figure stars two crops both show, when a
    tap goes from one to the other; null when they share none */
function medianMove(a, b, stars, s0, css) {
  const at = (c, st) => [((st.x - c.x0) * c.z) / s0, ((st.y - c.y0) * c.z) / s0]
  const shown = ([x, y]) => x >= 0 && x <= css[0] && y >= 0 && y <= css[1]
  const d = []
  for (const st of stars) {
    const p = at(a, st)
    const q = at(b, st)
    if (shown(p) && shown(q)) d.push(Math.hypot(p[0] - q[0], p[1] - q[1]))
  }
  if (!d.length) return null
  d.sort((u, v) => u - v)
  const m = d.length >> 1
  return d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2
}

/**
 * The six house frames chosen together, before any is drawn. Each is a crop of
 * the tall at zoom z with its bottom on one line just over the flame: its own
 * house whole, inside the safe area and centred within CENTRE; no figure star
 * of any house cut by an edge; no two frames alike (APART). Among those, the
 * set with the fewest other houses in part, then the fewest of their stars
 * inside, then the most centred. seatOk(key, crop) says whether the names seat.
 */
export function planFrames({ groups, stars, radius, segs, W, H, floor, s0, css, safeTop, safeBottom, partsOf, seatOk, exclude }) {
  const apart = APART * css[0]
  const pools = {}
  for (const g of groups) {
    const own = stars.filter((st) => st.group === g.key)
    const ox0 = Math.min(...own.map((st) => st.x - radius[st.slug]))
    const ox1 = Math.max(...own.map((st) => st.x + radius[st.slug]))
    const mid = (Math.min(...own.map((st) => st.x)) + Math.max(...own.map((st) => st.x))) / 2
    const zLo = Math.max(partsOf(g), H / floor)
    const zHi = W / (ox1 - ox0)
    const best = new Map()
    for (let zi = Math.ceil(zLo * 500); zi / 500 <= zHi; zi++) {
      const z = zi / 500
      const cw = W / z
      const ch = H / z
      const y0 = floor - ch
      if (y0 < 0) continue
      // the house inside the safe area: each star by half a name, each glow whole
      if (!own.every((st) => ((st.y - y0) * z) / s0 >= safeTop + 12 && ((st.y - radius[st.slug] - y0) * z) / s0 >= safeTop)) continue
      for (let x0 = Math.max(0, Math.ceil((ox1 - cw) * 2) / 2); x0 <= Math.min(W - cw, ox0); x0 += 0.5) {
        if (!stars.every((st) => wholeOrOut(st.x, st.y, radius[st.slug], x0, y0, cw, ch))) continue
        const off = (Math.abs(mid - (x0 + cw / 2)) * z) / s0
        if (off > CENTRE * css[0]) continue
        const id = `${g.key}:${z}:${x0}`
        if (exclude.has(id)) continue
        const crop = { x0, y0, x1: x0 + cw, y1: floor }
        const nb = neighbourStates(g.key, crop, stars, radius, segs)
        const parts = Object.values(nb).filter((v) => typeof v === 'object')
        const inside = parts.reduce((a, v) => a + v.stars, 0)
        // the safe area's top and bottom are a 9:16 screen's edges
        const trim = stars.filter((st) => {
          const y = ((st.y - y0) * z) / s0
          const r = (radius[st.slug] * z) / s0
          return st.x > x0 && st.x < x0 + cw && [safeTop, safeBottom].some((line) => y - r < line && line < y + r)
        }).map((st) => st.slug)
        const cost = WEIGH.part * parts.length + WEIGH.star * inside + WEIGH.trim * trim.length + WEIGH.off * off + WEIGH.zoom * z
        // one crop per hundredth of zoom and state, the most centred
        const k = `${z.toFixed(2)}|${parts.length}|${inside}|${trim.length}`
        if (!best.has(k) || best.get(k).cost > cost) best.set(k, { id, key: g.key, z, x0, y0, cw, ch, off, nb, trim, cost })
      }
    }
    pools[g.key] = [...best.values()].sort((a, b) => a.cost - b.cost)
    if (!pools[g.key].length) throw new Error(`no house frame for ${g.key}: no crop keeps its house whole and centred`)
  }
  const like = new Map()
  const apartOk = (a, b) => {
    const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
    if (!like.has(k)) {
      const m = medianMove(a, b, stars, s0, css)
      like.set(k, m == null || m >= apart)
    }
    return like.get(k)
  }
  const seated = new Map()
  const seats = (c) => {
    if (!seated.has(c.id)) seated.set(c.id, seatOk(c.key, c))
    return seated.get(c.id)
  }
  // search the six together: the house with the fewest crops first, every
  // later pool narrowed to what stays apart from the choice so far
  const keys = Object.keys(pools).sort((a, b) => pools[a].length - pools[b].length)
  let best = null
  let bestCost = Infinity
  const pick = {}
  const rec = (i, live, acc) => {
    if (i === keys.length) {
      bestCost = acc
      best = { ...pick }
      return
    }
    let rest = 0
    for (let j = i + 1; j < keys.length; j++) rest += live[keys[j]][0]?.cost ?? Infinity
    for (const c of live[keys[i]]) {
      if (acc + c.cost + rest >= bestCost) break
      if (!seats(c)) continue
      const next = { ...live }
      let dead = false
      for (let j = i + 1; j < keys.length && !dead; j++) {
        next[keys[j]] = live[keys[j]].filter((d) => apartOk(c, d))
        dead = next[keys[j]].length === 0
      }
      if (dead) continue
      pick[keys[i]] = c
      rec(i + 1, next, acc + c.cost)
      delete pick[keys[i]]
    }
  }
  rec(0, pools, 0)
  if (!best) throw new Error('no six house frames stand apart under the rules')
  return { frames: best, cost: bestCost, pools: Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.length])), apart }
}

/**
 * Every house drawn once more on the phone, cropped from the tall and drawn at
 * full resolution: the six crops chosen together (planFrames), each bottom on
 * one line of the scene just over the flame (the fire out, its sparks and glow
 * in, the near ring's beams and capitals across the foot of every frame); the
 * names seated as in the wide. A crop whose names will not seat on its drawn
 * pixels is set aside and the six are chosen again.
 */
async function zoomFrames({ page, groups, frame, info, out, shootZoom, tallStars, flame, plume }) {
  // the phone's stage calls a name by its short form; its box is sized to it
  const names = await page.evaluate(() => window.__still.names())
  const widths = Object.fromEntries(names.map((n) => [n.slug, Math.max(56, Math.round(n.short.length * 8.5 + 14))]))
  const W = info.width
  const H = info.height
  const s0 = W / frame.css[0]
  const floor = flame.y0 - OVER_FLAME * s0
  // a disc's reach in the tall's own pixels: past three quarters of the
  // sprite's half width its glow has fallen to the sky's own level (measured)
  const radius = Object.fromEntries(tallStars.map((st) => [st.slug, GLOW * (st.disc / 2) * frame.k * s0]))
  const safeTop = safeArea(frame, 'tall').y0
  const view = { x0: 0, y0: safeTop, x1: frame.css[0], y1: safeArea(frame, 'tall').y1 }
  const inner = { x0: view.x0 + 8, y0: view.y0 + 8, x1: view.x1 - 8, y1: view.y1 - 8 }
  const at = Object.fromEntries(tallStars.map((st, i) => [st.slug, i]))
  const pairs = []
  for (const c of CONSTELLATIONS)
    for (const [a, b] of c.lines) if (at[c.stars[a]] != null && at[c.stars[b]] != null) pairs.push([at[c.stars[a]], at[c.stars[b]]])
  // the tall's hairlines as drawn, inset from both stars, with their house
  const segsTall = pairs.map(([a, b]) => ({ s: drawnSegments(tallStars, [[a, b]], (i) => insetOf(tallStars[i].disc) * frame.k * s0)[0], group: tallStars[a].group }))
  function seatsPossible(key, x0, y0, z) {
    const css = (x, y) => [((x - x0) * z) / s0, ((y - y0) * z) / s0]
    const all = tallStars.map((st) => {
      const [x, y] = css(st.x, st.y)
      return { x, y, group: st.group, slug: st.slug }
    })
    const segs = drawnSegments(all, pairs, (i) => insetOf(tallStars[i].disc) * frame.k * z)
    const own = all.filter((st) => st.group === key)
    const gx = own.reduce((a, q) => a + q.x, 0) / own.length
    const gy = own.reduce((a, q) => a + q.y, 0) / own.length
    const pts = own.map((q) => {
      const n = Math.hypot(q.x - gx, q.y - gy) || 1
      return { ...q, outward: [(q.x - gx) / n, (q.y - gy) / n], box: { ...NAME_BOX, w: widths[q.slug] } }
    })
    const idx = Object.fromEntries(pts.map((q, i) => [q.slug, i]))
    const lines = []
    for (const c of CONSTELLATIONS) for (const [a, b] of c.lines) if (idx[c.stars[a]] != null && idx[c.stars[b]] != null) lines.push([idx[c.stars[a]], idx[c.stars[b]]])
    const [px0, py0] = css(plume.x0, plume.y0)
    const [px1, py1] = css(plume.x1, plume.y1)
    const keep = (b) => inside(b, inner) && !(b.x0 < px1 + 12 && px0 - 12 < b.x1 && b.y0 < py1 && py0 - 12 < b.y1) && 0
    const others = all.filter((st) => st.group !== key)
    return Boolean(solveSides(pts, lines, (b) => (keep(b) === false ? false : 0), { others, segs, hit: PHONE.hit, column: PHONE.column }))
  }
  const partsOf = (g) => Math.max(1, Math.ceil((TAP / g.closestCss) * 20) / 20)
  const safe = safeArea(frame, 'tall')
  const exclude = new Set()
  const drawn = {}
  let plan = null
  let renders = 0
  for (let round = 0; round < 6; round++) {
    plan = planFrames({
      groups, stars: tallStars, radius, segs: segsTall, W, H, floor, s0, css: frame.css, safeTop, safeBottom: view.y1, partsOf, exclude,
      seatOk: (key, c) => seatsPossible(key, c.x0, c.y0, c.z),
    })
    let failed = false
    for (const g of groups) {
      const c = plan.frames[g.key]
      if (drawn[g.key]?.c.id === c.id) continue
      if (++renders > 12) throw new Error('house frames: more than 12 renders without six seated frames')
      const file = join(out, `sky-tall-${g.key}.png`)
      await page.evaluate(([a, b, z]) => window.__still.zoom(a, b, z), [c.x0, c.y0, c.z])
      const shot = await shootZoom(file)
      let proj = await project(page, shot.raw, shot.info, frame.css[0], frame.plume)
      const crowded = await clearCrowders({
        page, stars: proj.stars.filter((st) => st.group === g.key), raw: shot.raw, info: shot.info, s: proj.s, file, shootFn: () => shootZoom(file),
        reproject: async () => {
          proj = await project(page, shot.raw, shot.info, frame.css[0], frame.plume)
        },
      })
      // a figure star's own light is no field star; a field star in the glow
      // of a named star, or touching a name's letters, is cleared
      const reach = (st) => GLOW * (st.disc / 2) * frame.k * c.z * s0
      const mask = ownLight(shot.raw, W, H, proj.stars, reach)
      const segsZ = drawnSegments(proj.stars.map((st) => ({ x: st.css[0], y: st.css[1] })), pairs, (i) => insetOf(proj.stars[i].disc) * frame.k * c.z)
      const beside = await clearBeside({
        page, stars: proj.stars.filter((st) => st.group === g.key), raw: shot.raw, info: shot.info, s: proj.s, file, shootFn: () => shootZoom(file), mask, reach, segs: segsZ,
        reproject: async () => {
          proj = await project(page, shot.raw, shot.info, frame.css[0], frame.plume)
        },
      })
      const ring = { margin: LINE_CLEAR, mask }
      const seatOwn = (allow) => {
        const o = proj.stars.filter((st) => st.group === g.key)
        const rest = proj.stars.filter((st) => st.group !== g.key)
        const q = groupsOf(proj.stars, proj.s, shot.info).filter((x) => x.key === g.key)
        return { own: o, gz: q, seats: seatNames(o, q, frame, 'tall', proj.fire.plume, shot.raw, shot.info, proj.s, view, allow, widths, rest, frame.k * c.z, ring) }
      }
      const got = await seatClean({
        page, raw: shot.raw, info: shot.info, s: proj.s, file, shootFn: () => shootZoom(file), ring,
        seat: (allow) => seatOwn(allow).seats,
        reproject: async () => {
          proj = await project(page, shot.raw, shot.info, frame.css[0], frame.plume)
        },
      })
      if (!got.seats) {
        console.log(`[tall ${g.key}] names do not seat on the drawn crop ${c.id}; choosing the six again`)
        exclude.add(c.id)
        delete drawn[g.key]
        failed = true
        break
      }
      const { own, gz } = seatOwn(false)
      drawn[g.key] = { c, shot, proj, own, gz, seats: got.seats, reserved: [...crowded, ...beside, ...got.rects], file, beside: beside.length }
    }
    if (!failed) break
    plan = null
  }
  if (!plan) throw new Error('house frames: no six seated frames in six rounds')
  const res = []
  for (const g of groups) {
    const { c, shot, proj, own, gz, seats, reserved, file, beside } = drawn[g.key]
    const { z, x0, y0, cw, ch } = c
    await proofSheet(file, join(out, `stars-proof-tall-${g.key}.png`), own, seats, shot.info, proj.fire.plume, safe, proj.s)
    const cutStars = tallStars.filter((st) => !wholeOrOut(st.x, st.y, radius[st.slug] ?? 0, x0, y0, cw, ch)).map((st) => st.slug)
    // the frame's last rows over the fire hold no flame, only sparks and glow
    const fx0 = Math.max(0, Math.floor((flame.x0 - x0) * z))
    const fx1 = Math.min(W - 1, Math.ceil((flame.x1 - x0) * z))
    let foot = 0
    let footWide = 0
    for (let y = H - 3; y < H; y++) {
      let run = 0
      for (let x = fx0; x <= fx1; x++) {
        const l = lum(shot.raw, W, x, y)
        foot = Math.max(foot, l)
        run = l > 0.25 ? run + 1 : 0
        footWide = Math.max(footWide, run)
      }
    }
    await page.evaluate(([a, b, zz]) => window.__still.zoom(a, b, zz), [x0, y0, z])
    const propsZ = await page.evaluate(() => window.__still.props())
    const extra = {
      group: g.key,
      zoom: z,
      crop: [r2(x0), r2(y0), r2(x0 + cw), r2(y0 + ch)],
      offCentreCss: r2(c.off),
      cutBy916: c.trim,
      fieldPointsClearedBesideStars: beside,
      neighbours: c.nb,
      medianMoveCss: Object.fromEntries(groups.filter((h) => h.key !== g.key).map((h) => [h.key, ((m) => (m == null ? null : r2(m)))(medianMove(c, plan.frames[h.key], tallStars, s0, frame.css))])),
      starsCutByAnEdge: cutStars,
      footOverFire: { maxLum: +foot.toFixed(3), widestRunOver025: footWide },
      props: propsZ.map((p) => ({ name: p.name, state: cutState(p, W, H) })),
      ...(seats ? nameChecks(seats, own, proj.stars.filter((st) => st.group !== g.key)) : {}),
    }
    if (g === groups[0]) extra.plan = { rule: { apartCss: plan.apart, centreCss: r2(CENTRE * frame.css[0]), weigh: WEIGH }, cost: r2(plan.cost), crops: plan.pools, renders }
    res.push({
      group: g.key,
      file: `sky-tall-${g.key}`,
      zoom: z,
      partsAt: partsOf(g),
      closestBeforeCss: g.closestCss,
      closestCss: gz[0]?.closestCss,
      crop: { px: [r2(x0), r2(y0), r2(x0 + cw), r2(y0 + ch)], x0: frac(x0 / W), y0: frac(y0 / H), x1: frac((x0 + cw) / W), y1: frac((y0 + ch) / H) },
      nameBoxes: 'the short name, about 8.5 css px a letter plus 14, at least 56 wide, 24 high',
      namesSeated: Boolean(seats),
      reservedNameBoxes: reserved.map((b) => [r2(b.x0), r2(b.y0), r2(b.x1), r2(b.y1)]),
      worstNameContrast: seats ? Math.min(...seats.map((x) => x.under.contrast)) : null,
      stars: own.map((st, i) => starRecord(st, shot.info, seats?.[i])),
    })
    Object.defineProperty(res[res.length - 1], 'extra', { value: extra, enumerable: false })
  }
  await page.evaluate(() => window.__still.zoom(0, 0, 1))
  return res
}

/**
 * The same measures on the live lobby's own frame (the before): its stars
 * projected by the still page in lobby mode, which builds the live wheel
 * through the live code path, and proved on the live screenshot.
 */
export async function measureBefore({ page, file, shape, css, proofFile }) {
  CONSTELLATIONS = await page.evaluate(() => window.__still.houses())
  const got = await page.evaluate(() => ({ stars: window.__still.stars(), info: window.__still.info() }))
  const { data: raw, info: im } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const info = { width: im.width, height: im.height, css }
  const s = im.width / css[0]
  const f = im.width / got.info.width
  const all = got.stars.map((st) => ({ ...st, x: st.x * f, y: st.y * f }))
  const shown = all.filter((st) => st.depth < 1 && st.x >= 0 && st.y >= 0 && st.x < im.width && st.y < im.height)
  const stars = shown.map((st) => ({ ...st, proof: proveOnPixels(raw, im.width, im.height, st.x, st.y, 6 * s), css: [st.x / s, st.y / s] }))
  const safe = safeArea({ css }, shape)
  const inSafe = (x, y) => x >= safe.x0 && x <= safe.x1 && y >= safe.y0 && y <= safe.y1
  const groups = groupsOf(stars, s, info).filter((g) => Number.isFinite(g.centre.px[0]))
  const view = { x0: 0, y0: 0, x1: css[0], y1: css[1] }
  const far = { x0: -1e5, y0: -1e5, x1: -1e5 + 1, y1: -1e5 + 1 }
  const seats = stars.length ? seatNames(stars, groups, { css }, shape, far, raw, info, s, shape === 'wide' ? safe : { ...view, y0: safe.y0, y1: safe.y1 }) : null
  await proofSheet(file, proofFile, stars, seats, info, far, safe, s)
  return {
    file,
    size: [im.width, im.height],
    starsInFrame: stars.length,
    of: all.length,
    stars: stars.map((st, i) => starRecord(st, info, seats?.[i])),
    checks: {
      projectedOnPixels: stars.length ? { worstOffPx: Math.max(...stars.map((st) => st.proof.off)), within2px: stars.every((st) => st.proof.off <= 2) } : null,
      inSafe: stars.filter((st) => inSafe(st.css[0], st.css[1])).length,
      closestStars: pairs(stars, s),
      namesSeated: Boolean(seats),
      worstNameContrast: seats ? Math.min(...seats.map((x) => x.under.contrast)) : null,
    },
  }
}
