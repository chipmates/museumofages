// THE MAP FILM'S PRINT AND AIR PER FRAME, without a render: the exposure (`ev`) and the air map.ts gives every frame
// at 8 a second, both framings, from the page's own ramp (map/print-ramp.ts), against a base film's: the base cams
// with the old 13-point average (0.5 s apart over 6 s, eased across cuts). Reads: every stop change with its size;
// the largest step between neighbouring frames outside a cut; each cut's first frame against its stop's own value;
// the frames more than 3 s from any stop change against the base; each stop's still against a folder of pick
// sidecars; the hour against the base; optional camera motion over a span. Exit 1 on a failed line.
//
//   node --experimental-strip-types --no-warnings forge/babylon-map/print-ramp-check.mjs \
//     [--base <base map-cams.json>] [--picks <stills dir>] [--sidecar <frames-*.json>]... [--motion a:b]... \
//     [--step 0.04] [--json <out>]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..')
const MAP = join(APP, 'src/wings/babylon/map')
const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
const { makePath } = await import(join(MAP, 'path.ts'))
const { makeRamp } = await import(join(MAP, 'print-ramp.ts'))
const { keysFor } = await import(join(APP, 'src/wings/babylon/bruegel-show/show-path.ts'))

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const many = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []))
const STEP = Number(opt('--step', '0.04'))
const FPS = 8
const SIGMA = 0.00018 // map.ts setAir's floor

const plan = JSON.parse(readFileSync(join(MAP, 'map-plan.json'), 'utf8'))
const cams = JSON.parse(readFileSync(join(MAP, 'map-cams.json'), 'utf8'))
const baseCams = JSON.parse(readFileSync(opt('--base', join(MAP, 'map-cams.json')), 'utf8'))
const b = buildPlan(plan, { houses: true })
const F = makeFrame(plan)
const stand = (x, z) => b.stand(x, z)

const stopsOf = (c, n, framing) => {
  const s = c.stops.find((x) => x.n === n)
  return (s?.stops ?? 0) + (s?.hourStops?.[framing] ?? 0)
}
const airOf = (c, n) => c.stops.find((x) => x.n === n)?.air ?? 0
/* the base page's formula, kept here as the reference */
const oldAt = (path, t, value) => {
  let acc = 0
  for (let k = -6; k <= 6; k++) acc += value(path.sample(t + k * 0.5).stop)
  return acc / 13
}

function film(c, walk) {
  const path = makePath(walk === 'show' ? { ...c, path: keysFor(c, 'bruegel-show') } : c, F.s, stand)
  return { path, ramp: makeRamp(path.keys, path.duration) }
}
const deg = (r) => (r * 180) / Math.PI
const yawTilt = (pos, look) => {
  const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2]
  return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))]
}
const wrap = (a) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI

