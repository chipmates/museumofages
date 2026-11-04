// WHAT EACH BABYLON PAGE BUILDS, MOUNTED IN NODE for the geometry check: named triangles, the stills' cameras at the
// kit's sizes, the eyes that decide what is seen, the ground under a body, and the page's own allowances.
// A new stop module adds a mount here: `mount<Page>(stop, opts)` returning
//   { frame, faces, cameras, eyes, ground(x, z), counts(a, b), checks(body), floats(body), masked?, allowPair, allowThin, allowFloat }
// Run under `node --experimental-strip-types` (the pages' modules are TypeScript).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three/webgpu'
import * as TSL from 'three/tsl'
import { APP } from './pages.mjs'
import { cameraFrom, facesFrom, fittedFov } from './geometry.mjs'

const MAP = join(APP, 'src/wings/babylon/map'), GATE = join(APP, 'src/wings/babylon/gate')
const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
/** the kit's still sizes, device pixels: both framings at the shooter's defaults, and the smaller desktop */
export const SIZES = [['desktop', 3200, 1800], ['desktop', 1600, 900], ['phone', 1170, 2532], ['phone', 1080, 1920]]
const sky = { colour: () => TSL.vec3(0.5) }

function canalLines(plan, F) {
  const cz = F.s(plan.canal.line[0][0], plan.canal.line[0][1])[1]
  return [-2.4, -plan.canal.w / 2, plan.canal.w / 2, 2.4].map((d) => Math.round((cz + d) * 100) / 100)
}

/** the map's bodies as named triangles: each prism by its plan id (the `pid` attribute), each box by instance */
function mapFaces(faces, group, built, matrix, keep) {
  const houses = built.boxes.filter((b) => b.group === 'house'), rest = built.boxes.filter((b) => b.group !== 'house')
  group.updateMatrixWorld(true)
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    const M = matrix.clone().multiply(o.matrixWorld)
    if (o.isInstancedMesh) {
      const list = o.name === 'houses' ? houses : rest
      for (let k = 0; k < o.count; k++) {
        const im = new THREE.Matrix4()
        o.getMatrixAt(k, im)
        facesFrom(faces, o.geometry, M.clone().multiply(im), () => `map:${o.name === 'houses' ? 'house' : list[k]?.id ?? o.name}#${k}`, keep)
      }
    } else if (o.name === 'blocks') {
      const pid = o.geometry.getAttribute('pid')
      facesFrom(faces, o.geometry, M, (i) => { const p = pid.getX(i); return p < 0 ? 'map:ramps' : `map:${built.prisms[p].id}` }, keep)
    } else facesFrom(faces, o.geometry, M, () => `map:${o.name}`, keep)
  })
  return faces
}

