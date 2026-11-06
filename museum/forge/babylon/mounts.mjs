// WHAT EACH BABYLON PAGE BUILDS, MOUNTED IN NODE for the geometry check: named triangles, the stills' cameras at the
// kit's sizes, the eyes that decide what is seen, the ground under a body, and the page's own allowances.
// A new stop module adds a mount here: `mount<Page>(stop, opts)` returning
//   { frame, faces, cameras, eyes, ground(x, z), counts(a, b), checks(body), floats(body), masked?, allowPair, allowThin, allowFloat,
//     track(dt) }   track: the stop's moving camera every dt seconds, both framings, in the mount's frame (the coverage map)
// Run under `node --experimental-strip-types` (the pages' modules are TypeScript).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three/webgpu'
import * as TSL from 'three/tsl'
import { APP } from './pages.mjs'
import { cameraFrom, facesFrom, fittedFov } from './geometry.mjs'

const COURT = join(APP, 'src/wings/babylon/court'), TOWER = join(APP, 'src/wings/babylon/tower'), GARDENS = join(APP, 'src/wings/babylon/gardens'), NABU = join(APP, 'src/wings/babylon/nabu'), HOUSE = join(APP, 'src/wings/babylon/house'), ESAGILA = join(APP, 'src/wings/babylon/esagila'), BRIDGE = join(APP, 'src/wings/babylon/bridge')
const TOP = join(APP, 'src/wings/babylon/top'), MAP = join(APP, 'src/wings/babylon/map'), GATE = join(APP, 'src/wings/babylon/gate'), OPEN = join(APP, 'src/wings/babylon/open')
const json = (p) => JSON.parse(readFileSync(p, 'utf8'))
/** the kit's still sizes, device pixels: both framings at the shooter's defaults, and the smaller desktop */
export const SIZES = [['desktop', 3200, 1800], ['desktop', 1600, 900], ['phone', 1170, 2532], ['phone', 1080, 1920]]
const sky = { colour: () => TSL.vec3(0.5) }

function canalLines(plan, F) {
  const cz = F.s(plan.canal.line[0][0], plan.canal.line[0][1])[1]
  return [-2.4, -plan.canal.w / 2, plan.canal.w / 2, 2.4].map((d) => Math.round((cz + d) * 100) / 100)
}

/** one track sample: a view per framing; a view is { eye, look, hfov, shift, authored } as the page aims it */
const view = (eye, look, hfov, shift = 0, authored = null) => ({ eye: [...eye], look: [...look], hfov, shift, authored })
/** a page's path from its first key of a stop to the next stop's first key, every dt seconds (the end included) */
function pathTrack(path, n, dt, pick) {
  const ks = path.keys.filter((k) => k.stop === n)
  // the next stop is the next to start in time: a stop's number is not its place in the walk
  const startOf = (m) => path.keys.find((k) => k.stop === m).t
  const t0 = ks[0].t, nxt = path.keys.find((k) => k.t > t0 && k.stop !== n && startOf(k.stop) > t0)
  const t1 = nxt ? nxt.t : ks[ks.length - 1].t
  const out = []
  for (let i = 0; t0 + i * dt <= t1 + 1e-9; i++) { const t = t0 + i * dt; out.push({ t: +t.toFixed(3), ...pick(path.sample(t)) }) }
  return out
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
    } else if (o.name === 'houses' && o.geometry.getAttribute('hdoor')) {
      // the map's houses drawn as trays (mass.ts trayHouses): one body a house, by its `hinfo` house number
      const hi = o.geometry.getAttribute('hinfo')
      facesFrom(faces, o.geometry, M, (i) => `map:house#${hi.getX(i)}`, keep)
    } else if (o.name === 'blocks') {
      const pid = o.geometry.getAttribute('pid')
      facesFrom(faces, o.geometry, M, (i) => { const p = pid.getX(i); return p < 0 ? 'map:ramps' : `map:${built.prisms[p].id}` }, keep)
    } else facesFrom(faces, o.geometry, M, () => `map:${o.name}`, keep)
  })
  return faces
}

/** the map page at one stop: the bodies within `reach` metres of the stop's eye, its still cameras at the kit's sizes;
    `tower` (or BABYLON_TOWER) the tower switch's state, as `?tower=` on the page */
