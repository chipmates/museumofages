// THE COVERAGE MAP OF A STOP, offline: what the stop's moving camera sees of each body, at both framings, from the
// bodies a page builds (mounts.mjs) and the page's own camera track. Per body and per framing: the seconds it is in
// view, its largest size on screen (the longest side of its visible pixels' box, device pixels), its largest share of
// the frame and its pixel-seconds; per part (a rules file groups bodies into parts and names each part's record row):
// the same over its bodies, and the detail the size asks for.
//
//   node --experimental-strip-types --no-warnings forge/babylon/coverage.mjs --stop <id> [--dt 0.25] [--px 4]
//        [--desktop 1600x900@2] [--phone 390x844@3] [--reach 3000] [--parts <rules.json>] [--json <out>] [--md <out>]
//        [--still] (also every part's box on the page's own still cameras at those sizes: the PART-BOXES boxes)
//        [--still-at <second>] (the same on the track's frame at that second, for a still shot with shoot.mjs --t)
//        [--still-view '<json>'] (the gate page: the same on a still shot with shoot.mjs --look, the same json)
// <id>: a stop number or id, map:<stop> for the map page, open for the arrival's flight. Visibility is a depth-tested
// id raster at one raster pixel per --px device pixels; a part under one raster pixel can be missed and is then listed
// as "not seen". Not covered: what a material draws (relief, displacement), the sky, the sign person.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolveStop, parseSize, devicePixels } from './pages.mjs'
import { MOUNTS } from './mounts.mjs'
import { fittedFov } from './geometry.mjs'

const args = process.argv.slice(2)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
if (!args.includes('--stop')) { console.error('--stop <id> (a stop number or id, map:<stop>, or open)'); process.exit(2) }
const st = resolveStop(opt('--stop'))
const DT = Number(opt('--dt', 0.25)), PX = Number(opt('--px', 4)), NEAR = 0.3
const SIZES = { desktop: devicePixels(parseSize(opt('--desktop', '1600x900@2'))), phone: devicePixels(parseSize(opt('--phone', '390x844@3'))) }
const STILL_VIEW = args.includes('--still-view') ? JSON.parse(opt('--still-view')) : null
const STILL = args.includes('--still'), STILL_AT = args.includes('--still-at') ? Number(opt('--still-at')) : null

/** the detail a part's size asks for: px is its largest mean thickness on screen (visible pixels over the box's
    longest side, device px, the larger framing), so a long thin wall far off stays a mass however wide it runs */
export function detailFor(px, surface = false) {
  if (!(px > 0)) return 'none: not seen'
  if (surface) return px < 48 ? 'surface: tone and colour only' : 'surface: material grain and joints at the reference\'s fill'
  if (px < 8) return 'mass: a block or nothing'
  if (px < 48) return 'silhouette: outline and main masses, no relief'
  if (px < 240) return 'form: openings, steps, bands and rows as shapes; relief and courses in the material'
  if (px < 900) return 'detail: relief and courses modelled where they face the camera, per-copy variety, a fill target'
  return 'full form: the part fills much of the frame; every surface at reference detail'
}

const t0 = Date.now()
const M = await MOUNTS[st.page](st.stop, { reach: Number(opt('--reach', 3000)), cityReach: 'all' })
const track = M.track(DT)

