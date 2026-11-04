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

const COURT = join(APP, 'src/wings/babylon/court'), TOWER = join(APP, 'src/wings/babylon/tower'), GARDENS = join(APP, 'src/wings/babylon/gardens'), NABU = join(APP, 'src/wings/babylon/nabu'), HOUSE = join(APP, 'src/wings/babylon/house')
const MAP = join(APP, 'src/wings/babylon/map'), GATE = join(APP, 'src/wings/babylon/gate'), OPEN = join(APP, 'src/wings/babylon/open')
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
  const t0 = ks[0].t, nxt = path.keys.find((k) => k.t > t0 && k.stop !== n && k.stop > n)
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
  const tower = buildTower(court.built, plan, json(join(TOWER, 'tower-plan.json')))
  // and stop 8's temple in place of the map's block
  const { buildNabu } = await import(join(NABU, 'nabu-geom.ts'))
  const nabu = buildNabu(tower.built, plan, json(join(NABU, 'nabu-plan.json')))
  // stop 7's houses likewise
  const { buildHouse, lanesBody } = await import(join(HOUSE, 'house-geom.ts'))
  const hp = json(join(HOUSE, 'house-plan.json'))
  const house = buildHouse(nabu.built, plan, hp)
  const houseBodies = [...house.bodies, lanesBody(house.lanes, hp.flat.level)]
  const built = house.built
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
  for (const b of [...court.bodies, ...houseBodies]) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  for (const b of tower.bodies) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  // stop 5's bodies whole (an edge terrace's top is a few long triangles whose middles lie past the reach), and each
  // plant whole where its foot lies within the reach
  for (const b of gardens.bodies) facesFrom(faces, b.geometry, null, () => `map:${b.id}`)
  for (const p of planting.plants) if (Math.hypot(p.x - ex, p.z - ez) <= reach) facesFrom(faces, p.geometry, null, () => `map:${p.id}`)
  for (const b of nabu.bodies) facesFrom(faces, b.geometry, null, () => `map:${b.id}`, keep)
  const surface = (b) => /^map:(street|ground|water-|gate5-street-|merkes-lanes$)/.test(b)
  return {
    court, tower, gardens, planting, nabu,
    house,
    houseBodies,
    page: 'map', stop: String(stop), frame: "the map's scene metres (x east, z south, y up)", faces, cameras, eyes, reach,
    ground: (x, z) => built.ground(x, z),
    track: (dt = 0.25) => pathTrack(path, n, dt, (q) => ({ kind: q.kind, desktop: view(q.pos, q.look, q.hfov, q.shift), phone: view(q.pos, q.phone.look, q.phone.hfov, q.phone.shift) })),
    counts: () => true,
    checks: (b) => !surface(b),
    floats: (b) => !surface(b) && b !== 'map:ramps',
    allowPair: [],
    // a curtain's sheet is foliage in faces of about 0.2 by 1 m, and at 300 to 400 m from stop 5's hold a few of them
    // fall under a device pixel wherever the planting's sequence puts them
    // the palm's mid preset (palm-date-babylon): a frond's leaflets drawn as teeth along its rib, their tips narrow
    allowThin: [
      { prefix: 'map:garden-palm-', why: "the mid preset's leaflet teeth, their tips 3 to 4 cm at 320 to 390 m (0.09 to 0.2 px, measured 4 Nov); a frond's fine edge, which the sub-frames average as foliage does" },
      { prefix: 'map:garden-caper-', why: "a curtain's sheet faces, about 0.2 m by 1 m at 315 to 390 m (0.5 to 1 px of the 1600 px desktop, measured 4 Nov); foliage at that range, as the clumps beside them" },
      { prefix: 'map:garden-vine-', why: "a curtain's sheet faces, about 0.2 m by 1 m at 315 to 390 m (0.5 to 1 px of the 1600 px desktop, measured 4 Nov); foliage at that range, as the clumps beside them" },
    ],
    // a curtain hangs on a terrace's face from its lip on the terrace's top: held by the face, which the plan-view
    // support rule cannot see (as the gate's facing skins)
    allowFloat: [{ prefix: 'map:garden-vine-', why: "a curtain hung on a terrace's face from its lip on the top: held by the face behind it" }, { prefix: 'map:garden-caper-', why: "a caper curtain hung on a terrace's face from its lip on the top: held by the face behind it" }],
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
  const FOOT_Y = Math.min(...B.boxes.map((b) => b.y0))
  const toG = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(G2W)
  const surface = (b) => /^map:(street|ground|water-)/.test(b)
  const gv = (p) => { const v = new THREE.Vector3(...p).applyMatrix4(W2G); return [v.x, v.y, v.z] }
  return {
    // the page's own walk (gate.ts: its keys through the map's easing); the film's phone is hfov 46 on 390x844, no shift
    track: (dt = 0.25) => pathTrack(gatePath(plan, cams, B, GF, MF), Number(stop), dt, (q) => ({ kind: q.kind, desktop: view(gv(q.pos), gv(q.look), q.hfov, 0, [16, 9]), phone: view(gv(q.pos), gv(q.look), 46, 0, [390, 844]) })),
    G2W, W2G, MF, GF, B, plan,
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
    // the map's street and ground are masked on the page under the north paving too
    masked: (p, a, b) => G.masked(p, a, b) || ((/^map:(street|ground)$/.test(a) || /^map:(street|ground)$/.test(b)) && (() => { const w = new THREE.Vector3(p.x, 0, p.z).applyMatrix4(G.G2W); return NP.inside(w.x, w.z) })()),
    frame: "the gate's frame (x west, z north out of the face, y up from the +15.40 street); the flight's cameras moved into it",
    track: (dt = 0.25) => { const out = []; for (let i = 0; i * dt <= flight.duration + 1e-9; i++) out.push({ t: +(i * dt).toFixed(3), ...at(i * dt) }); return out },
  }
}

export const MOUNTS = { map: mountMap, gate: mountGate, open: mountOpen }