/** the map page at one stop: the bodies within `reach` metres of the stop's eye, its still cameras at the kit's sizes */
export async function mountMap(stop, { reach = 400 } = {}) {
  const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
  const { buildBodies, tonesFrom } = await import(join(MAP, 'mass.ts'))
  const { makePath } = await import(join(MAP, 'path.ts'))
  const plan = json(join(MAP, 'map-plan.json')), cams = json(join(MAP, 'map-cams.json'))
  const built = buildPlan(plan)
  const F = makeFrame(plan)
  const stand = (x, z) => built.stand(x, z)
  const path = makePath(cams, F.s, stand)
  const n = Number(stop)
  const ks = path.keys.filter((k) => k.stop === n)
  if (!ks.length) throw new Error(`the map has no keys for stop ${stop}`)
  // the still's second as the page takes it (map.ts stillTime)
  const k = ks.find((x) => x.still) ?? ks[ks.length - 1]
  const time = (k.cut ? Math.ceil(k.t * 8) : Math.floor(k.t * 8 + 1e-6)) / 8
  const p = path.sample(time)
  const cameras = SIZES.map(([framing, w, h]) => {
    const ph = framing === 'phone'
    return cameraFrom({ name: `stop ${stop} ${framing} ${w}x${h}`, eye: p.pos, look: ph ? p.phone.look : p.look, vfov: fittedFov(ph ? p.phone.hfov : p.hfov, w, h), w, h, shift: ph ? p.phone.shift : p.shift })
  })
  const eyes = [new THREE.Vector3(...p.pos)]
  for (let t = ks[0].t; t <= ks[ks.length - 1].t + 1e-9; t += 0.1) eyes.push(new THREE.Vector3(...path.sample(t).pos))
  const gf = plan.frames.gate
  const bodies = buildBodies(built, tonesFrom(plan), sky, TSL.uniform(new THREE.Vector3(0, 1, 0)), canalLines(plan, F), { o: F.s(gf.origin[0], gf.origin[1]), a: F.dir(gf.bearing), c: F.dir(gf.bearing + 90), len: 50, half: 2.6 })
  const [ex, , ez] = p.pos
  const keep = (v) => { const cx = (v[0].x + v[1].x + v[2].x) / 3, cz = (v[0].z + v[1].z + v[2].z) / 3; return Math.hypot(cx - ex, cz - ez) <= reach }
  const faces = mapFaces([], bodies.group, built, new THREE.Matrix4(), keep)
  const surface = (b) => /^map:(street|ground|water-)/.test(b)
  return {
    page: 'map', stop: String(stop), frame: "the map's scene metres (x east, z south, y up)", faces, cameras, eyes, reach,
    ground: (x, z) => built.ground(x, z),
    counts: () => true,
    checks: (b) => !surface(b),
    floats: (b) => !surface(b) && b !== 'map:ramps',
    allowPair: [],
    allowThin: [],
    allowFloat: [],
  }
}

