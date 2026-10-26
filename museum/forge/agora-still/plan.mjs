// The still's layout planner: where each of the six houses stands in the
// frame, at one scale for all six, before any frame is rendered. It searches
// the largest scale at which every star stands in the open sky inside the
// safe area, the order around the fire holds, and (wide) every name finds a
// free side; (tall) the six groups stand 44 px apart.
//
//   node --experimental-strip-types forge/agora-still/plan.mjs [wide|tall] [seed]
// prints a layout block for layout.json.
import { CONSTELLATIONS } from '../../src/content/constellations.ts'
import { fireBox, inside, lens, namePenalty, safeArea, skyFloor, solveSides } from './geometry.mjs'
import { writeFileSync } from 'node:fs'
import LAYOUT from './layout.json' with { type: 'json' }

const which = process.argv[2] ?? 'wide'
let seed = Number(process.argv[3] ?? 7)
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const frame = LAYOUT[which]
const shape = which.startsWith('wide') ? 'wide' : 'tall'
const L = lens(frame)
const safe = safeArea(frame, shape)
const margin = frame.margin ?? 16
const fire = fireBox(frame, frame.plume)
const fireKeep = { x0: fire.x0 - 12, y0: fire.y0 - 12, x1: fire.x1 + 12, y1: fire.y1 }
const inner = { x0: safe.x0 + margin, y0: safe.y0 + margin, x1: safe.x1 - margin, y1: safe.y1 - margin }

/** stars of house h at centre (cx, cy) and scale k, in CSS px */
function starsOf(h, cx, cy, k) {
  const c = CONSTELLATIONS[h]
  return c.stars.map((s) => ({ x: cx + s.x * k, y: cy - s.y * k, group: h, slug: s.slug }))
}

function keepBox(b) {
  if (!inside(b, inner)) return false
  if (b.y1 > skyFloor(frame, b.x0) - 10 || b.y1 > skyFloor(frame, b.x1) - 10) return false
  return !(b.x0 < fireKeep.x1 && fireKeep.x0 < b.x1 && b.y0 < fireKeep.y1 && fireKeep.y0 < b.y1)
}

/** how far a layout is from standing; 0 when it stands without names */
function penalty(centres, k) {
  let p = 0
  const all = []
  const boxes = []
  centres.forEach(([cx, cy], h) => {
    const st = starsOf(h, cx, cy, k)
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const s of st) {
      all.push(s)
      x0 = Math.min(x0, s.x)
      x1 = Math.max(x1, s.x)
      y0 = Math.min(y0, s.y)
      y1 = Math.max(y1, s.y)
      const pad = 14
      p += Math.max(0, inner.x0 - (s.x - pad)) + Math.max(0, s.x + pad - inner.x1)
      p += Math.max(0, inner.y0 - (s.y - pad)) + Math.max(0, s.y + pad - Math.min(inner.y1, skyFloor(frame, s.x) - 22))
      if (s.x > fireKeep.x0 - 10 && s.x < fireKeep.x1 + 10 && s.y > fireKeep.y0 - 10) p += 30
    }
    boxes.push({ x0, y0, x1, y1 })
  })
  if (shape === 'wide') {
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y)
        if (all[i].group !== all[j].group) p += Math.max(0, 60 - d) * 0.5
        else p += Math.max(0, 45 - d)
      }
  } else {
    for (let a = 0; a < boxes.length; a++)
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a]
        const B = boxes[b]
        const gx = Math.max(B.x0 - A.x1, A.x0 - B.x1)
        const gy = Math.max(B.y0 - A.y1, A.y0 - B.y1)
        const gap = Math.max(gx, gy)
        p += Math.max(0, 56 - gap)
      }
  }
  // the order around the fire
  const ord = frame.order
  for (const [a, b, axis] of ord) {
    const d = axis === 'x' ? centres[b][0] - centres[a][0] : centres[b][1] - centres[a][1]
    p += Math.max(0, 30 - d)
  }
  return { p, all }
}

