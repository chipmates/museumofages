// THE GEOMETRY CHECK FOR ANY BABYLON STOP, offline: coplanar pairs, sub-pixel faces at the stills' cameras and floating
// bodies (the map's support rule), on the bodies the stop's page builds (mounts.mjs).
//
//   node --experimental-strip-types --no-warnings forge/babylon/geometry-check.mjs --stop <id> [--near <mm>] [--area 0.01]
//        [--reach 400] (map stops: metres around the eye) [--eyes <facts.json>] (gate: the page's path samples)
//        [--bound frame|none] (the open page: coplanar on what its first frame and its flight can show, the default, or on all of it)
//        [--flight <s>] (the open page: the flight's cameras every <s> seconds join the bound, the eyes and the sub-pixel
//        pass, 1 the default, 0 none)
//        [--all] [--json <out>]
// Exit 0 when nothing outside the allowances is found, 1 otherwise. Not covered, said plainly: anything a material
// draws (relief, displacement), occlusion (a thin face behind a wall still counts), the sign person. Every report names
// its bound: the mount's own cut, and on the open page the first frame's and the flight's cameras (the faces kept and
// left out, and the sub-pixel pass's cameras), with the seconds of each pass.
import { realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveStop } from './pages.mjs'
import { MOUNTS } from './mounts.mjs'
import { coplanar, floating, frameKeep, pixelCell, subPixel } from './geometry.mjs'

const MARGIN = 1.1, PER_PX = 4