export async function mountMap(stop, { reach = 400, tower: towerState = process.env.BABYLON_TOWER || 'built' } = {}) {
  if (!['built', 'dug', 'bruegel', 'bruegel-show'].includes(towerState)) throw new Error(`no tower state ${towerState}`)
  const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
  const { buildBodies, tonesFrom } = await import(join(MAP, 'mass.ts'))
  const { makePath } = await import(join(MAP, 'path.ts'))
  const { buildCourt } = await import(join(COURT, 'court-geom.ts'))
  const { buildTower } = await import(join(TOWER, 'tower-geom.ts'))
  const { buildGardens } = await import(join(GARDENS, 'gardens-geom.ts'))
  const { buildPlanting } = await import(join(GARDENS, 'gardens-plants.ts'))
  // the garden's palms as the map page builds them (map.ts takes PALM_MID)
  const { palmGeometry, PALM_MID } = await import(join(GATE, 'gate-life.ts'))
  const plan = json(join(MAP, 'map-plan.json')), cams = json(join(MAP, 'map-cams.json')), gp = json(join(GARDENS, 'gardens-plan.json'))
  // stop 5's candidates and stop 6's court draw their own bodies in place of the map's prisms they replace, as map.ts does
  const gardens = buildGardens(buildPlan(plan), plan, gp)
  const planting = buildPlanting(gardens.F, gp, palmGeometry, PALM_MID)
  const court = buildCourt(gardens.built, plan, json(join(COURT, 'court-plan.json')))
  // stop 9's precinct, street and tower draw their own bodies too, as map.ts does
  const tp = json(join(TOWER, 'tower-plan.json'))
  const tower = buildTower(court.built, plan, tp)
  // the switch: the tower's own bodies only as built; dug, the ruin's patch in the map ground's place
  const { buildDug, towerFrame } = await import(join(TOWER, 'tower-dug.ts'))
  const dug = towerState === 'dug' ? buildDug(court.built, tp) : null
  const towerAxis = towerFrame(court.built.boxes.find((b) => b.id === 'tower-stage-1'))
  const towerBodies = tower.bodies.filter((b) => towerState === 'built' || !b.id.startsWith('tower-'))
  // and stop 8's temple in place of the map's block
  const { buildNabu } = await import(join(NABU, 'nabu-geom.ts'))
  const nabu = buildNabu(tower.built, plan, json(join(NABU, 'nabu-plan.json')))
  // stop 7's houses likewise
  const { buildHouse, lanesBody } = await import(join(HOUSE, 'house-geom.ts'))
  const hp = json(join(HOUSE, 'house-plan.json'))
  const house = buildHouse(nabu.built, plan, hp)
  const houseBodies = [...house.bodies, lanesBody(house.lanes, hp.flat.level)]
  // stop 9's Esagila, its ground, the wall before Gate 8 and the street round the precinct's corner
  const { buildEsagila } = await import(join(ESAGILA, 'esagila-geom.ts'))
  const esagila = buildEsagila(house.built, plan, json(join(ESAGILA, 'esagila-plan.json')))
  // stop 12's bridge, its quay and the west bank's plants (the old stop 13)
  const { buildBridge } = await import(join(BRIDGE, 'bridge-geom.ts'))
  const { plantShape, plantMatrix } = await import(join(BRIDGE, 'bridge-green.ts'))
  const bridge = buildBridge(esagila.built, plan, json(join(BRIDGE, 'bridge-plan.json')))
  // the Ishtar Gate's own build (its two gates and the court) in place of the map's massings, as map.ts mounts it
  // (gate-on-map.ts), at the gate's frame in the map's scene
  const { buildGate, gateFrame, gateOwnParts, isGateMassing } = await import(join(GATE, 'gate-geom.ts'))
  const { animalField } = await import(join(GATE, 'gate-relief.ts'))
  const { assemble } = await import(join(GATE, 'gate-mesh.ts'))
  const gatePlan = json(join(GATE, 'gate-plan.json'))
  const gateB = gateOwnParts(buildGate(gatePlan))
  const gateFields = { bull: animalField('bull'), dragon: animalField('dragon'), lion: animalField('lion') }
  const gateA = assemble(gateB, gatePlan, gateFields)
  const built = { ...bridge.built, prisms: bridge.built.prisms.filter((q) => !isGateMassing(q.id)) }
  // stop 15's plants (the plain round the walls), as map.ts mounts them at the chain's end
  const { topPlants } = await import(join(TOP, 'top-plants.ts'))
  const { buildPlain } = await import(join(OPEN, 'plain.ts'))
  const top = topPlants(plan, json(join(TOP, 'top-plan.json')), { buildPlain })
  // the switch's third state at the end of the chain, as map.ts mounts it
  const { buildBruegel } = await import(join(APP, 'src/wings/babylon/bruegel/bruegel-geom.ts'))
  const bruegel = towerState === 'bruegel' ? buildBruegel(towerAxis, built.ground, json(join(APP, 'src/wings/babylon/bruegel/bruegel-plan.json'))) : null
  // and its fourth, the showpiece
  const { buildShow } = await import(join(APP, 'src/wings/babylon/bruegel-show/show-geom.ts'))
  const bruegelShow = towerState === 'bruegel-show' ? buildShow(towerAxis, built.ground, json(join(APP, 'src/wings/babylon/bruegel-show/show-plan.json'))) : null
  const F = makeFrame(plan)
  const stand = (x, z) => built.stand(x, z)
  // the showpiece walks its own vantage beat too (show-path.ts); every other state the shared path
  const { keysFor, vantageTime } = await import(join(APP, 'src/wings/babylon/bruegel-show/show-path.ts'))
  const path = makePath(towerState === 'bruegel-show' ? { ...cams, path: keysFor(cams, towerState) } : cams, F.s, stand)
  const n = Number(stop)
  const ks = path.keys.filter((k) => k.stop === n)
  if (!ks.length) throw new Error(`the map has no keys for stop ${stop}`)
  // the still's second as the page takes it (map.ts stillTime)
  const k = ks.find((x) => x.still) ?? ks[ks.length - 1]
  const time = (k.cut ? Math.ceil(k.t * 8) : Math.floor(k.t * 8 + 1e-6)) / 8
  const p = path.sample(time)
  const cameras = SIZES.map(([framing, w, h]) => {
    const ph = framing === 'phone'
    return cameraFrom({ name: `stop ${stop} ${framing} ${w}x${h}`, eye: ph ? p.phone.pos : p.pos, look: ph ? p.phone.look : p.look, vfov: fittedFov(ph ? p.phone.hfov : p.hfov, w, h), w, h, shift: ph ? p.phone.shift : p.shift })
  })
  // and its vantage's cameras checked beside the hold's
  const tv = towerState === 'bruegel-show' && n === 12 ? vantageTime(cams, towerState) : null
  if (tv !== null) {
    const pv = path.sample(tv + 1)
    for (const [framing, w, h] of SIZES) {
      const ph = framing === 'phone'
      cameras.push(cameraFrom({ name: `stop ${stop} vantage ${framing} ${w}x${h}`, eye: ph ? pv.phone.pos : pv.pos, look: ph ? pv.phone.look : pv.look, vfov: fittedFov(ph ? pv.phone.hfov : pv.hfov, w, h), w, h, shift: ph ? pv.phone.shift : pv.shift }))
    }
  }
  // the phone's own stand, where a key gives one, is an eye too
  const eyes = [new THREE.Vector3(...p.pos)]
  if (p.phone.pos !== p.pos) eyes.push(new THREE.Vector3(...p.phone.pos))
  for (let t = ks[0].t; t <= ks[ks.length - 1].t + 1e-9; t += 0.1) {
    const q = path.sample(t)
    eyes.push(new THREE.Vector3(...q.pos))
    if (q.phone.pos !== q.pos) eyes.push(new THREE.Vector3(...q.phone.pos))
  }
  const gf = plan.frames.gate
  // the generic houses rebuilt as the page rebuilds them (map.ts: the arrival's houses.ts)
  const { rebuildHouses } = await import(join(OPEN, 'houses.ts'))
  const bodies = buildBodies(built, tonesFrom(plan), sky, TSL.uniform(new THREE.Vector3(0, 1, 0)), canalLines(plan, F), { o: F.s(gf.origin[0], gf.origin[1]), a: F.dir(gf.bearing), c: F.dir(gf.bearing + 90), len: 50, half: 2.6 }, { houses: { rebuild: rebuildHouses, band: Number(plan.classes.band) } })
  const [ex, , ez] = p.pos
  const keep = (v) => { const cx = (v[0].x + v[1].x + v[2].x) / 3, cz = (v[0].z + v[1].z + v[2].z) / 3; return Math.hypot(cx - ex, cz - ez) <= reach }
  if (dug) {
    // the page sinks the map ground's vertices strictly inside the patch's cell
    const R = dug.region, g = bodies.group.getObjectByName('ground'), gp = g.geometry.getAttribute('position')
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i)
      if (x > R.x0 + 1e-3 && x < R.x1 - 1e-3 && z > R.z0 + 1e-3 && z < R.z1 - 1e-3) gp.setY(i, gp.getY(i) - 40)
    }
  }
  const faces = mapFaces([], bodies.group, built, new THREE.Matrix4(), keep)
  { // the gate's walls split at their body marks and each panel's base quad, as mountGate names them, in the map's scene
    const MF = makeFrame(plan), G2W = new THREE.Matrix4().fromArray(gateFrame(gatePlan).toMap(MF.E0, MF.N0))
    let m = 0
    facesFrom(faces, gateA.walls, G2W, (i) => { while (m + 1 < gateA.marks.length && gateA.marks[m + 1].from <= i) m++; return `gate:${gateA.marks[m].id}` }, keep)
    const C = gatePlan.course
    for (const set of gateA.panels) {
      const L = gateFields[set.kind].L
      const quad = new THREE.PlaneGeometry(1, 1)
      quad.translate(0.5, 0.5, 0)
      const list = gateB.panels.filter((q) => q.kind === set.kind)
      for (let i = 0; i < set.count; i++) {
        const local = new THREE.Matrix4().makeScale(L + 0.04, 15 * C, 1).premultiply(new THREE.Matrix4().makeTranslation(-0.02, -C, 0))
        facesFrom(faces, quad, G2W.clone().multiply(new THREE.Matrix4().fromArray(set.matrices, i * 16)).multiply(local), () => `panel:${list[i].id}`, keep)
      }
    }
  }
  for (const b of [...court.bodies, ...houseBodies]) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  for (const b of towerBodies) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  for (const b of dug?.bodies ?? []) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  for (const b of bruegel?.bodies ?? []) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  for (const b of bruegelShow?.bodies ?? []) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  // stop 5's bodies whole (an edge terrace's top is a few long triangles whose middles lie past the reach), and each
  // plant whole where its foot lies within the reach
  for (const b of gardens.bodies) facesFrom(faces, b.geometry, null, () => `map:${b.id}`)
  for (const p of planting.plants) if (Math.hypot(p.x - ex, p.z - ez) <= reach) facesFrom(faces, p.geometry, null, () => `map:${p.id}`)
  for (const b of nabu.bodies) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  for (const b of esagila.bodies) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  for (const b of bridge.bodies) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  // the river's water as the page draws it: the map's outline at its level, under the bridge's own name for it
  const river = esagila.built.water.find((w) => w.id === 'euphrates')
  if (river) {
    const sh = new THREE.Shape()
    sh.moveTo(river.poly[0][0], -river.poly[0][1])
    for (const [x, z] of river.poly.slice(1)) sh.lineTo(x, -z)
    sh.closePath()
    const g = new THREE.ShapeGeometry(sh)
    g.rotateX(-Math.PI / 2)
    g.translate(0, river.level, 0)
    facesFrom(faces, g, null, () => 'map:water-euphrates', keep)
  }
  // the bank's plants whole where the foot lies within the reach, each kind's two shapes in turn as the page instances them
  const shapes = new Map()
  const nth = new Map()
  for (const q of bridge.plants) {
    const i = nth.get(q.kind) ?? 0
    nth.set(q.kind, i + 1)
    if (Math.hypot(q.x - ex, q.z - ez) > reach) continue
    const key = `${q.kind}-${i % 2}`
    if (!shapes.has(key)) shapes.set(key, plantShape(q.kind, i % 2, palmGeometry))
    facesFrom(faces, shapes.get(key).clone().applyMatrix4(plantMatrix(q)), null, () => `map:${q.id}`)
  }
  // stop 15's palms whole where the foot lies within the reach (at most 1.2 km: the plain holds some 21,000, and past that a
  // far palm is a few pixels of a grove's mass), each at its preset (open/green.ts palmMesh), and on a whole-page mount
  // (the switch's) each row's first palm wherever it stands, so every row is named; the bank trees grow from a canvas atlas on the page only, none in the city
  const { PALM_FAR } = await import(join(GATE, 'gate-life.ts'))
  const presets = { far: palmGeometry(12, PALM_FAR), mid: palmGeometry(12, PALM_MID) }
  const nthTop = new Map()
  for (const q of top.all) {
    const i = nthTop.get(q.row) ?? 0
    nthTop.set(q.row, i + 1)
    if (['reed', 'tamarisk', 'poplar', 'willow'].includes(q.row) || q.detail === 'near' || ((i > 0 || reach <= 1200) && Math.hypot(q.x - ex, q.z - ez) > Math.min(reach, 1200))) continue
    const m = new THREE.Matrix4().compose(new THREE.Vector3(q.x, built.ground(q.x, q.z), q.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(q.yaw), 0, Math.sin(q.yaw)).normalize(), q.lean), new THREE.Vector3(q.s, q.s, q.s))
    facesFrom(faces, presets[q.detail ?? 'far'].clone().applyMatrix4(m), null, () => `map:top-palm-${q.row}-${i}`)
  }
  const surface = (b) => /^map:(street|ground|water-|gate5-street-|merkes-lanes$|esagila-street-|esagila-ground-|ruin-trench$|ruin-water$)/.test(b)
  return {
    court, tower, gardens, planting, nabu,
    house, esagila, bridge, top, towerState, dug, bruegel, bruegelShow,
    houseBodies,
    page: 'map', stop: String(stop), frame: "the map's scene metres (x east, z south, y up)", faces, cameras, eyes, reach,
    cut: `the bodies within ${reach} m of the stop's eye in plan (faces by their centres; stop 5's bodies whole, plants by their foot)`,
    ground: (x, z) => built.ground(x, z),
    track: (dt = 0.25) => pathTrack(path, n, dt, (q) => ({ kind: q.kind, desktop: view(q.pos, q.look, q.hfov, q.shift), phone: view(q.phone.pos, q.phone.look, q.phone.hfov, q.phone.shift) })),
    path,
    counts: () => true,
    // the gate's relief panels are checked on the gate page (their base quads lie on the glazed skins by design)
    checks: (b) => !surface(b) && !b.startsWith('panel:'),
    floats: (b) => !surface(b) && b !== 'map:ramps' && !b.startsWith('panel:'),
    allowPair: [],
    // a curtain's sheet is foliage in faces of about 0.2 by 1 m, and at 300 to 400 m from stop 5's hold a few of them
    // fall under a device pixel wherever the planting's sequence puts them
    // the palm's mid preset (palm-date-babylon): a frond's leaflets drawn as teeth along its rib, their tips narrow
    allowThin: [
      { prefix: 'map:garden-palm-', why: "the mid preset's leaflet teeth, their tips 3 to 4 cm at 320 to 390 m (0.09 to 0.2 px, measured 4 Nov); a frond's fine edge, which the sub-frames average as foliage does" },
      { prefix: 'map:garden-caper-', why: "a curtain's sheet faces, about 0.2 m by 1 m at 315 to 390 m (0.5 to 1 px of the 1600 px desktop, measured 4 Nov); foliage at that range, as the clumps beside them" },
      { prefix: 'map:garden-vine-', why: "a curtain's sheet faces, about 0.2 m by 1 m at 315 to 390 m (0.5 to 1 px of the 1600 px desktop, measured 4 Nov); foliage at that range, as the clumps beside them" },
      { prefix: 'map:bridge-palm-', why: "the same reused gate palm on the west bank, its frond tips at 100 to 400 m from the bridge's hold; a far preset of palm-date-babylon is open" },
      // the west bank seen from stops 11, 12 and 14 (measured 5 Nov at the landing); a far preset for the bank trees is open
      { prefix: 'map:bridge-poplar-', why: "the bank poplars' trunks and limbs, 0.11 to 0.16 m at 220 to 405 m (0.22 to 0.81 px)" },
      { prefix: 'map:bridge-willow-', why: "the bank willows' trunks and limbs, 0.17 to 0.44 m at 220 to 370 m (0.26 to 0.95 px)" },
      { prefix: 'map:bridge-tamarisk-', why: "the bank tamarisks' stems, 0.19 to 0.32 m at 225 to 365 m (0.28 to 0.99 px)" },
    ],
    // a curtain hangs on a terrace's face from its lip on the terrace's top: held by the face, which the plan-view
    // support rule cannot see (as the gate's facing skins)
    allowFloat: [{ prefix: 'gate:skin:', why: "a facing skin laid on a wall's face over the door: held by the wall behind it, which the plan-view support rule cannot see (as on the gate page)" }, { prefix: 'map:garden-vine-', why: "a curtain hung on a terrace's face from its lip on the top: held by the face behind it" }, { prefix: 'map:garden-caper-', why: "a caper curtain hung on a terrace's face from its lip on the top: held by the face behind it" }],
  }
}