// triangles grouped by body, flat arrays
const names = [], index = new Map()
for (const f of M.faces) if (!index.has(f.body)) { index.set(f.body, names.length); names.push(f.body) }
const order = M.faces.map((f, i) => i).sort((a, b) => index.get(M.faces[a].body) - index.get(M.faces[b].body))
const NT = order.length
const V = new Float64Array(NT * 9)
const start = new Int32Array(names.length + 1)
const sphere = new Float64Array(names.length * 4)
{
  let k = 0, b = -1
  for (const i of order) {
    const f = M.faces[i], bi = index.get(f.body)
    while (b < bi) start[++b] = k
    for (let j = 0; j < 3; j++) { V[k * 9 + j * 3] = f.v[j].x; V[k * 9 + j * 3 + 1] = f.v[j].y; V[k * 9 + j * 3 + 2] = f.v[j].z }
    k++
  }
  while (b < names.length) start[++b] = k
  for (let bi = 0; bi < names.length; bi++) {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (let t = start[bi]; t < start[bi + 1]; t++) for (let j = 0; j < 3; j++) for (let c = 0; c < 3; c++) {
      const x = V[t * 9 + j * 3 + c]; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x
    }
    const c = [0, 1, 2].map((q) => (lo[q] + hi[q]) / 2)
    sphere.set([...c, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2], bi * 4)
  }
}

/** a camera basis as geometry.mjs builds it, at the raster's size */
function basis(v, W, H) {
  const e = v.eye, l = v.look
  let fx = l[0] - e[0], fy = l[1] - e[1], fz = l[2] - e[2]
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl
  let rx = -fz, ry = 0, rz = fx // forward x up(0,1,0)
  const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx
  const vfov = fittedFov(v.hfov, W, H, v.authored)
  const half = Math.tan((vfov * Math.PI) / 360)
  return { e, f: [fx, fy, fz], r: [rx, ry, rz], u: [ux, uy, uz], half, aspect: W / H, shift: v.shift ?? 0 }
}

const depth = new Map(), ids = new Map()
function buffers(W, H) {
  const key = `${W}x${H}`
  if (!depth.has(key)) { depth.set(key, new Float32Array(W * H)); ids.set(key, new Int32Array(W * H)) }
  return [depth.get(key), ids.get(key)]
}

/** the id raster of one view: every pixel holds the nearest body's index, or -1 */
function raster(v, W, H) {
  const [Z, I] = buffers(W, H)
  Z.fill(0); I.fill(-1)
  const C = basis(v, W, H)
  const [ex, ey, ez] = C.e, [fx, fy, fz] = C.f, [rx, ry, rz] = C.r, [ux, uy, uz] = C.u
  const sx = W / 2 / (C.half * C.aspect), sy = H / 2 / C.half, shiftPx = C.shift * H / 2
  const cone = Math.atan(Math.hypot(C.half * C.aspect, C.half * (1 + Math.abs(C.shift)))) * 1.02
  const cam = new Float64Array(15)
  const poly = new Float64Array(12)
  for (let b = 0; b < names.length; b++) {
    // the body's bounding sphere against the near plane and a cone round the view
    const cx = sphere[b * 4] - ex, cy = sphere[b * 4 + 1] - ey, cz = sphere[b * 4 + 2] - ez, R = sphere[b * 4 + 3]
    const d = cx * fx + cy * fy + cz * fz
    if (d + R < NEAR) continue
    const dist = Math.hypot(cx, cy, cz)
    if (dist > R && Math.acos(Math.max(-1, Math.min(1, d / dist))) - Math.asin(R / dist) > cone) continue
    for (let t = start[b]; t < start[b + 1]; t++) {
      for (let j = 0; j < 3; j++) {
        const px = V[t * 9 + j * 3] - ex, py = V[t * 9 + j * 3 + 1] - ey, pz = V[t * 9 + j * 3 + 2] - ez
        cam[j * 3] = px * rx + py * ry + pz * rz
        cam[j * 3 + 1] = px * ux + py * uy + pz * uz
        cam[j * 3 + 2] = px * fx + py * fy + pz * fz
      }
      // clip against the near plane (Sutherland-Hodgman on one plane): up to four corners
      let n = 0
      for (let j = 0; j < 3; j++) {
        const a = j * 3, c = ((j + 1) % 3) * 3
        const za = cam[a + 2], zc = cam[c + 2]
        if (za >= NEAR) { poly[n * 3] = cam[a]; poly[n * 3 + 1] = cam[a + 1]; poly[n * 3 + 2] = za; n++ }
        if ((za >= NEAR) !== (zc >= NEAR)) {
          const s = (NEAR - za) / (zc - za)
          poly[n * 3] = cam[a] + s * (cam[c] - cam[a]); poly[n * 3 + 1] = cam[a + 1] + s * (cam[c + 1] - cam[a + 1]); poly[n * 3 + 2] = NEAR; n++
        }
      }
      if (n < 3) continue
      for (let k = 1; k + 1 < n; k++) tri(poly, 0, k, k + 1, b)
    }
  }
  function tri(P, i0, i1, i2, b) {
    const z0 = P[i0 * 3 + 2], z1 = P[i1 * 3 + 2], z2 = P[i2 * 3 + 2]
    const x0 = W / 2 + (P[i0 * 3] / z0) * sx, y0 = H / 2 - (P[i0 * 3 + 1] / z0) * sy + shiftPx
    const x1 = W / 2 + (P[i1 * 3] / z1) * sx, y1 = H / 2 - (P[i1 * 3 + 1] / z1) * sy + shiftPx
    const x2 = W / 2 + (P[i2 * 3] / z2) * sx, y2 = H / 2 - (P[i2 * 3 + 1] / z2) * sy + shiftPx
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (area === 0) return
    let minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)))
    let minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)))
    if (minX > maxX || minY > maxY) return
    const w0 = 1 / z0, w1 = 1 / z1, w2 = 1 / z2, inv = 1 / area
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5
        let a = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv
        let c = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv
        const e = 1 - a - c
        if (a < 0 || c < 0 || e < 0) continue
        const wz = a * w0 + c * w1 + e * w2
        const o = y * W + x
        if (wz > Z[o]) { Z[o] = wz; I[o] = b }
      }
    }
  }
  return I
}