/** the check on a mounted stop: { report, lines, bad }. `bound` is the open page's option ('frame' or 'none') */
export function checkMount(M, st, { bed = 0.002, area = 0.01, all = false, bound = 'frame', flight = 1, mountSeconds = null } = {}) {
  const passSeconds = { mount: mountSeconds }
  const timed = (k, f) => { const t = Date.now(); const r = f(); passSeconds[k] = +((Date.now() - t) / 1000).toFixed(1); return r }
  const open = M.page === 'open'
  if (!['frame', 'none'].includes(bound)) throw new Error(`--bound ${bound}: frame or none`)
  const framed = open && bound === 'frame'
  // the flight's cameras after the first frame: their eyes join the stop's eyes, and in the frame bound their frusta
  // and pixels join the first frame's
  const fly = open && flight > 0 && M.flightCameras ? M.flightCameras(flight) : []
  const flyTimes = [...new Set(fly.map((c) => c.t))]
  const eyes = [...M.eyes, ...flyTimes.map((t) => fly.find((c) => c.t === t).eye.clone())] // both framings share the eye
  const boundCams = [...M.cameras, ...fly]
  // the sub-pixel pass looks through the same cameras: a face thin at the landing is thin whatever the first frame shows
  const thinCams = open ? boundCams : M.cameras
  let pairFaces = M.faces, cover = { kind: 'mount', says: M.cut ?? null }
  const px = framed ? pixelCell(boundCams, { perPx: PER_PX }) : null
  if (framed) {
    const keep = frameKeep(boundCams, { margin: MARGIN })
    const kept = [], seen = new Map() // body -> [faces kept, faces left out]
    for (const f of M.faces) {
      const k = keep(f)
      if (k) kept.push(f)
      const r = seen.get(f.body) ?? [0, 0]
      r[k ? 0 : 1]++
      seen.set(f.body, r)
    }
    pairFaces = kept
    const whole = [...seen.values()].filter(([a, b]) => a > 0 && b === 0).length, part = [...seen.values()].filter(([a, b]) => a > 0 && b > 0).length
    const out = [...seen].filter(([, [a]]) => a === 0).map(([b]) => b)
    const heads = new Map()
    for (const b of out) { const h = b.replace(/[-#][^:]*$/, ''); heads.set(h, (heads.get(h) ?? 0) + 1) }
    cover = {
      kind: 'frame',
      says: `the coplanar pass on the faces the first frame's still cameras and the flight's cameras (every ${flight} s after it, the landing among them, at the stills' four sizes) can show, at their pixel scale: a face is left out where all three corners lie past one side of every camera's frustum (${MARGIN} times each half width, the near side at 0.25 m), and a pair's grid cell is 1/${PER_PX} of the finest camera's device pixel where the pair comes nearest to an eye (never under the kit's 1 to 5 cm); the flight's eyes join the stop's eyes; the sub-pixel pass at the same cameras (rows only where a face lies inside one), the floating pass on the whole page`,
      mount: M.cut ?? null, cameras: boundCams.map((c) => c.name), flight: { step: flight, times: flyTimes, cameras: fly.length }, margin: MARGIN, passes: { coplanar: 'frame', subPixel: `whole page at the first frame and the flight every ${flight} s (${thinCams.length} cameras)`, floating: 'whole page' }, subPixelCameras: thinCams.map((c) => c.name),
      faces: { kept: kept.length, out: M.faces.length - kept.length },
      bodies: { whole: whole, part, out: out.length },
      outByName: Object.fromEntries([...heads].sort((a, b) => b[1] - a[1])),
    }
  } else if (open) cover = { kind: 'none', says: "the whole page: every body the opening builds; the sub-pixel pass at the first frame's and the flight's cameras", mount: M.cut ?? null, faces: { kept: M.faces.length, out: 0 }, flight: { step: flight, times: flyTimes, eyes: flyTimes.length, cameras: fly.length }, subPixelCameras: thinCams.map((c) => c.name) }
  const pairs = timed('coplanar', () => coplanar(pairFaces, { bedM: bed, areaMin: area, eyes, counts: M.counts, masked: M.masked ?? null, cellOf: px?.cellOf ?? null }))
  if (px) cover.cell = { perPx: PER_PX, grids: px.used.calls, leastM: px.used.calls ? +px.used.least.toFixed(4) : null, mostM: px.used.calls ? +px.used.most.toFixed(4) : null }
  const ALLOWED_PAIRS = [
    { kind: 'butt', why: 'two closed bodies meeting face to face: both faces lie inside the union, no eye outside sees either' },
    { kind: 'unseen', why: "every eye of the stop stands behind the plane, so both faces are culled from every eye" },
    ...M.allowPair,
  ]
  const allowedPair = (p) => ALLOWED_PAIRS.find((r) => (r.test && r.test(p)) || (r.kind && r.kind === p.kind))
  const thin = timed('subPixel', () => subPixel(M.faces, thinCams, { checks: M.checks, buried: M.buried ?? null }))
  const allowedThin = (r) => M.allowThin.find((x) => x.body === r.body || (x.prefix && r.body.startsWith(x.prefix)))
  const floatRows = timed('floating', () => floating(M.faces, { ground: M.ground, checks: M.floats }))
  const allowedFloat = (r) => M.allowFloat.find((x) => x.body === r.body || (x.prefix && r.body.startsWith(x.prefix)))
  const floats = floatRows.filter((r) => !allowedFloat(r))

  const pairOff = pairs.filter((p) => !allowedPair(p))
  const thinOff = thin.rows.filter((r) => !allowedThin(r))
  const bodies = new Set(M.faces.map((f) => f.body)).size
  const seconds = Math.round((passSeconds.mount ?? 0) + passSeconds.coplanar + passSeconds.subPixel + passSeconds.floating)
  const report = {
    checker: 'babylon-geometry', stop: st.stop, stopId: st.id, page: M.page, frame: M.frame, faces: M.faces.length, bodies, bedMm: bed * 1000, areaMin: area,
    cameras: M.cameras.map((c) => c.name), eyes: eyes.length, bound: cover,
    coplanar: { pairs: pairs.length, offences: pairOff.length, list: (all ? pairs : pairOff).map((p) => ({ ...p, why: allowedPair(p)?.why ?? null })) },
    subPixel: { sliversInAPlane: thin.slivers, buriedEdges: thin.inside, rows: thin.rows.length, offences: thinOff.length, list: (all ? thin.rows : thinOff).map((r) => ({ ...r, why: allowedThin(r)?.why ?? null })) },
    floating: { rows: floatRows.length, offences: floats.length, list: (all ? floatRows : floats).map((r) => ({ ...r, why: allowedFloat(r)?.why ?? null })) },
    seconds, passSeconds,
  }
  const L = []
  L.push(`stop ${st.stop} (${st.id}) on the ${M.page} page${st.page === 'open' ? ' (the opening mounted as the gate page)' : ''}: ${M.faces.length} faces in ${bodies} bodies, ${M.cameras.length} cameras, ${eyes.length} eyes, ${seconds} s`)
  if (framed) L.push(`bound: the first frame and the flight (${boundCams.length} cameras: the first frame's ${M.cameras.length} and ${fly.length} along the flight, every ${flight} s at ${flyTimes.length} times ${flyTimes.join(' ')} s; margin ${MARGIN}): coplanar on ${cover.faces.kept} of ${M.faces.length} faces (bodies: ${cover.bodies.whole} whole, ${cover.bodies.part} in part, ${cover.bodies.out} left out), ${cover.faces.out} faces left out, its grid cells 1/${PER_PX} device px at the pair (${cover.cell.leastM} to ${cover.cell.mostM} m asked over ${cover.cell.grids} grids, never under the kit's own); sub-pixel on the whole page at the same ${thinCams.length} cameras; floating on the whole page`)
  else if (open) L.push(`bound: none, the whole page (${M.faces.length} faces); the flight's eyes at ${flyTimes.length} times join the stop's eyes, its ${fly.length} cameras the sub-pixel pass's`)
  else L.push(`bound: the mount's own${M.cut ? `, ${M.cut}` : ''}`)
  L.push(`seconds by pass: ${Object.entries(passSeconds).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  L.push(`coplanar (bed ${bed * 1000} mm where the faces overlap, area over ${area} m2; gap: the median where they do): ${pairs.length} pairs (${['fight', 'unseen', 'butt'].map((k) => `${k} ${pairs.filter((p) => p.kind === k).length}`).join(', ')}; ${pairs.filter((p) => p.across).length} across offset runs), ${pairOff.length} not allowed`)
  for (const p of (all ? pairs : pairOff).slice(0, 30)) L.push(`  [${p.kind} ${p.facing > 0 ? '+' : '-'}${p.across ? `, across ${p.across} run pairs` : ''}] ${p.a} | ${p.b}: ${p.area} m2, gap ${p.gapMm} mm (least ${p.gapMinMm}), n ${p.n.join(',')}, x ${p.x.join('..')} y ${p.y.join('..')} z ${p.z.join('..')}`)
  L.push(`sub-pixel (under 1 device px over 4 px; ${thin.slivers} slivers of triangulated planes set aside${M.buried ? `, ${thin.inside} faces whose long edge runs into another closed body` : ''}): ${thin.rows.length} rows, ${thinOff.length} not allowed`)
  for (const r of (all ? thin.rows : thinOff).slice(0, 30)) L.push(`  ${r.body} at ${r.camera}: ${r.faces} faces, thinnest ${r.thinnestPx} px (${r.thickM} m at ${r.atM} m, run ${r.runPx} px)`)
  L.push(`floating (the map's rule: a grounded body's corner over the ground by more than 1 cm, a raised body with nothing under its centre or its ends): ${floatRows.length} rows, ${floats.length} not allowed`)
  for (const r of (all ? floatRows : floats).slice(0, 30)) L.push(`  ${r.body}: base ${r.baseY} m, ${r.gapM} m over the ground at ${r.at.join(', ')} (${r.rule})`)
  const bad = pairOff.length + thinOff.length + floats.length
  L.push(bad === 0 ? 'geometry: ok' : `geometry: FAILED (${pairOff.length} coplanar, ${thinOff.length} sub-pixel, ${floats.length} floating)`)
  return { report, lines: L, bad }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
  if (!args.includes('--stop')) { console.error('--stop <id> (a stop number or id, map:<stop>, or a page name)'); process.exit(2) }
  const st = resolveStop(opt('--stop'))
  const NEAR = Number(opt('--near', 0))
  const t0 = Date.now()
  const M = await MOUNTS[st.page](st.stop, { reach: Number(opt('--reach', 400)), eyesFile: opt('--eyes', null) })
  const mountSeconds = +((Date.now() - t0) / 1000).toFixed(1)
  const { report, lines, bad } = checkMount(M, st, { bed: NEAR > 0 ? NEAR / 1000 : 0.002, area: Number(opt('--area', 0.01)), all: args.includes('--all'), bound: opt('--bound', 'frame'), flight: Number(opt('--flight', 1)), mountSeconds })
  const out = opt('--json', null)
  if (out) writeFileSync(out, JSON.stringify(report, null, 1))
  for (const l of lines) console.log(l)
  process.exit(bad === 0 ? 0 : 1)
}