/** the gate page (stops 2 to 4): the gate's bodies as the page builds them, the map's within reach, both hero stills */
export async function mountGate(stop, { eyesFile = null, cityReach = 'near', cityEdit = null } = {}) {
  const { buildGate, gateFrame } = await import(join(GATE, 'gate-geom.ts'))
  const { animalField } = await import(join(GATE, 'gate-relief.ts'))
  const { assemble, paved } = await import(join(GATE, 'gate-mesh.ts'))
  const { palmsGeometry, birdsGeometry } = await import(join(GATE, 'gate-life.ts'))
  const { buildPlan, makeFrame } = await import(join(MAP, 'plan.ts'))
  const { buildBodies, tonesFrom } = await import(join(MAP, 'mass.ts'))
  const plan = json(join(GATE, 'gate-plan.json')), cams = json(join(GATE, 'gate-cams.json')), mapPlan = json(join(MAP, 'map-plan.json'))
  const cityAll = cityReach === 'all'
  const B = buildGate(plan)
  const fields = { bull: animalField('bull'), dragon: animalField('dragon'), lion: animalField('lion') }
  const A = assemble(B, plan, fields)
  const C = plan.course
  const dropB = new Set(plan.frame.mapBlocksReplaced), dropW = new Set(plan.frame.mapWallsReplaced)
  const cityPlan = structuredClone(mapPlan)
  cityPlan.blocks = cityPlan.blocks.filter((b) => !dropB.has(b.id))
  cityPlan.walls = cityPlan.walls.filter((w) => !dropW.has(w.id))
  if (cityEdit) cityEdit(cityPlan)
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
  // cityReach 'all': every body the page builds (the coverage map sees the far city); 'near': the geometry check's box
  const keep = cityAll ? null : (v) => v.some((p) => p.x >= REACH.x[0] && p.x <= REACH.x[1] && p.z >= REACH.z[0] && p.z <= REACH.z[1])
  mapFaces(faces, bodies.group, city, W2G, keep)
  const cameras = SIZES.map(([framing, w, h]) => {
    const v = cams.stills[framing]
    const y = B.level(v.at[1]) + cams.eye
    return cameraFrom({ name: `gate ${framing} ${w}x${h}`, eye: [v.at[0], y, v.at[1]], look: [v.look[0], v.look[1] ?? y, v.look[2]], vfov: fittedFov(v.hfov, w, h, v.authored), w, h, shift: v.shift })
  })
  const eyes = []
  if (eyesFile) for (const s of json(eyesFile).samples) eyes.push(new THREE.Vector3(s.x, s.y, s.z))
  if (eyes.length) for (const c of cameras) eyes.push(c.eye.clone())
  // the paved bodies' foot: the city walls run out past the paving where the ground falls, so their deeper foot must
  // not lower the allowance for every other body
  const FOOT_Y = Math.min(...B.boxes.filter((b) => b.part !== 'city walls').map((b) => b.y0))
  const toG = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(G2W)
  const surface = (b) => /^map:(street|ground|water-)/.test(b)
  const gv = (p) => { const v = new THREE.Vector3(...p).applyMatrix4(W2G); return [v.x, v.y, v.z] }
  return {
    // the page's own walk (gate.ts: its keys through the map's easing); the film's phone is hfov 46 on 390x844, no shift
    track: (dt = 0.25) => pathTrack(gatePath(plan, cams, B, GF, MF), Number(stop), dt, (q) => ({ kind: q.kind, desktop: view(gv(q.pos), gv(q.look), q.hfov, 0, [16, 9]), phone: view(gv(q.pos), gv(q.look), 46, 0, [390, 844]) })),
    G2W, W2G, MF, GF, B, plan,
    page: 'gate', stop: String(stop), frame: "the gate's frame (x west, z north out of the face, y up from the +15.40 street)", faces, cameras, eyes,
    cut: cityAll ? "the gate's bodies and every body of the city" : `the gate's bodies and the map's with a corner inside x ${REACH.x.join('..')}, z ${REACH.z.join('..')} m of the gate's frame`,
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

/** the gate page's walk as gate.ts builds it: the gate's keys in UTM and German levels through the map's easing */
async function gatePathAsync() { return import(join(MAP, 'path.ts')) }
const { makePath } = await gatePathAsync()
function gatePath(plan, cams, B, GF, MF) {
  const L0 = plan.frame.level0
  const south = GF.fromUtm(445831, 3600652)
  const keyAt = (at) => (typeof at === 'string' && at.startsWith('street:') ? [Number(at.slice(7)) * B.street.dir[0], Number(at.slice(7)) * B.street.dir[1]] : at)
  const pathCams = {
    eye: cams.eye,
    lens: { desktop: cams.stills.desktop.hfov },
    stops: cams.stops.map((s) => ({ n: s.n, hour: s.hour[0] })),
    path: cams.stops.flatMap((s) => s.keys.map((k, i) => {
      const [x, z] = keyAt(k.at)
      const [E, N] = GF.utm(x, z)
      const eyeY = B.level(z) + cams.eye
      const look = k.look === 'gate' ? [0, eyeY, -20] : k.look === 'south' ? [south[0], 1.65, south[1]] : [k.look[0], k.look[1], k.look[2]]
      const [lE, lN] = GF.utm(look[0], look[2])
      return { t: k.t + (i === 0 ? 1e-4 : 0), at: [E, N], y: 'eye', look: [lE, lN, look[1] + L0], stop: s.n, hold: k.kind === 'hold' || i === 0, kind: k.kind, cut: false }
    })),
  }
  const standMap = (x, z) => { const [, gz] = GF.fromUtm(x + MF.E0, MF.N0 - z); return B.level(gz) + L0 }
  return makePath(pathCams, MF.s, standMap)
}

/** the arrival: the opening page (the gate page's bodies and the whole city) under its flight's cameras (open.ts) */
export async function mountOpen(stop = '1', opts = {}) {
  const { makeFlight, resolveFlight } = await import(join(OPEN, 'flight.ts'))
  const { northEntry } = await import(join(OPEN, 'north.ts'))
  const { northMeshes } = await import(join(OPEN, 'north-mesh.ts'))
  const { rebuildHouses } = await import(join(OPEN, 'houses.ts'))
  const { buildPlan } = await import(join(MAP, 'plan.ts'))
  // as open.ts: the north entry replaces the map's North Gate, dam walls and north wall, trims the North Fortification
  // and opens the North Palace's two courts; the houses are rebuilt per lot
  let NORTH = null, edited = null, NP = null
  const { westOutwork } = await import(join(OPEN, 'outwork.ts'))
  const { editCity } = await import(join(OPEN, 'city.ts'))
  const cityEdit = (cp) => {
    NORTH = editCity(cp, { buildPlan, northEntry, westOutwork }).north
    edited = cp
  }
  const G = await mountGate('2', { ...opts, cityReach: 'all', cityEdit })
  // the page's letters for its own bodies (the evidence switch), and the bodies drawn without faces here: the palms by
  // row (groves Known as a mass, the rest Guessed, as green.ts), the banks' reed and trees (Guessed) and the plain's
  // fields and canals (ours, Guessed)
  const openLetters = new Map()
  const extraBodies = [['open:palm-canal', ['R', 'R']], ['open:palm-river', ['R', 'R']], ['open:palm-city', ['G', 'G']], ['open:palm-outer', ['G', 'G']], ['open:reed', ['G', 'G']], ['open:bank-tamarisk', ['G', 'G']], ['open:bank-poplar', ['G', 'G']], ['open:bank-willow', ['G', 'G']], ['open:field', ['G', 'G']], ['open:canal', ['G', 'G']], ['open:garden', ['G', 'G']]]
  for (const [n, L] of extraBodies) openLetters.set(n, L)
  {
    const city = buildPlan(edited)
    const W2G0 = G.W2G
    { let k = 0; for (const f of G.faces) if (!f.body.startsWith('map:house')) G.faces[k++] = f; G.faces.length = k }
    for (const b of [...NORTH.prisms, ...NORTH.arched]) openLetters.set(`open:${b.id}`, [b.plan, b.height])
    // the street's paving north of the North Gate's south door (north-paving.ts), laid by the gate's paving material
    const { NORTH_PAVED, northPaving } = await import(join(OPEN, 'north-paving.ts'))
    NP = northPaving({ frame: NORTH.frame, ...NORTH_PAVED, level: (x, z) => city.streetAt(x, z).level })
    const pc = json(join(GATE, 'gate-plan.json')).street.paving.cls
    openLetters.set('open:paving-north', [pc, pc])
    facesFrom(G.faces, NP.geometry, W2G0.clone().multiply(NP.matrix), () => 'open:paving-north')
    const housePlan = json(join(MAP, 'map-plan.json')).houses.plan
    const N = northMeshes(NORTH)
    const nid = N.geometry.getAttribute('nid')
    facesFrom(G.faces, N.geometry, W2G0, (i) => `open:${N.bodies[nid.getX(i)]}`)
    const box = new THREE.BoxGeometry(1, 1, 1)
    const CL = ['M', 'R', 'G']
    N.merlons.matrices.forEach((m, k) => {
      openLetters.set(`open:merlon-${N.merlons.names[k]}`, [CL[N.merlons.cls[k * 2 + 1]], CL[N.merlons.cls[k * 2]]])
      facesFrom(G.faces, box, W2G0.clone().multiply(m), () => `open:merlon-${N.merlons.names[k]}`)
    })
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
    for (const h of rebuildHouses(city.boxes.filter((b) => b.group === 'house'), city.ground).boxes) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(h.x, (h.y0 + h.y1) / 2, h.z), q.setFromAxisAngle(up, h.yaw), new THREE.Vector3(h.sx, h.y1 - h.y0, h.sz))
      openLetters.set(`open:${h.id}`, [housePlan, 'G'])
      facesFrom(G.faces, box, W2G0.clone().multiply(m), () => `open:${h.id}`)
    }
  }
  const cams = json(join(OPEN, 'open-cams.json')), gateCams = json(join(GATE, 'gate-cams.json'))
  const { B, GF, MF, W2G, plan } = G
  const L0 = plan.frame.level0
  const g2s = (x, z) => { const [E, N] = GF.utm(x, z); return MF.s(E, N) }
  const streetAt = (s, t = 0) => {
    const x = s * B.street.dir[0] + t * B.street.dir[1], z = s * B.street.dir[1] - t * B.street.dir[0]
    const [sx, sz] = g2s(x, z)
    return { x: sx, z: sz, level: B.level(z) + L0 }
  }
  const sFirst = Number(String(gateCams.stops[0].keys[0].at).slice(7))
  const sLand = Number(cams.land?.street ?? sFirst), tLand = Number(cams.land?.across ?? 0)
  const endEye = streetAt(sLand, tLand).level - L0 + cams.eye
  const [wlx, wlz] = g2s(0, -20)
  const flight = makeFlight(resolveFlight(cams.flight, { scene: MF.s, street: streetAt, eye: cams.eye, walkLook: [wlx, endEye + L0, wlz] }))
  const gv = (p) => { const v = new THREE.Vector3(...p).applyMatrix4(W2G); return [v.x, v.y, v.z] }
  const at = (t) => { const p = flight.sample(t); return { kind: 'fly', desktop: view(gv(p.pos), gv(p.look), p.hfov, p.shift), phone: view(gv(p.pos), gv(p.phoneLook), p.phoneHfov, p.phoneShift) } }
  const first = at(0)
  const cameras = SIZES.map(([framing, w, h]) => {
    const v = first[framing]
    return cameraFrom({ name: `open first ${framing} ${w}x${h}`, eye: v.eye, look: v.look, vfov: fittedFov(v.hfov, w, h), w, h, shift: v.shift })
  })
  return {
    ...G, page: 'open', stop: String(stop), cameras, openLetters, extraBodies,
    cut: "the gate page's bodies, the north entry, the houses rebuilt per lot and every body of the city",
    // the first frame's eyes decide what its stills see (a fight they all stand behind is culled from them)
    eyes: [...G.eyes, ...cameras.map((c) => c.eye.clone())],
    // the map's street and ground are masked on the page under the north paving too
    masked: (p, a, b) => G.masked(p, a, b) || ((/^map:(street|ground)$/.test(a) || /^map:(street|ground)$/.test(b)) && (() => { const w = new THREE.Vector3(p.x, 0, p.z).applyMatrix4(G.G2W); return NP.inside(w.x, w.z) })()),
    frame: "the gate's frame (x west, z north out of the face, y up from the +15.40 street); the flight's cameras moved into it",
    track: (dt = 0.25) => { const out = []; for (let i = 0; i * dt <= flight.duration + 1e-9; i++) out.push({ t: +(i * dt).toFixed(3), ...at(i * dt) }); return out },
    // the flight's still cameras every `dt` seconds after the first frame, the landing always among them, at the
    // stills' four sizes (the geometry check's bound)
    flightCameras: (dt) => {
      const ts = []
      for (let i = 1; i * dt < flight.duration - 1e-6; i++) ts.push(+(i * dt).toFixed(3))
      ts.push(flight.duration)
      return ts.flatMap((t) => {
        const s = at(t)
        return SIZES.map(([framing, w, h]) => { const v = s[framing]; return { t, ...cameraFrom({ name: `open flight ${t} s ${framing} ${w}x${h}`, eye: v.eye, look: v.look, vfov: fittedFov(v.hfov, w, h), w, h, shift: v.shift }) } })
      })
    },
  }
}

export const MOUNTS = { map: mountMap, gate: mountGate, open: mountOpen }
