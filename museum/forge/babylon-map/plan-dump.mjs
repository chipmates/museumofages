// The built footprints in UTM, for the overlay on the sheets.
//   node --experimental-strip-types --no-warnings forge/babylon-map/plan-dump.mjs <out.json> [--houses]
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const MAP = join(dirname(fileURLToPath(import.meta.url)), '../../src/wings/babylon/map')
const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
const plan = JSON.parse(readFileSync(join(MAP, 'map-plan.json'), 'utf8'))
const b = buildPlan(plan, { houses: process.argv.includes('--houses') })
const F = makeFrame(plan)
const u = (p) => F.utm(p[0], p[1]).map((v) => Math.round(v * 100) / 100)
const boxPoly = (r) => {
  const c = Math.cos(r.yaw), s = Math.sin(r.yaw)
  const ax = [c, -s], az = [s, c]
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => u([r.x + ax[0] * i * r.sx / 2 + az[0] * k * r.sz / 2, r.z + ax[1] * i * r.sx / 2 + az[1] * k * r.sz / 2]))
}
const out = {
  prisms: b.prisms.map((p) => ({ id: p.id, group: p.group, plan: p.plan, poly: p.poly.map(u), holes: p.holes.map((h) => h.map(u)) })),
  boxes: b.boxes.map((r) => ({ id: r.id, group: r.group, plan: r.plan, poly: boxPoly(r) })),
  ramps: b.ramps.map((r) => ({ id: r.id, a: u(r.a), b: u(r.b), w: r.w })),
  water: b.water.map((w) => ({ id: w.id, poly: w.poly.map(u) })),
  street: b.street.map((p) => ({ at: u([p.x, p.z]), w: p.w })),
}
writeFileSync(process.argv[2], JSON.stringify(out))
console.log(`prisms ${out.prisms.length} boxes ${out.boxes.length} water ${out.water.length} houses ${b.houses}`)