/** the gate page (stops 2 to 4): the gate's bodies as the page builds them, the map's within reach, both hero stills */
export async function mountGate(stop, { eyesFile = null } = {}) {
  const { buildGate, gateFrame } = await import(join(GATE, 'gate-geom.ts'))
  const { animalField } = await import(join(GATE, 'gate-relief.ts'))
  const { assemble, paved } = await import(join(GATE, 'gate-mesh.ts'))
  const { palmsGeometry, birdsGeometry } = await import(join(GATE, 'gate-life.ts'))
  const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
  const { buildBodies, tonesFrom } = await import(join(MAP, 'mass.ts'))
  const plan = json(join(GATE, 'gate-plan.json')), cams = json(join(GATE, 'gate-cams.json')), mapPlan = json(join(MAP, 'map-plan.json'))
  const B = buildGate(plan)
  const fields = { bull: animalField('bull'), dragon: animalField('dragon'), lion: animalField('lion') }
  const A = assemble(B, plan, fields)
  const C = plan.course
  const dropB = new Set(plan.frame.mapBlocksReplaced), dropW = new Set(plan.frame.mapWallsReplaced)
  const cityPlan = structuredClone(mapPlan)
  cityPlan.blocks = cityPlan.blocks.filter((b) => !dropB.has(b.id))
  cityPlan.walls = cityPlan.walls.filter((w) => !dropW.has(w.id))
  const city = buildPlan(cityPlan)
  const MF = makeFrame(mapPlan), GF = gateFrame(plan)
  const G2W = new THREE.Matrix4().fromArray(GF.toMap(MF.E0, MF.N0)), W2G = G2W.clone().invert()
  const faces = []
  { // the gate's walls, split at their body marks
    let m = 0
    facesFrom(faces, A.walls, null, (i) => { while (m + 1 < A.marks.length && A.marks[m + 1].from <= i) m++; return `gate:${A.marks[m].id}` })
  }
  for (const set of A.panels) { // each panel's base quad where its instance stands
    const L = fields[set.kind].L
    const quad = new THREE.PlaneGeometry(1, 1)
    quad.translate(0.5, 0.5, 0)
    const list = B.panels.filter((q) => q.kind === set.kind)
    for (let i = 0; i < set.count; i++) {
      const local = new THREE.Matrix4().makeScale(L + 0.04, 15 * C, 1).premultiply(new THREE.Matrix4().makeTranslation(-0.02, -C, 0))
      facesFrom(faces, quad, new THREE.Matrix4().fromArray(set.matrices, i * 16).multiply(local), () => `panel:${list[i].id}`)
    }
  }
  facesFrom(faces, A.paving, null, () => 'gate:paving')
  A.bronzes.forEach((b, i) => facesFrom(faces, b.geometry, null, () => `gate:bronze-${i}`))
  const one = palmsGeometry(plan.life.palms.slice(0, 1), B.level).getAttribute('position').count
  facesFrom(faces, palmsGeometry(plan.life.palms, B.level), null, (i) => `life:palm-${Math.floor(i / one)}`)
  const wing = birdsGeometry(plan.life.birds.slice(0, 1)).getAttribute('position').count
  facesFrom(faces, birdsGeometry(plan.life.birds), null, (i) => `life:bird-${Math.floor(i / wing)}`)
  const F2 = makeFrame(cityPlan)
  const bodies = buildBodies(city, tonesFrom(cityPlan), sky, TSL.uniform(new THREE.Vector3(0, 1, 0)), canalLines(cityPlan, F2))
  const REACH = { x: [-130, 130], z: [-170, 280] }
  const keep = (v) => v.some((p) => p.x >= REACH.x[0] && p.x <= REACH.x[1] && p.z >= REACH.z[0] && p.z <= REACH.z[1])
  mapFaces(faces, bodies.group, city, W2G, keep)
  const cameras = SIZES.map(([framing, w, h]) => {
    const v = cams.stills[framing]
    const y = B.level(v.at[1]) + cams.eye
    return cameraFrom({ name: `gate ${framing} ${w}x${h}`, eye: [v.at[0], y, v.at[1]], look: [v.look[0], v.look[1] ?? y, v.look[2]], vfov: fittedFov(v.hfov, w, h, v.authored), w, h, shift: v.shift })
  })
  const eyes = []
  if (eyesFile) for (const s of json(eyesFile).samples) eyes.push(new THREE.Vector3(s.x, s.y, s.z))
  if (eyes.length) for (const c of cameras) eyes.push(c.eye.clone())
  const FOOT_Y = Math.min(...B.boxes.map((b) => b.y0))
  const toG = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(G2W)
  const surface = (b) => /^map:(street|ground|water-)/.test(b)
  return {
    page: 'gate', stop: String(stop), frame: "the gate's frame (x west, z north out of the face, y up from the +15.40 street)", faces, cameras, eyes,
    ground: (x, z) => { const w = toG(x, 0, z); return new THREE.Vector3(w.x, city.ground(w.x, w.z), w.z).applyMatrix4(W2G).y },
    // two of the map's bodies are the map's to answer; only pairs touching the gate are this page's
    counts: (a, b) => !(a.startsWith('map:') && b.startsWith('map:')),
    checks: (b) => !b.startsWith('panel:') && !b.startsWith('map:'),
    floats: (b) => b.startsWith('gate:') || b.startsWith('life:palm'),
    // the map's street and ground are masked inside the gate's paved area on the page
    masked: (p, a, b) => (/^map:(street|ground)$/.test(a) || /^map:(street|ground)$/.test(b)) && paved(B, p.x, p.z, plan.lionWalls.to),
    allowPair: [{ test: (p) => p.facing < 0 && p.n[1] > 0.99 && p.y[1] <= FOOT_Y + 0.05, why: `the bodies' feet at ${FOOT_Y} m, looking down, under the street and the paving` }],
    allowFloat: [{ prefix: 'gate:skin:', why: "a facing skin laid on a wall's face over the door: held by the wall behind it, which the plan-view support rule cannot see" }],
    allowThin: [{ prefix: 'gate:bronze-', why: "the bronzes' outline band where the inflated halves close: a ridge of one closed body (measured 20 Oct, 0.08 to 0.15 px from the desktop still)" }],
  }
}

export const MOUNTS = { map: mountMap, gate: mountGate }
