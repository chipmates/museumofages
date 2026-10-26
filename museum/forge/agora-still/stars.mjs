// The data a frame hands to the page that puts the names on it: every figure
// star projected through the frame's own camera and proved on its pixels, the
// six groups, the fire, the safe area, a free name box beside every star with
// the contrast under it, and (tall) the zoom that parts a group's stars.
import { unlinkSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { inside, nameBox, safeArea, skyFloor, solveSides, NAME_BOX, SIDES } from './geometry.mjs'
const nameBoxFor = (p, k) => nameBox(p.x, p.y, SIDES[k])

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
  return {
    mean: +mean.toFixed(4), p95: +p95.toFixed(4), max: +max.toFixed(4), contrast: ratio(p95), contrastAtMax: ratio(max),
    brightCell: +star.toFixed(4), bright: star > BRIGHT, starPx: pointPx, hairlinePx: graze,
  }
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
function seatNames(stars, groups, frame, shape, fireBox, raw, info, s, cssBox, allowBright = false, widths = null, others = []) {
  const safe = cssBox ?? safeArea(frame, shape)
  const m = 8
  const inner = { x0: safe.x0 + m, y0: safe.y0 + m, x1: safe.x1 - m, y1: safe.y1 - m }
  const fireCss = { x0: fireBox.x0 / s - 12, y0: fireBox.y0 / s - 12, x1: fireBox.x1 / s + 12, y1: fireBox.y1 / s }
  const keep = (b) => {
    if (!inside(b, inner)) return false
    if (b.x0 < fireCss.x1 && fireCss.x0 < b.x1 && b.y0 < fireCss.y1 && fireCss.y0 < b.y1) return false
    if (!cssBox && (b.y1 > skyFloor(frame, b.x0) - 6 || b.y1 > skyFloor(frame, b.x1) - 6)) return false
    const u = underBox(raw, info.width, info.height, b, s, segs)
    if (u.contrast < 4.5) return false
    // a bright star under a name is allowed only at a price: it costs one of
    // the sky's eight reserved rectangles
    return u.bright ? (allowBright ? 4 : false) : 0
  }
  const byslug = Object.fromEntries(stars.map((st) => [st.slug, st.css]))
  const segs = []
  for (const c of CONSTELLATIONS)
    for (const [a, b] of c.lines) {
      const A = byslug[c.stars[a]]
      const B = byslug[c.stars[b]]
      if (A && B) segs.push([A[0], A[1], B[0], B[1]])
    }
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
  let base = 0
  const order = stars.map((st) => st.slug)
  for (const c of CONSTELLATIONS) {
    for (const [a, b] of c.lines) {
      const i = order.indexOf(c.stars[a])
      const j = order.indexOf(c.stars[b])
      if (i >= 0 && j >= 0) lines.push([i, j])
    }
    base += c.stars.length
  }
  const otherAt = Object.fromEntries(others.map((st) => [st.slug, st.css]))
  const otherLines = []
  for (const c of CONSTELLATIONS)
    for (const [a, b] of c.lines) {
      const A = otherAt[c.stars[a]]
      const B = otherAt[c.stars[b]]
      if (A && B) otherLines.push([A[0], A[1], B[0], B[1]])
    }
  const near = { others: others.map((st) => ({ x: st.css[0], y: st.css[1] })), otherLines }
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
  return seated.map((x) => ({ ...x, under: underBox(raw, info.width, info.height, x.box, s, segs) }))
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
async function proofSheet(master, file, stars, seats, info, fireBox, safe, s) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">`
  svg += `<rect x="${safe.x0 * s}" y="${safe.y0 * s}" width="${(safe.x1 - safe.x0) * s}" height="${(safe.y1 - safe.y0) * s}" fill="none" stroke="#3fd0c0" stroke-width="${s}" stroke-dasharray="${8 * s} ${6 * s}"/>`
  svg += `<rect x="${fireBox.x0}" y="${fireBox.y0}" width="${fireBox.x1 - fireBox.x0}" height="${fireBox.y1 - fireBox.y0}" fill="none" stroke="#ff7a30" stroke-width="${s}"/>`
  stars.forEach((st, i) => {
    svg += `<circle cx="${st.x}" cy="${st.y}" r="${9 * s}" fill="none" stroke="#7CFC00" stroke-width="${s}"/>`
    const b = seats?.[i]?.box
    if (b) svg += `<rect x="${b.x0 * s}" y="${b.y0 * s}" width="${(b.x1 - b.x0) * s}" height="${(b.y1 - b.y0) * s}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="${s}"/>`
  })
  svg += '</svg>'
  await sharp(master).composite([{ input: Buffer.from(svg) }]).png().toFile(file)
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
  let seats = shape === 'wide' ? seatNames(stars, groups, frame, shape, fire.plume, raw, info, s) : null
  let reserved = []
  if (shape === 'wide' && !seats) {
    // seat with the fewest bright boxes, reserve those, and draw the frame again
    const first = seatNames(stars, groups, frame, shape, fire.plume, raw, info, s, undefined, true)
    reserved = (first ?? []).filter((x) => x.under.bright).map((x) => x.box)
    if (first && reserved.length <= 8) {
      await page.evaluate(([r]) => window.__still.reserve(r), [reserved])
      const again = await redraw()
      raw.set(again.raw)
      summed = null
      const proj = await project(page, raw, info, cssW, frame.plume)
      stars.splice(0, stars.length, ...proj.stars)
      seats = seatNames(stars, groups, frame, shape, fire.plume, raw, info, s)
    }
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
  await proofSheet(master, join(out, `stars-proof-${name}.png`), stars, seats, info, fire.plume, safe, s)
  if (shape === 'tall' && zoom) data.zooms = await zoomFrames({ page, groups, frame, info, out, shootZoom })
  return data
}

/** a group too tight for a finger is drawn once more, cropped and enlarged */
async function zoomFrames({ page, groups, frame, info, out, shootZoom }) {
  // the phone's stage calls a name by its short form; its box is sized to it
  const names = await page.evaluate(() => window.__still.names())
  const widths = Object.fromEntries(names.map((n) => [n.slug, Math.max(56, Math.round(n.short.length * 8.5 + 14))]))
  const res = []
  // every house gets its names seated: the phone names a house once it is opened
  for (const g of groups) {
    const parts = Math.max(1, Math.ceil((TAP / g.closestCss) * 20) / 20)
    // the zoom that parts the closest pair; a step further only when the
    // names need it
    let z = parts
    let shot, proj, own, gz, seats, reserved, x0, y0, cw, ch
    const file = join(out, `sky-tall-${g.key}.png`)
    const safe = safeArea(frame, 'tall')
    const view = { x0: 0, y0: safe.y0, x1: frame.css[0], y1: safe.y1 }
    for (const step of [0, 0.15, 0.3, 0.5, 0.75]) {
      z = +(parts + step).toFixed(2)
      cw = info.width / z
      ch = info.height / z
      const [cx, cy] = g.centre.px
      x0 = Math.min(Math.max(0, cx - cw / 2), info.width - cw)
      y0 = Math.min(Math.max(0, cy - ch / 2), info.height - ch)
      await page.evaluate(([a, b, c]) => window.__still.zoom(a, b, c), [x0, y0, z])
      shot = await shootZoom(file)
      proj = await project(page, shot.raw, shot.info, frame.css[0], frame.plume)
      const seatOwn = (allow) => {
        const o = proj.stars.filter((st) => st.group === g.key)
        const rest = proj.stars.filter((st) => st.group !== g.key)
        const q = groupsOf(proj.stars, proj.s, shot.info).filter((x) => x.key === g.key)
        return { own: o, gz: q, seats: seatNames(o, q, frame, 'tall', proj.fire.plume, shot.raw, shot.info, proj.s, view, allow, widths, rest) }
      }
      ;({ own, gz, seats } = seatOwn(false))
      reserved = []
      if (!seats) {
        const first = seatOwn(true).seats
        reserved = (first ?? []).filter((x) => x.under.bright).map((x) => x.box)
        if (first && reserved.length <= 8) {
          await page.evaluate(([r]) => window.__still.reserve(r), [reserved])
          shot = await shootZoom(file)
          proj = await project(page, shot.raw, shot.info, frame.css[0], frame.plume)
          ;({ own, gz, seats } = seatOwn(false))
          await page.evaluate(() => window.__still.reserve([]))
        }
      }
      if (seats) break
    }
    await proofSheet(file, join(out, `stars-proof-tall-${g.key}.png`), own, seats, shot.info, proj.fire.plume, safe, proj.s)
    // a house whose names seat on the tall frame as it is needs no frame of its own
    const same = z === 1 && reserved.length === 0
    if (same) unlinkSync(file)
    res.push({
      group: g.key,
      file: same ? 'sky-tall' : `sky-tall-${g.key}`,
      zoom: z,
      partsAt: parts,
      closestBeforeCss: g.closestCss,
      closestCss: gz[0]?.closestCss,
      crop: { px: [r2(x0), r2(y0), r2(x0 + cw), r2(y0 + ch)], x0: frac(x0 / info.width), y0: frac(y0 / info.height), x1: frac((x0 + cw) / info.width), y1: frac((y0 + ch) / info.height) },
      nameBoxes: 'the short name, about 8.5 css px a letter plus 14, at least 56 wide, 24 high',
      namesSeated: Boolean(seats),
      reservedNameBoxes: reserved.map((b) => [r2(b.x0), r2(b.y0), r2(b.x1), r2(b.y1)]),
      worstNameContrast: seats ? Math.min(...seats.map((x) => x.under.contrast)) : null,
      stars: own.map((st, i) => starRecord(st, shot.info, seats?.[i])),
    })
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