function sides(all, count = false) {
  const lines = []
  let base = 0
  const cent = CONSTELLATIONS.map(() => [0, 0, 0])
  for (const s of all) {
    const c = cent[s.group]
    c[0] += s.x
    c[1] += s.y
    c[2]++
  }
  for (const c of CONSTELLATIONS) {
    for (const [a, b] of c.lines) lines.push([base + a, base + b])
    base += c.stars.length
  }
  const stars = all.map((s) => {
    const c = cent[s.group]
    const dx = s.x - c[0] / c[2]
    const dy = s.y - c[1] / c[2]
    const n = Math.hypot(dx, dy) || 1
    return { ...s, outward: [dx / n, dy / n] }
  })
  return solveSides(stars, lines, keepBox, count ? { count: true, steps: 20000 } : {})
}

/** what a name box costs where it stands: off the safe area, into the court, on the fire */
function boxCost(b) {
  let v = 0
  v += Math.max(0, inner.x0 - b.x0) * 24 + Math.max(0, b.x1 - inner.x1) * 24
  v += Math.max(0, inner.y0 - b.y0) * 170 + Math.max(0, b.y1 - inner.y1) * 170
  v += Math.max(0, b.y1 - (skyFloor(frame, b.x0) - 10)) * 85 + Math.max(0, b.y1 - (skyFloor(frame, b.x1) - 10)) * 85
  const fx = Math.max(0, Math.min(b.x1, fireKeep.x1) - Math.max(b.x0, fireKeep.x0))
  const fy = Math.max(0, Math.min(b.y1, fireKeep.y1) - Math.max(b.y0, fireKeep.y0))
  return v + fx * fy
}

function lineList() {
  const lines = []
  let base = 0
  for (const c of CONSTELLATIONS) {
    for (const [a, b] of c.lines) lines.push([base + a, base + b])
    base += c.stars.length
  }
  return lines
}
const LINES = lineList()

/** the geometry, then the names: a smooth score a search can descend */
function score(centres, k) {
  const g = penalty(centres, k)
  if (shape !== 'wide') return g.p
  return g.p + namePenalty(g.all, LINES, boxCost) / 40
}

function anneal(k, start) {
  let cur = start.map((c) => c.slice())
  let p = score(cur, k)
  let T = 40
  for (let it = 0; it < Number(process.env.PLAN_ITERS ?? 6000) && p > 0; it++) {
    const h = Math.floor(rand() * 6)
    const next = cur.map((c) => c.slice())
    next[h][0] += (rand() - 0.5) * T
    next[h][1] += (rand() - 0.5) * T
    const q = score(next, k)
    if (q <= p || rand() < Math.exp((p - q) / Math.max(0.5, T / 8))) {
      cur = next
      p = q
    }
    T = Math.max(2, T * 0.999)
  }
  return { cur, p }
}

const template = frame.template.map(([u, v]) => [u * L.w, v * L.h])
if (process.env.PLAN_EXPLAIN) {
  const k = Number(process.env.PLAN_EXPLAIN)
  const centres = frame.template.map(([u, v]) => [u * L.w, v * L.h])
  const { all } = penalty(centres, k)
  const r = solveSides(all.map((s) => ({ ...s, outward: [1, 0] })), LINES, keepBox, { explain: true })
  console.log(JSON.stringify(r))
  const t0 = Date.now()
  const full = sides(all)
  console.log('dfs', full ? 'solved' : 'none', Date.now() - t0, 'ms', 'geometry penalty', penalty(centres, k).p, 'score', score(centres, k))
  if (process.env.PLAN_DRAW) draw(k, centres, full, process.env.PLAN_DRAW)
  process.exit(0)
}
let best = null
let closest = null
/* continuation: a layout that stands at one scale is the start at the next,
   so the search climbs from an easy sky toward the largest scale that holds */