// parts: rules [{ match: regex on the body name, part, piece, note? }], first match wins; an unmatched body stands alone
const rules = opt('--parts', null) ? JSON.parse(readFileSync(opt('--parts'), 'utf8')).rules.map((r) => ({ ...r, re: new RegExp(r.match) })) : []
const stopKey = st.page === 'open' ? 'open' : st.stop
const partOf = (name) => rules.find((r) => r.re.test(name) && (!r.stops || r.stops.includes(stopKey))) ?? { part: name.replace(/#\d+$/, ''), piece: '', needs: 'no rule names this body' }
const parts = new Map(), bodyPart = new Int32Array(names.length)
const plist = []
for (let b = 0; b < names.length; b++) {
  const r = partOf(names[b])
  if (!parts.has(r.part)) { parts.set(r.part, plist.length); plist.push({ part: r.part, piece: r.piece ?? '', plan: r.plan ?? '', surface: !!r.surface, needs: r.needs ?? '', note: r.note ?? '', bodies: 0, desktop: null, phone: null, boxes: {} }) }
  bodyPart[b] = parts.get(r.part)
  plist[bodyPart[b]].bodies++
}
/** per part: pixels and the box of its visible pixels in one raster; with copies, the same per body */
function byPart(I, W, H, copies = null) {
  const out = new Map()
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = I[y * W + x]
    if (b < 0) continue
    for (const [m, k] of copies ? [[out, bodyPart[b]], [copies, b]] : [[out, bodyPart[b]]]) {
      let r = m.get(k)
      if (!r) { r = { n: 0, x0: x, x1: x, y0: y, y1: y }; m.set(k, r) }
      r.n++; if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x; if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y
    }
  }
  return out
}
const FR = ['desktop', 'phone']
for (const s of track) {
  for (const fr of FR) {
    const [DW, DH] = SIZES[fr], W = Math.round(DW / PX), H = Math.round(DH / PX)
    const copies = new Map()
    for (const [p, r] of byPart(raster(s[fr], W, H), W, H, copies)) {
      const P = plist[p]
      const q = P[fr] ?? (P[fr] = { frames: 0, maxPx: 0, maxThick: 0, copyPx: 0, copyThick: 0, maxShare: 0, pxSec: 0, at: s.t, first: s.t, last: s.t })
      const long = Math.max(r.x1 - r.x0 + 1, r.y1 - r.y0 + 1), ext = long * PX
      q.frames++; q.last = s.t; q.pxSec += r.n * PX * PX * DT
      q.maxThick = Math.max(q.maxThick, (r.n / long) * PX)
      if (ext > q.maxPx) { q.maxPx = ext; q.at = s.t }
      q.maxShare = Math.max(q.maxShare, r.n / (W * H))
    }
    // one copy of a repeated part (a house, a lion, a tower): its own largest size and thickness
    for (const [b, r] of copies) {
      const q = plist[bodyPart[b]][fr], long = Math.max(r.x1 - r.x0 + 1, r.y1 - r.y0 + 1)
      q.copyPx = Math.max(q.copyPx, long * PX); q.copyThick = Math.max(q.copyThick, (r.n / long) * PX)
    }
  }
}
/** every part's and every body's box on one still view (bodies over 0.05 percent of the frame) */
const bodyBoxes = { desktop: {}, phone: {} }
function stillBoxes(v, fr, W, H) {
  const copies = new Map()
  for (const [p, r] of byPart(raster(v, W, H), W, H, copies)) plist[p].boxes[fr] = [r.x0 * PX, r.y0 * PX, (r.x1 - r.x0 + 1) * PX, (r.y1 - r.y0 + 1) * PX, r.n * PX * PX]
  for (const [b, r] of copies) if (r.n >= 0.0005 * W * H) bodyBoxes[fr][names[b]] = [r.x0 * PX, r.y0 * PX, (r.x1 - r.x0 + 1) * PX, (r.y1 - r.y0 + 1) * PX, r.n * PX * PX]
}
// the page's own still cameras at the packet sizes: each part's box there (x y w h, device px) and its visible pixels
const stills = []
if (STILL) for (const c of M.cameras) {
  const fr = c.name.includes('phone') ? 'phone' : 'desktop'
  if (c.w !== SIZES[fr][0] || c.h !== SIZES[fr][1]) continue
  const v = { eye: [c.eye.x, c.eye.y, c.eye.z], look: [c.eye.x + c.forward.x, c.eye.y + c.forward.y, c.eye.z + c.forward.z], hfov: 2 * Math.atan(c.half * c.aspect) * 180 / Math.PI, shift: c.shift, authored: null }
  stillBoxes(v, fr, Math.round(c.w / PX), Math.round(c.h / PX))
  stills.push({ framing: fr, camera: c.name })
}
if (STILL_AT !== null) {
  const s = track.reduce((a, b) => (Math.abs(b.t - STILL_AT) < Math.abs(a.t - STILL_AT) ? b : a))
  for (const fr of FR) {
    stillBoxes(s[fr], fr, Math.round(SIZES[fr][0] / PX), Math.round(SIZES[fr][1] / PX))
    stills.push({ framing: fr, camera: `track at ${s.t} s` })
  }
}
if (STILL_VIEW) {
  // as the gate page aims a --look still: a null height is the eye over the street, the frame kept 16:9 wide
  if (!M.B) throw new Error('--still-view takes the gate page only')
  const L = STILL_VIEW, ey = L.pos[1] ?? M.B.level(L.pos[2]) + 1.65
  const v = { eye: [L.pos[0], ey, L.pos[2]], look: [L.look[0], L.look[1] ?? ey, L.look[2]], hfov: L.hfov, shift: L.shift ?? 0, authored: [16, 9] }
  for (const fr of FR) {
    stillBoxes(v, fr, Math.round(SIZES[fr][0] / PX), Math.round(SIZES[fr][1] / PX))
    stills.push({ framing: fr, camera: `view ${JSON.stringify(L)}` })
  }
}
for (const P of plist) for (const fr of FR) if (P[fr]) P[fr].seconds = +(P[fr].frames * DT).toFixed(2)
const rows = plist.map((P) => {
  const q = (fr) => (P[fr] ? { seconds: P[fr].seconds, maxPx: P[fr].maxPx, thickPx: Math.round(P[fr].maxThick), copyPx: P[fr].copyPx, copyThickPx: Math.round(P[fr].copyThick), maxShare: +(P[fr].maxShare * 100).toFixed(2), mpxSec: +(P[fr].pxSec / 1e6).toFixed(3), at: P[fr].at, from: P[fr].first, to: P[fr].last } : null)
  const d = q('desktop'), p = q('phone')
  const thick = Math.max(d?.copyThickPx ?? 0, p?.copyThickPx ?? 0)
  return { part: P.part, piece: P.piece, plan: P.plan, needs: P.needs, note: P.note, surface: P.surface, bodies: P.bodies, desktop: d, phone: p, detail: detailFor(thick, P.surface), boxes: P.boxes }
}).sort((a, b) => Math.max(b.desktop?.copyThickPx ?? 0, b.phone?.copyThickPx ?? 0) - Math.max(a.desktop?.copyThickPx ?? 0, a.phone?.copyThickPx ?? 0) || a.part.localeCompare(b.part))

const report = {
  tool: 'babylon-coverage', stop: st.stop, stopId: st.id, page: M.page, frame: M.frame, faces: NT, bodies: names.length,
  samples: track.length, dt: DT, from: track[0]?.t, to: track[track.length - 1]?.t, rasterPx: PX, sizes: SIZES,
  stills, bodyBoxes, seconds: Math.round((Date.now() - t0) / 1000), parts: rows,
}
if (opt('--json', null)) writeFileSync(opt('--json'), JSON.stringify(report, null, 1))
const cell = (q, n) => (q ? `${q.seconds} s | ${q.maxPx} / ${q.thickPx}${n > 1 ? ` (one of ${n}: ${q.copyPx} / ${q.copyThickPx})` : ''} | ${q.maxShare}% | ${q.mpxSec}` : 'not seen | - | - | -')
const md = [
  `# Coverage: stop ${st.stop} (${st.id}) on the ${M.page} page`,
  '',
  `${track.length} camera samples every ${DT} s from ${report.from} to ${report.to} s; ${NT} triangles in ${names.length} bodies; raster 1 px per ${PX} device px; desktop ${SIZES.desktop.join('x')}, phone ${SIZES.phone.join('x')} device px.`,
  'Size = the longest side of the box round the part\'s visible pixels / its largest mean thickness (visible pixels over that side), device px; share = its largest share of the frame; Mpx·s = pixel-seconds in millions. Detail is read from the thickness of one copy (a part of several bodies gives the numbers of one body in brackets): under 8 px a mass, under 48 a silhouette, under 240 form, under 900 detail, then full form.',
  '',
  '| part | piece | desktop: seen | size / thick px | share | Mpx·s | phone: seen | size / thick px | share | Mpx·s | detail |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.filter((r) => r.desktop || r.phone).map((r) => `| ${r.part} | ${r.piece || `no row: ${r.needs}`} | ${cell(r.desktop, r.bodies)} | ${cell(r.phone, r.bodies)} | ${r.detail} |`),
  '',
  `Not seen by this stop's cameras (${rows.filter((r) => !r.desktop && !r.phone).length} parts): ${rows.filter((r) => !r.desktop && !r.phone).map((r) => r.part).join('; ')}.`,
  '',
].join('\n')
if (opt('--md', null)) writeFileSync(opt('--md'), md)
console.log(`coverage stop ${st.stop} (${st.id}) on ${M.page}: ${track.length} samples, ${names.length} bodies, ${rows.filter((r) => r.desktop || r.phone).length} of ${rows.length} parts seen, ${report.seconds} s`)