const report = { walks: {} }
let red = 0
const line = (ok, text) => {
  if (!ok) red++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`)
}

for (const walk of ['shared', 'show']) {
  const now = film(cams, walk), base = film(baseCams, walk)
  const N = Math.floor(now.path.duration * FPS + 1e-6)
  const frames = []
  for (let i = 0; i <= N; i++) {
    const t = i / FPS
    const p = now.path.sample(t), q = base.path.sample(Math.min(t, base.path.duration))
    const f = { t, stop: p.stop, hour: p.hour, baseHour: q.hour }
    for (const fr of ['desktop', 'phone']) {
      f[fr] = now.ramp.at(t, (n) => stopsOf(cams, n, fr))
      f[`base_${fr}`] = oldAt(base.path, t, (n) => stopsOf(baseCams, n, fr))
    }
    f.air = now.ramp.at(t, (n) => airOf(cams, n))
    f.baseAir = oldAt(base.path, t, (n) => airOf(baseCams, n))
    frames.push(f)
  }
  const cuts = now.path.keys.filter((k) => k.cut).map((k) => k.t)
  const crosses = (t0, t1) => cuts.some((c) => c > t0 && c <= t1)
  const changes = (path) => path.keys.flatMap((k, i) => (i > 0 && k.stop !== path.keys[i - 1].stop ? [{ t: k.t, from: path.keys[i - 1].stop, to: k.stop, cut: !!k.cut }] : []))
  const nowChanges = changes(now.path), baseChanges = changes(base.path)
  const W = { walk, duration: now.path.duration, baseDuration: base.path.duration, frames: frames.length, changes: [], steps: {}, cuts: [], far: {}, hours: {} }
  console.log(`\n== walk ${walk}: ${frames.length} frames, ${now.path.duration.toFixed(2)} s (base ${base.path.duration.toFixed(2)} s)`)
  for (const ch of nowChanges) {
    const d = Object.fromEntries(['desktop', 'phone'].map((fr) => [fr, +(stopsOf(cams, ch.to, fr) - stopsOf(cams, ch.from, fr)).toFixed(3)]))
    W.changes.push({ ...ch, d, air: airOf(cams, ch.to) - airOf(cams, ch.from) })
    console.log(`   change ${ch.t.toFixed(2)} s stop ${ch.from} -> ${ch.to}${ch.cut ? ' (cut)' : ''}: desktop ${d.desktop}, phone ${d.phone} stops`)
  }
  // the largest step between neighbouring frames outside a cut, now and base
  for (const key of ['desktop', 'phone', 'air']) {
    for (const which of ['now', 'base']) {
      const k = which === 'now' ? key : key === 'air' ? 'baseAir' : `base_${key}`
      const eff = (v) => (key === 'air' ? Math.max(SIGMA, v) : v)
      let max = 0, at = 0, n = 0
      for (let i = 1; i < frames.length; i++) {
        if (crosses(frames[i - 1].t, frames[i].t)) continue
        const s = Math.abs(eff(frames[i][k]) - eff(frames[i - 1][k]))
        if (s > 1e-12) n++
        if (s > max) (max = s), (at = frames[i].t)
      }
      W.steps[`${which}_${key}`] = { max, at, moving: n }
    }
  }
  for (const fr of ['desktop', 'phone']) {
    const s = W.steps[`now_${fr}`], o = W.steps[`base_${fr}`]
    line(s.max <= STEP + 1e-9, `${walk} ${fr}: max ev step outside a cut ${s.max.toFixed(4)} at ${s.at.toFixed(3)} s (line ${STEP}; base ${o.max.toFixed(4)} at ${o.at.toFixed(3)} s)`)
  }
  {
    const s = W.steps.now_air, o = W.steps.base_air
    console.log(`   ${walk} air (as set, floor ${SIGMA}): max step outside a cut ${s.max.toExponential(3)} at ${s.at.toFixed(3)} s (base ${o.max.toExponential(3)} at ${o.at.toFixed(3)} s)`)
  }
  // each cut's first frame carries its own stop's value, and the frame before carries the stop it leaves
  for (const c of cuts) {
    const i1 = frames.findIndex((f) => f.t >= c), f1 = frames[i1], f0 = frames[i1 - 1]
    const row = { cut: c, after: f1.t, stop: f1.stop, before: f0?.t, stopBefore: f0?.stop }
    let ok = true
    for (const fr of ['desktop', 'phone']) {
      const own = stopsOf(cams, f1.stop, fr), own0 = f0 ? stopsOf(cams, f0.stop, fr) : own
      row[fr] = { after: +f1[fr].toFixed(4), own, before: f0 ? +f0[fr].toFixed(4) : null, ownBefore: own0, baseAfter: +f1[`base_${fr}`].toFixed(4), baseBefore: f0 ? +f0[`base_${fr}`].toFixed(4) : null }
      // a stop change within 3 s of the cut, inside its run, is a ramp of its own: then only the side the cut faces is checked
      const near = nowChanges.some((ch) => !ch.cut && Math.abs(ch.t - c) < 3)
      if (!near && Math.abs(f1[fr] - own) > 1e-9) ok = false
      if (!near && f0 && Math.abs(f0[fr] - own0) > 1e-9) ok = false
    }
    row.air = { after: f1.air, own: airOf(cams, f1.stop) }
    W.cuts.push(row)
    line(ok, `${walk} cut ${c.toFixed(2)} s: frame ${f1.t.toFixed(3)} stop ${f1.stop} desktop ${row.desktop.after} (own ${row.desktop.own}; base ${row.desktop.baseAfter}), phone ${row.phone.after} (own ${row.phone.own}; base ${row.phone.baseAfter}); frame before ${f0?.t.toFixed(3)} stop ${f0?.stop} desktop ${row.desktop.before} (own ${row.desktop.ownBefore}; base ${row.desktop.baseBefore})`)
  }
  // frames more than 3 s from every stop change (now's and base's) carry the base's value
  {
    const all = [...nowChanges, ...baseChanges].map((ch) => ch.t)
    let n = 0, max = 0, at = 0, maxAir = 0
    for (const f of frames) {
      if (all.some((t) => Math.abs(f.t - t) <= 3)) continue
      if (f.t > base.path.duration) continue
      n++
      for (const fr of ['desktop', 'phone']) {
        const d = Math.abs(f[fr] - f[`base_${fr}`])
        if (d > max) (max = d), (at = f.t)
      }
      maxAir = Math.max(maxAir, Math.abs(Math.max(SIGMA, f.air) - Math.max(SIGMA, f.baseAir)))
    }
    W.far = { frames: n, max, at, maxAir }
    line(max < 1e-9 && maxAir < 1e-12, `${walk}: ${n} frames over 3 s from a stop change: max ev difference from base ${max.toExponential(2)} at ${at.toFixed(3)} s, air ${maxAir.toExponential(2)}`)
  }
  // the hour against the base, frame by frame
  {
    let max = 0, at = 0, n = 0
    for (const f of frames) {
      if (f.t > base.path.duration) continue
      const d = Math.abs(f.hour - f.baseHour)
      if (d > 1e-9) n++
      if (d > max) (max = d), (at = f.t)
    }
    W.hours = { differ: n, max, at }
    console.log(`   ${walk} hour against base: ${n} frames differ, max ${(max * 60).toFixed(3)} min at ${at.toFixed(3)} s`)
  }
  // the stills: the stop's still second (map.ts stillTime) and its ev against the pick's sidecar
  if (walk === 'shared' && opt('--picks')) {
    const dir = opt('--picks')
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    W.stills = []
    for (const s of cams.stops) {
      const ks = now.path.keys.filter((k) => k.stop === s.n)
      if (!ks.length) continue
      const k = ks.find((x) => x.still) ?? ks[ks.length - 1]
      const t = (k.cut ? Math.ceil(k.t * 8) : Math.floor(k.t * 8 + 1e-6)) / 8
      for (const fr of ['desktop', 'phone']) {
        const file = files.find((f) => f.startsWith(`${String(s.n).padStart(2, '0')}-`) && f.endsWith(`-${fr}.json`))
        const side = file ? JSON.parse(readFileSync(join(dir, file), 'utf8')) : null
        const ev = now.ramp.at(t, (n) => stopsOf(cams, n, fr))
        const air = Math.max(SIGMA, now.ramp.at(t, (n) => airOf(cams, n)))
        if (!side || side.exposureStops === undefined) {
          console.log(`   still stop ${s.n} ${fr}: ${t.toFixed(3)} s ev ${ev.toFixed(4)} (no pick sidecar with an exposure)`)
          continue
        }
        const ok = Math.abs(ev - side.exposureStops) <= 0.0005 + 1e-9 && Math.abs(t - side.filmSecond) < 1e-6 && Math.abs(air - side.air.sigma) < 1e-9
        W.stills.push({ stop: s.n, framing: fr, t, ev, air, pick: { t: side.filmSecond, ev: side.exposureStops, air: side.air.sigma } })
        line(ok, `still stop ${s.n} ${fr}: ${t.toFixed(3)} s ev ${ev.toFixed(4)} air ${air.toExponential(3)} (pick ${side.filmSecond} s ev ${side.exposureStops} air ${side.air.sigma.toExponential(3)})`)
      }
    }
  }
  // the old formula against rendered sidecars: the per-frame ev the page logged
  if (walk === 'shared') {
    for (const file of many('--sidecar')) {
      const d = JSON.parse(readFileSync(file, 'utf8'))
      const fr = file.includes('phone') ? 'phone' : 'desktop'
      let max = 0
      for (const g of d.frames) max = Math.max(max, Math.abs(oldAt(base.path, g.t, (n) => stopsOf(baseCams, n, fr)) - g.ev))
      console.log(`   sidecar ${file.split('/').slice(-2).join('/')}: ${d.frames.length} frames, base formula vs logged ev max ${max.toFixed(4)} (the log keeps 3 decimals)`)
    }
  }
  // camera motion over a span: the step between neighbouring frames, position and look, both framings
  if (walk === 'shared') {
    W.motion = []
    for (const span of many('--motion')) {
      const [a, z] = span.split(':').map(Number)
      for (const fr of ['desktop', 'phone']) {
        let minPos = Infinity, minAng = Infinity, maxAng = 0, minAt = 0
        const rows = []
        for (let t = Math.ceil(a * FPS) / FPS; t <= z + 1e-9; t += 1 / FPS) {
          const t0 = t - 1 / FPS
          if (crosses(t0, t)) continue
          const p0 = now.path.sample(t0), p1 = now.path.sample(t)
          const c0 = fr === 'phone' ? p0.phone : p0, c1 = fr === 'phone' ? p1.phone : p1
          const dPos = Math.hypot(c1.pos[0] - c0.pos[0], c1.pos[1] - c0.pos[1], c1.pos[2] - c0.pos[2])
          const [y0, l0] = yawTilt(c0.pos, c0.look), [y1, l1] = yawTilt(c1.pos, c1.look)
          const dAng = deg(Math.hypot(wrap(y1 - y0) * Math.cos(l1), l1 - l0))
          // the image shift a viewer sees: the look's turn over the lens, in pixels at 1920 wide (desktop) or 1080 (phone)
          const px = (dAng / c1.hfov) * (fr === 'phone' ? 1080 : 1920)
          rows.push({ t: +t.toFixed(3), dPos: +dPos.toFixed(4), dAngDeg: +dAng.toFixed(4), px: +px.toFixed(2), yawDeg: +deg(y1).toFixed(2) })
          minPos = Math.min(minPos, dPos)
          if (dAng < minAng) (minAng = dAng), (minAt = t)
          maxAng = Math.max(maxAng, dAng)
        }
        W.motion.push({ span, framing: fr, rows })
        const still = rows.filter((r) => r.dPos < 0.005 && r.px < 0.5).length
        console.log(`   motion ${span} ${fr}: ${rows.length} frame pairs, ${still} still (under 5 mm and 0.5 px), look step ${minAng.toFixed(4)} to ${maxAng.toFixed(4)} deg (${(maxAng * FPS).toFixed(2)} deg/s at most), smallest at ${minAt.toFixed(3)}, position step from ${minPos.toFixed(4)} m`)
      }
    }
  }
  report.walks[walk] = { ...W, series: frames.map((f) => ({ t: f.t, stop: f.stop, d: +f.desktop.toFixed(4), p: +f.phone.toFixed(4), bd: +f.base_desktop.toFixed(4), bp: +f.base_phone.toFixed(4), air: f.air, bair: f.baseAir })) }
}

if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(report))
console.log(`\n${red ? `${red} FAIL` : 'all PASS'}`)
process.exit(red ? 1 : 0)