let start = template
let fails = 0
const ks = []
for (let k = Number(process.env.PLAN_KMIN ?? frame.kMin); k <= Number(process.env.PLAN_KMAX ?? frame.kMax); k += 2) ks.push(k)
for (const k of ks) {
  let found = null
  for (let trial = 0; trial < Number(process.env.PLAN_TRIALS ?? 4) && !found; trial++) {
    const from = start.map(([x, y]) => [x + (rand() - 0.5) * 24 * trial, y + (rand() - 0.5) * 24 * trial])
    const { cur, p } = anneal(k, from)
    if (process.env.PLAN_DEBUG) console.log(`k ${k} trial ${trial} score ${p.toFixed(2)}`)
    if (!closest || p < closest.p) closest = { k, cur, p }
    if (penalty(cur, k).p > 0) continue
    if (shape === 'wide') {
      const sd = sides(penalty(cur, k).all)
      if (!sd) continue
      found = { k, cur, sides: sd }
    } else found = { k, cur }
  }
  if (found) {
    best = found
    start = found.cur
    fails = 0
    if (process.env.PLAN_DEBUG) console.log(`  stands at k ${k}`)
  } else if (++fails >= 2 && best) break
}
if (!best) {
  console.log(`no layout stands between kMin and kMax; closest k ${closest.k} score ${closest.p}`)
  console.log(JSON.stringify(closest.cur.map(([x, y]) => [+(x / L.w).toFixed(4), +(y / L.h).toFixed(4)])))
  if (process.env.PLAN_DRAW) draw(closest.k, closest.cur, null, process.env.PLAN_DRAW)
  process.exit(1)
}
if (process.env.PLAN_DRAW) draw(best.k, best.cur, best.sides, process.env.PLAN_DRAW)

/** the plan as a picture: sky floor, fire, safe area, stars, name boxes */
function draw(k, centres, sd, file) {
  const { all } = penalty(centres, k)
  const r = sd ?? null
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L.w}" height="${L.h}"><rect width="100%" height="100%" fill="#0b1030"/>`
  let path = ''
  for (let x = 0; x <= L.w; x += 8) path += `${x === 0 ? 'M' : 'L'}${x},${skyFloor(frame, x).toFixed(1)} `
  svg += `<path d="${path}L${L.w},${L.h} L0,${L.h} Z" fill="#2a2a38"/>`
  svg += `<rect x="${safe.x0}" y="${safe.y0}" width="${safe.x1 - safe.x0}" height="${safe.y1 - safe.y0}" fill="none" stroke="#5a8" stroke-dasharray="6 4"/>`
  svg += `<rect x="${fire.x0}" y="${fire.y0}" width="${fire.x1 - fire.x0}" height="${fire.y1 - fire.y0}" fill="#a52" opacity="0.6"/>`
  let base = 0
  for (const c of CONSTELLATIONS) {
    for (const [a, b] of c.lines) svg += `<line x1="${all[base + a].x}" y1="${all[base + a].y}" x2="${all[base + b].x}" y2="${all[base + b].y}" stroke="#caa45d" stroke-width="1"/>`
    base += c.stars.length
  }
  all.forEach((s, i) => {
    svg += `<circle cx="${s.x}" cy="${s.y}" r="4" fill="#f2d9a6"/>`
    const b = r?.[i]?.box
    if (b) svg += `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="#fff" opacity="0.7"/><text x="${b.x0 + 4}" y="${b.y1 - 7}" fill="#fff" font-size="12" font-family="sans-serif">${s.slug}</text>`
    else svg += `<text x="${s.x + 6}" y="${s.y - 6}" fill="#f88" font-size="11" font-family="sans-serif">${s.slug}</text>`
  })
  svg += '</svg>'
  writeFileSync(file, svg)
}
console.log(`k ${best.k} css px per patch unit`)
console.log(
  JSON.stringify(
    best.cur.map(([x, y], h) => ({ key: CONSTELLATIONS[h].key, u: +(x / L.w).toFixed(4), v: +(y / L.h).toFixed(4) }))
  )
)
if (best.sides) console.log(best.sides.map((s) => s.side[0] + (s.align === 'center' ? '' : s.align[0])).join(' '))
