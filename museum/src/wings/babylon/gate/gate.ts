/* THE ISHTAR GATE AT LEVEL 1 (`/src/wings/babylon/gate/gate.html`): the double
   gate, its forecourt and the lion street's last stretch built in code at
   their measured places, set into the map's grey city about 570 BC. Dev only;
   the rig `window.__gate` takes the stills, the sketch and the facts.

     ?state=grey|flat|full   massing grey, the first pass (flat glaze, plain animals, noon sun), or full (default)
     ?switch=classes         the evidence switch: each body's record classes on the same scene (record.ts)
     ?put=<url>              where the rig hands its files (the shooter's own server) */

import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix3, Matrix4, Mesh,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, PerspectiveCamera, Scene, Vector3,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import { createStack } from '../../../stack'
import { IDENTITY } from '../../../stack/grade'
import { accumulate, toPNG } from '../../animals/cave/render'
import { printFrame } from '../../animals/cave/print'
import { PERSON_FORMS, signPerson } from '../../place/person'
import { buildPlan, makeFrame } from '../map/plan'
import { buildBodies, tonesFrom, uView, type Sky } from '../map/mass'
import { paintCity, setCityPixel } from '../map/city'
import { rebuildHouses } from '../open/houses'
import { NORTH_PAVED } from '../open/north-paving'
import { sunVector as mapSunVector } from '../map/sun'
import { createOpenLinear } from '../open/air'
import { walkLight } from '../open/light'
import { makePath, type PathSample, type V3 as MV3 } from '../map/path'
import { buildGate, gateFrame, hourOf, type V3 } from './gate-geom'
import { animalField } from './gate-relief'
import { assemble, panelGrid } from './gate-mesh'
import { birdsGeometry, palmsGeometry } from './gate-life'
import { bakePanel, lifeMaterial, makeUniforms, panelMaterial, pavingMaterial, wallMaterial, C as COURSE, type Rooms } from './gate-mat'
import { isLetter, recordNamer, type ClassFile, type Letter, type Pieces } from '../record'
import { NO_ROWS, bodyTones, panelTones, pavingTones, toneGateWalls, toneMapBodies } from '../record-tones'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { abs, float, max, mix, positionLocal, positionWorld, smoothstep, step, uniform, vec3, vec4 } = TSL as unknown as Record<string, N>

const q = new URLSearchParams(location.search)
const says = document.getElementById('says') as HTMLElement
const say = (s: string): void => {
  says.textContent = s
  console.log(`gate: ${s}`)
}
const D2R = Math.PI / 180

say('reading the plans')
const [plan, cams, mapPlan, pieces, recordClasses, openCams]: [J, J, J, Pieces, ClassFile, J] = await Promise.all([
  fetch(new URL('./gate-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('./gate-cams.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../map/map-plan.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../pieces.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../record-classes.json', import.meta.url)).then((r) => r.json()),
  fetch(new URL('../open/open-cams.json', import.meta.url)).then((r) => r.json()),
])
const GF = gateFrame(plan)
const MF = makeFrame(mapPlan)
const L0: number = plan.frame.level0

/* ── the map's city without the bodies the gate replaces ── */
const t0 = performance.now()
const dropB = new Set<string>(plan.frame.mapBlocksReplaced), dropW = new Set<string>(plan.frame.mapWallsReplaced)
const cityPlan = structuredClone(mapPlan)
cityPlan.blocks = cityPlan.blocks.filter((b: J) => !dropB.has(b.id))
cityPlan.walls = cityPlan.walls.filter((w: J) => !dropW.has(w.id))
const city = buildPlan(cityPlan)
const canalZ: number[] = []
{
  const cz = MF.s(cityPlan.canal.line[0][0], cityPlan.canal.line[0][1])[1]
  for (const d of [-2.4, -cityPlan.canal.w / 2, cityPlan.canal.w / 2, 2.4]) canalZ.push(Math.round((cz + d) * 100) / 100)
}

/* ── the gate ── */
const B = buildGate(plan)
const fields = { bull: animalField('bull'), dragon: animalField('dragon'), lion: animalField('lion') }
const A = assemble(B, plan, fields)
/* the class view from the record: every body's rows at stop 3, the stop the evidence switch reads (forge/babylon/switch.mjs) */
const RECORD_STOP = '3'
const named = recordNamer(pieces, recordClasses, RECORD_STOP)
const letter = (s: unknown): Letter => (isLetter(s) ? s : 'G')
const painted = [toneGateWalls(A.walls, A.marks, named)]
for (const set of A.panels) panelTones(B.panels.filter((p) => p.kind === set.kind), named).forEach((t, i) => { set.iB[i * 4 + 2] = t })
A.bronzes.forEach((b, i) => {
  const t = bodyTones(named, `gate:bronze-${i}`, [letter(plan.bronze.cls), letter(plan.bronze.cls)])
  b.cls = [t.foot, t.above, b.cls[2], NO_ROWS]
})
const planMs = Math.round(performance.now() - t0)

/* gate frame to the map's scene (the world here) */
const G2W = new Matrix4().fromArray(GF.toMap(MF.E0, MF.N0))
const W2G = G2W.clone().invert()
const ROT = new Matrix3().setFromMatrix4(G2W)
const toWorld = (p: V3): Vector3 => new Vector3(...p).applyMatrix4(G2W)
const dirWorld = (d: V3): Vector3 => new Vector3(...d).applyMatrix3(ROT).normalize()

/* ── the page ── */
const canvas = document.getElementById('stage') as HTMLCanvasElement
const stack = await createStack({ canvas })
const renderer = stack.renderer
const scene = new Scene()
const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 26000)
stack.setScene(scene, camera, { ...IDENTITY, name: 'babylon-gate' })

const STATE = q.get('state') === 'grey' ? 0 : q.get('state') === 'flat' ? 1 : 2
const U = makeUniforms({ M: mapPlan.classes.M.colour, R: mapPlan.classes.R.colour, G: mapPlan.classes.G.colour })
U.uState.value = STATE
U.uSwitch.value = q.get('switch') === 'classes' ? 1 : 0
U.uSelf.value = Number(q.get('self') ?? plan.switch.selfLit?.value ?? 0)
;(U.uRot.value as Matrix3).copy(ROT)

/* the walk's light, the arrival's own (open/light.ts): one sun (map/sun.ts), one sky and air, one environment, the shadow
   fitted to the frame, one print; so the flight's last frame and the walk's first frame are lit by the same code */
const uW2G = uniform(new Matrix4().copy(W2G))
const L = walkLight({ renderer, scene, light: plan.light, rot: ROT, uW2G, uSunG: U.uSunG, gateAt: toWorld([0, 10, 0]), q })
const sky: Sky = { colour: L.sky }
const skyDome = L.dome
/** toward the sun in the gate's frame, as the facts state it */
const sunG = (hour: number): V3 => {
  const v = new Vector3(...mapSunVector(hour)).applyMatrix3(ROT.clone().transpose())
  return [v.x, v.y, v.z]
}

say('building the city and the gate')
const tones = tonesFrom(cityPlan)
const band = Number(mapPlan.classes.band)
const bodies = buildBodies(city, tones, sky, L.AIR.uSun, canalZ, undefined, { houses: { rebuild: rebuildHouses, band } })
/* the city round the gate in the map page's own materials (map/city.ts), so the street south of the gate is the next stop's */
const lion = mapPlan.frames.lion
paintCity(bodies.group, city, tones, { band, street: { o: MF.s(lion.origin[0], lion.origin[1]), a: MF.dir(lion.bearing), c: MF.dir(lion.bearing + 90), pavedTo: NORTH_PAVED.a1 } })
painted.push(toneMapBodies(bodies.group, city, named))
scene.add(bodies.group)
uView.value = U.uSwitch.value

/* the south paving's line (built below the gate's paving): from the paving's end, where the map's street line leaves the
   gate's axis, through the map's street points (its ribbon south of the gate) on a Catmull-Rom curve, sampled every 2 m,
   to the palace's south-east corner */
const PAVE_END = -60 // the gate's paving's south edge (gate-mesh.ts pavingGeometry)
const SOUTH = (() => {
  const half = (plan.street.paving.limestone * plan.street.paving.limestoneN) / 2 + plan.street.paving.breccia * plan.street.paving.brecciaN
  const ctl: Array<[number, number, number]> = [[0, PAVE_END + 20, B.level(PAVE_END)], [0, PAVE_END, B.level(PAVE_END)]]
  // the map's points past the paving's end (its point at the end is ctl[1]: a run on the axis past it bent the paving in an S)
  for (const p of mapPlan.street.points as Array<{ at: [number, number]; level: number }>) {
    const [x, z] = GF.fromUtm(p.at[0], p.at[1])
    if (z < PAVE_END - 0.5 && z > -230) ctl.push([x, z, p.level - L0])
  }
  ctl.push(ctl[ctl.length - 1]!.map((v, i) => 2 * v - ctl[ctl.length - 2]![i]!) as [number, number, number])
  const cr = (a: number, b: number, c: number, d: number, t: number): number =>
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
  const line: Array<[number, number, number]> = []
  for (let i = 1; i + 2 < ctl.length; i++) {
    const [a, b, c, d] = [ctl[i - 1]!, ctl[i]!, ctl[i + 1]!, ctl[i + 2]!]
    const k = Math.max(1, Math.round(Math.hypot(c[0] - b[0], c[1] - b[1]) / 2))
    for (let j = 0; j < k; j++) {
      const t = j / k
      // the level runs straight between the map's points, as its ribbon does
      line.push([cr(a[0], b[0], c[0], d[0], t), cr(a[1], b[1], c[1], d[1], t), b[2] + (c[2] - b[2]) * t])
    }
  }
  line.push(ctl[ctl.length - 2]!)
  return { half, line, zEnd: line[line.length - 1]![1] }
})()
/* the map's street and ground give way to the gate's paving inside its area (a mask, the map's files untouched) */
/** the apron's south edge beside the street: 0 to 3 m short of the paving's end, uneven along x; the band itself runs on */
const apronEnd = (x: N): N => float(PAVE_END).add(smoothstep(SOUTH.half, SOUTH.half + 1.5, abs(x)).mul(TSL.mx_noise_float(vec3(x.mul(0.37), 1.7, 0.3)).add(0.5).mul(2.4).add(0.6)))
const sdx = B.street.dir[0], sdz = B.street.dir[1]
const paved = (): N => {
  const p = uW2G.mul(vec4(positionWorld, 1)).xyz
  const inRect = step(-34, p.x).mul(step(p.x, 30)).mul(step(apronEnd(p.x), p.z)).mul(step(p.z, 50))
  const s = p.x.mul(sdx).add(p.z.mul(sdz)), t = p.x.mul(sdz).sub(p.z.mul(sdx))
  const inStreet = step(20, s).mul(step(s, Number(plan.lionWalls.to) + 1)).mul(step(abs(t), B.street.halfWidth + 0.6))
  return max(inRect, inStreet)
}
/** the map's street ribbon where the south paving below lies over it (only the ribbon runs in that span of the axis) */
const pavedSouth = (): N => {
  const p = uW2G.mul(vec4(positionWorld, 1)).xyz
  return step(SOUTH.zEnd, p.z).mul(step(p.z, PAVE_END + 0.5)).mul(step(abs(p.x), 30))
}
for (const name of ['street', 'ground']) {
  const mesh = bodies.group.getObjectByName(name) as Mesh | undefined
  if (!mesh) continue
  const mat = mesh.material as MeshStandardNodeMaterial
  mat.maskNode = name === 'street' ? max(paved(), pavedSouth()).lessThan(0.5) : paved().lessThan(0.5)
}

/* the rooms: how open each chamber and passage is to the sky (the bounce and sky are modelled; the stack has no GI) */
const FG = plan.front, MG = plan.main
const fw: number = FG.frontWall, chD: number = FG.chamber[1], ow: number = FG.walls
const zCh0 = -fw, zCh1 = -(fw + chD), zBack = -(fw + chD + ow), zMT = zBack - plan.court.depth, zM0 = zMT - MG.towers.proj
const zMch0 = zM0 - MG.walls, zMch1 = zMch0 - MG.chamber[0], zMS = zMch1 - MG.walls
const hd = FG.door / 2
const rooms: Rooms = {
  boxes: [
    { x0: -hd - 0.05, x1: hd + 0.05, z0: zCh0 + 0.6, z1: -0.65, y1: FG.arch.crown + 0.05, open: 0.62 },
    { x0: -FG.chamber[0] / 2 - 0.05, x1: FG.chamber[0] / 2 + 0.05, z0: zCh1 - 0.05, z1: zCh0 + 0.05, y1: FG.wallTop.value - 0.6, open: 0.28 },
    { x0: -hd - 0.05, x1: hd + 0.05, z0: zBack + 0.65, z1: zCh1, y1: FG.arch.crown + 0.05, open: 0.42 },
    { x0: -FG.across / 2, x1: FG.across / 2, z0: zMT - 0.05, z1: zBack, y1: 30, open: 0.55 },
    { x0: -hd - 0.05, x1: hd + 0.05, z0: zMch0, z1: zM0 - 0.65, y1: MG.arch.crown + 0.05, open: 0.42 },
    { x0: -MG.chamber[1] / 2 - 0.05, x1: MG.chamber[1] / 2 + 0.05, z0: zMch1 - 0.05, z1: zMch0 + 0.05, y1: MG.wallTop.value - 0.6, open: 0.22 },
    { x0: -hd - 0.05, x1: hd + 0.05, z0: zMS + 0.65, z1: zMch1, y1: MG.arch.crown + 0.05, open: 0.5 },
  ],
}

const gate = new Group()
gate.name = 'gate'
gate.matrixAutoUpdate = false
gate.matrix.copy(G2W)
scene.add(gate)
const wallMesh = new Mesh(A.walls, wallMaterial(U, rooms))
wallMesh.castShadow = true
wallMesh.receiveShadow = true
wallMesh.frustumCulled = false
wallMesh.name = 'gate-walls'
gate.add(wallMesh)
const paveL = letter(plan.street.paving.cls)
const pave = new Mesh(A.paving, pavingMaterial(U, { ...plan.street.paving, sd: B.street.dir, st: [B.street.dir[1], -B.street.dir[0]], turnZ: 21.3, cls: pavingTones(named, [paveL, paveL]) }, rooms))
pave.receiveShadow = true
pave.castShadow = true
pave.frustumCulled = false
pave.name = 'gate-paving'
;(pave.material as MeshStandardNodeMaterial).maskNode = positionLocal.z.greaterThanEqual(apronEnd(positionLocal.x))
gate.add(pave)

/* the processional way south of the gate's paving, in the gate's own paving (pavingMaterial, its slabs laid in the local x
   and z of each piece): along the gate's axis for 20 m, then on the map's street line (map-plan.json street.points, the
   ribbon this replaces) to the palace's south-east corner; one mitred piece per leg in that leg's own frame, with a skirt */
{
  const L = SOUTH.line, n = L.length
  const dir = (i: number): [number, number] => { const dx = L[i + 1]![0] - L[i]![0], dz = L[i + 1]![1] - L[i]![1], l = Math.hypot(dx, dz); return [dx / l, dz / l] }
  // each vertex's left and right edge points: square to the axis at the start, mitred between legs
  const edge = (i: number): [[number, number], [number, number]] => {
    let nx: number, nz: number
    if (i === 0) { nx = 1; nz = 0 }
    else if (i === n - 1) { const d = dir(i - 1); nx = -d[1]; nz = d[0] }
    else {
      const a = dir(i - 1), b = dir(i)
      const mx = -(a[1] + b[1]), mz = a[0] + b[0], ml = Math.hypot(mx, mz), cosH = (mx * -a[1] + mz * a[0]) / ml
      nx = mx / ml / cosH; nz = mz / ml / cosH
    }
    const h = SOUTH.half
    return [[L[i]![0] + nx * h, L[i]![1] + nz * h], [L[i]![0] - nx * h, L[i]![1] - nz * h]]
  }
  const southMat = pavingMaterial(U, { ...plan.street.paving, sd: B.street.dir, st: [B.street.dir[1], -B.street.dir[0]], turnZ: 21.3, cls: pavingTones(named, [paveL, paveL]) }, rooms)
  let along = -PAVE_END
  for (let i = 0; i + 1 < n; i++) {
    const d = dir(i), len = Math.hypot(L[i + 1]![0] - L[i]![0], L[i + 1]![1] - L[i]![1])
    // the leg's frame: local x across (n = (-dz, dx)), local z back up the street, so the slabs' courses run on from the gate's
    const nx = -d[1], nz = d[0], ox = L[i]![0] - d[0] * along, oz = L[i]![1] - d[1] * along
    const toLocal = (x: number, z: number): [number, number] => { const rx = x - ox, rz = z - oz; return [rx * nx + rz * nz, -(rx * d[0] + rz * d[1])] }
    const [a0, a1] = edge(i), [b0, b1] = edge(i + 1)
    const steps = Math.max(1, Math.ceil(len / 2))
    const pos: number[] = []
    const lerp = (p: [number, number], q: [number, number], f: number): [number, number] => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]
    for (let k = 0; k < steps; k++) {
      const f0 = k / steps, f1 = (k + 1) / steps
      const y0 = L[i]![2] + (L[i + 1]![2] - L[i]![2]) * f0, y1 = L[i]![2] + (L[i + 1]![2] - L[i]![2]) * f1
      const l0 = toLocal(...lerp(a0, b0, f0)), r0 = toLocal(...lerp(a1, b1, f0)), l1 = toLocal(...lerp(a0, b0, f1)), r1 = toLocal(...lerp(a1, b1, f1))
      // the top (facing up), then the two skirts 0.6 m down (facing out)
      pos.push(l0[0], y0, l0[1], l1[0], y1, l1[1], r0[0], y0, r0[1], r0[0], y0, r0[1], l1[0], y1, l1[1], r1[0], y1, r1[1])
      pos.push(l0[0], y0, l0[1], l0[0], y0 - 0.6, l0[1], l1[0], y1, l1[1], l1[0], y1, l1[1], l0[0], y0 - 0.6, l0[1], l1[0], y1 - 0.6, l1[1])
      pos.push(r0[0], y0, r0[1], r1[0], y1, r1[1], r0[0], y0 - 0.6, r0[1], r1[0], y1, r1[1], r1[0], y1 - 0.6, r1[1], r0[0], y0 - 0.6, r0[1])
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    const m = new Mesh(g, southMat)
    m.position.set(ox, 0, oz)
    m.rotation.y = Math.atan2(-nz, nx)
    m.receiveShadow = true
    m.frustumCulled = false
    m.name = 'gate-paving-south'
    gate.add(m)
    along += len
  }
}

const schemesOf: Record<string, Array<[string, number]>> = { bull: [['yellow', 0]], dragon: [['white', 1]], lion: [['lionWhite', 2], ['lionYellow', 3]] }
const panelMeshes: InstancedMesh[] = []
for (const set of A.panels) {
  if (!set.count) continue
  const f = fields[set.kind]
  const maps = bakePanel(f, schemesOf[set.kind]!.map((x) => x[0]))
  const geo = panelGrid(f.L, 0.02, COURSE, 0.01)
  geo.setAttribute('iU', new InstancedBufferAttribute(set.iU, 3))
  geo.setAttribute('iN', new InstancedBufferAttribute(set.iN, 3))
  geo.setAttribute('iA', new InstancedBufferAttribute(set.iA, 4))
  geo.setAttribute('iB', new InstancedBufferAttribute(set.iB, 4))
  const origins = new Float32Array(set.count * 3)
  for (let i = 0; i < set.count; i++) origins.set(set.matrices.subarray(i * 16 + 12, i * 16 + 15), i * 3)
  geo.setAttribute('iO', new InstancedBufferAttribute(origins, 3))
  const im = new InstancedMesh(geo, panelMaterial(U, maps, schemesOf[set.kind]!, rooms), set.count)
  for (let i = 0; i < set.count; i++) im.setMatrixAt(i, new Matrix4().fromArray(set.matrices, i * 16))
  im.instanceMatrix.needsUpdate = true
  im.castShadow = true
  im.receiveShadow = true
  im.frustumCulled = false
  im.name = `panels-${set.kind}`
  gate.add(im)
  panelMeshes.push(im)
}
for (const b of A.bronzes) {
  const m = new Mesh(b.geometry, wallMaterial(U, rooms))
  // the bronze's attributes: kind 7 everywhere, its row's classes (set above from the record)
  const n = b.geometry.getAttribute('position').count
  const fill = (k: number, v: number[]): Float32BufferAttribute => { const a = new Float32Array(n * k); for (let i = 0; i < n; i++) a.set(v, i * k); return new Float32BufferAttribute(a, k) }
  b.geometry.setAttribute('gU', fill(1, [0]))
  b.geometry.setAttribute('gEdge', fill(2, [99, 99]))
  b.geometry.setAttribute('gInfo', fill(4, [0, 0, 7, 0]))
  b.geometry.setAttribute('gCls', fill(4, b.cls))
  m.castShadow = true
  m.receiveShadow = true
  m.frustumCulled = false
  m.name = 'bronze'
  gate.add(m)
}

/* life without bodies: date palms beyond the walls, a few birds over the forecourt, each kind in its row's class */
const lifeL = letter(plan.life.cls)
const palms = new Mesh(palmsGeometry(plan.life.palms, B.level), lifeMaterial(U, bodyTones(named, 'life:palm-0', [lifeL, lifeL]).above))
palms.castShadow = true
palms.receiveShadow = true
palms.frustumCulled = false
palms.name = 'palms'
gate.add(palms)
const birds = new Mesh(birdsGeometry(plan.life.birds), lifeMaterial(U, bodyTones(named, 'life:bird-0', [lifeL, lifeL]).above))
birds.frustumCulled = false
birds.name = 'birds'
gate.add(birds)

/* the figure: the house's grey sign person, 1.70 m, in the sun by the east tower */
const personMat = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 })
personMat.colorNode = vec3(0.16)
const figure = signPerson(PERSON_FORMS.f2, personMat)
figure.position.set(plan.figure.x, B.level(plan.figure.z), plan.figure.z)
figure.rotation.y = plan.figure.turn ?? -Math.PI / 2
figure.name = 'figure'
gate.add(figure)
// the figure keeps the stack's contact shade: the sky field's maps leave it out
L.field?.setHidden(() => [figure])
// a probe only, never in the film (?figure=s,t): the figure on the street s metres out on its line, t across (+ west)
if (q.get('figure')) {
  const [fs, ft] = q.get('figure')!.split(',').map(Number) as [number, number]
  const fx = fs * B.street.dir[0] + (ft ?? 0) * B.street.dir[1], fz = fs * B.street.dir[1] - (ft ?? 0) * B.street.dir[0]
  figure.position.set(fx, B.level(fz), fz)
}

/* light: the sun's key and its shadow, the sky and the modelled bounce as an environment (open/light.ts) */
const setHour = (hour: number): void => L.setHour(hour)

/* the camera: a level look with the frame slid up (a shift lens, `rail-projection.ts`'s math copied: ceiling 0.7) */
let shiftNow = 0
const ownUpdate = camera.updateProjectionMatrix.bind(camera)
camera.updateProjectionMatrix = function () {
  ownUpdate()
  if (shiftNow !== 0) {
    this.projectionMatrix.elements[9] = this.projectionMatrix.elements[9]! + shiftNow
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert()
  }
}
/** the authored horizontal field kept on wider canvases; a narrower one keeps the authored vertical field */
function fittedFov(hfov: number, authored: [number, number], w: number, h: number): number {
  const vAuth = 2 * Math.atan(Math.tan((hfov / 2) * D2R) * (authored[1] / authored[0]))
  const vKeepH = 2 * Math.atan(Math.tan((hfov / 2) * D2R) * (h / w))
  return (w / h >= authored[0] / authored[1] ? vKeepH : Math.max(vKeepH, vAuth)) / D2R
}
function aimWorld(pos: Vector3, look: Vector3, vfov: number, w: number, h: number, shift = 0): void {
  camera.position.copy(pos)
  camera.up.set(0, 1, 0)
  camera.lookAt(look)
  camera.fov = vfov
  camera.aspect = w / h
  shiftNow = Math.min(0.7, Math.max(-0.7, shift))
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  skyDome.position.copy(camera.position)
  skyDome.updateMatrixWorld(true)
  U.uPix.value = (2 * Math.tan((vfov / 2) * D2R)) / h
  setCityPixel(vfov, h)
  const f = L.frame(camera)
  linear?.setRadius(f.aoRadius)
}

/** a trial camera in the gate's frame; a null height stands the eye on the street's profile and looks level */
function aimTrial(t: { pos: (number | null)[]; look: (number | null)[]; hfov: number; shift?: number }, w: number, h: number): void {
  const y = t.pos[1] ?? B.level(t.pos[2]!) + cams.eye
  const pos: V3 = [t.pos[0]!, y, t.pos[2]!], look: V3 = [t.look[0]!, t.look[1] ?? y, t.look[2]!]
  aimWorld(toWorld(pos), toWorld(look), fittedFov(t.hfov, [16, 9], w, h), w, h, t.shift ?? 0)
}
/* the stills' views, in the gate's frame, then the world: stop 2 (and no stop) the hero stills in `cams.stills`; a stop
   with a `still` its own hold, the key at `still.t`, each framing's lens and any stand of its own over that key */
interface View { name: string; stop?: number; pos: V3; look: V3; hfov: number; shift: number; authored: [number, number] }
const AUTHORED: Record<'desktop' | 'phone', [number, number]> = { desktop: [16, 9], phone: [390, 844] }
function stillView(name: 'desktop' | 'phone', stop?: number): View {
  const s = stop === undefined ? undefined : cams.stops.find((x: J) => x.n === stop)
  if (!s?.still) {
    const v = cams.stills[name]
    const [x, z] = v.at as [number, number]
    const y = B.level(z) + cams.eye
    const look: V3 = [v.look[0], v.look[1] ?? y, v.look[2]]
    return { name, pos: [x, y, z], look, hfov: v.hfov, shift: v.shift, authored: v.authored }
  }
  const key = s.keys.find((k: J) => k.t === s.still.t)
  if (!key) throw new Error(`stop ${stop}: no key at t ${s.still.t} for its still`)
  const o = s.still[name] ?? {}
  const [x, z] = keyAt(o.at ?? key.at)
  const y = B.level(z) + cams.eye
  const lk = o.look ?? key.look
  const look: V3 = lk === 'gate' ? [0, y, -20] : lk === 'south' ? [south[0], 1.65, south[1]] : [lk[0], lk[1] ?? y, lk[2]]
  return { name, stop, pos: [x, y, z], look, hfov: o.hfov ?? cams.stills[name].hfov, shift: o.shift ?? 0, authored: o.authored ?? AUTHORED[name] }
}
function aimView(v: View, w: number, h: number): void {
  aimWorld(toWorld(v.pos), toWorld(v.look), fittedFov(v.hfov, v.authored, w, h), w, h, v.shift)
}

/* the sketch's path: the gate's keys as the map's path (UTM and German levels), so the map's easing serves both */
const south = GF.fromUtm(445831, 3600652)
const keyAt = (at: J): [number, number] => {
  if (typeof at === 'string' && at.startsWith('street:')) {
    const s = Number(at.slice(7))
    return [s * B.street.dir[0], s * B.street.dir[1]]
  }
  return at as [number, number]
}
const pathCams = {
  eye: cams.eye,
  lens: { desktop: cams.stills.desktop.hfov, phoneFilm: cams.phoneFilm },
  stops: cams.stops.map((s: J) => ({ n: s.n, hour: s.hour[0] })),
  path: cams.stops.flatMap((s: J) => s.keys.map((k: J, i: number) => {
    const [x, z] = keyAt(k.at)
    const [E, N] = GF.utm(x, z)
    const eyeY = B.level(z) + cams.eye
    let look: V3
    if (k.look === 'gate') look = [0, eyeY, -20]
    else if (k.look === 'south') look = [south[0], 1.65, south[1]]
    else look = [k.look[0], k.look[1], k.look[2]]
    const [lE, lN] = GF.utm(look[0], look[2])
    // a stop's first key repeats the last stop's last key at the same second, so each stop starts at its own key; the
    // walk's first key is the arrival's landing, so its clock starts at the landing's hour (one clock across the cut)
    const first = s === cams.stops[0] && i === 0
    return { t: k.t + (i === 0 && !first ? 1e-4 : 0), at: [E, N], y: 'eye', look: [lE, lN, look[1] + L0], stop: s.n, hold: k.kind === 'hold' || i === 0, kind: k.kind, cut: false, ...(k.phone ? { phone: k.phone } : {}), ...(k.desktop ? { hfov: k.desktop.hfov, shift: k.desktop.shift } : {}), ...(first ? { hour: openCams.hour } : {}) }
  })),
}
const standMap = (x: number, z: number): number => {
  const [gx, gz] = GF.fromUtm(x + MF.E0, MF.N0 - z)
  return B.level(gz) + L0
}
const path = makePath(pathCams, MF.s, standMap)

/* the id pass (`?ids=1`, with `ao=0`): every surface in one flat colour by what it is, for the shares per still (guard 6) */
if (q.get('ids') === '1') {
  // both sides, as the palms' and birds' own material draws them
  const flat = (r: number, g: number, b: number): MeshBasicNodeMaterial => { const m = new MeshBasicNodeMaterial({ side: DoubleSide }); m.colorNode = vec3(r, g, b); m.fog = false; return m }
  const SKY = flat(0, 0, 1), GLAZED = flat(0, 1, 0), PLAIN = flat(1, 0, 0), PAVING = flat(1, 1, 0), FIGURE = flat(1, 1, 1), OTHER = flat(1, 0, 1)
  L.AIR.uOn.value = 0
  ;(skyDome.material as MeshBasicNodeMaterial).colorNode = vec3(0, 0, 1)
  const wallIds = new MeshBasicNodeMaterial()
  {
    const info = TSL.attribute('gInfo', 'vec4') as N, y = positionLocal.y
    const k = info.z
    const frieze = step(info.w, y).mul(step(y, info.w.add(23 * COURSE))).mul(step(0.5, k)).mul(step(k, 1.5))
    const glazed = step(k, 0.5).add(frieze).min(1)
    const other = step(4.5, k)
    wallIds.colorNode = mix(mix(vec3(1, 0, 0), vec3(0, 1, 0), glazed), vec3(1, 0, 1), other)
    wallIds.fog = false
  }
  scene.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh || o === skyDome) return
    const n = o.name
    m.material = n === 'gate-walls' ? wallIds : n.startsWith('panels-') ? GLAZED : n.startsWith('gate-paving') || n === 'street' || n === 'ground' ? PAVING
      : n === 'figure' || o.parent?.name === 'figure' ? FIGURE : n === 'bronze' || n === 'palms' || n === 'birds' || n.startsWith('water') ? OTHER : PLAIN
  })
  figure.traverse((o) => { if ((o as Mesh).isMesh) (o as Mesh).material = FIGURE })
  void SKY
}

/* one pipeline: the scene pass, the contact occlusion, output linear; the print on the CPU */
setHour(hourOf(cams.hour))
let linear: ReturnType<typeof createOpenLinear> | null = null
const first = stillView('desktop')
aimView(first, 1600, 900)
renderer.render(scene, camera)
linear = createOpenLinear(renderer, scene, camera, L.AIR, { ao: { on: q.get('ao') !== '0', intensity: L.uAoOn, radius: 1.2, fadeNear: L.uAoNear, fadeFar: L.uAoFar } })
/** the print for the camera where it stands, with extra stops (the brighter state) */
const printNow = (stops = 0) => L.printFor(camera.position.y, L.stopsAt(camera.position.y) + stops)

const putBase = q.get('put') ?? ''
async function upload(file: string, bytes: Uint8Array | string): Promise<void> {
  const res = await fetch(`${putBase}?path=${encodeURIComponent(file)}`, { method: 'POST', body: bytes as BodyInit })
  if (!res.ok) throw new Error(`upload ${file}: ${res.status}`)
}
async function jpeg(bytes: Uint8ClampedArray, w: number, h: number, quality = 0.88): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(bytes as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', quality))
  return new Uint8Array(await blob.arrayBuffer())
}
function brightness(bytes: Uint8ClampedArray, box?: [number, number, number, number], w = 0): { median: number; p1: number; p99: number } {
  const hist = new Uint32Array(256)
  let n = 0
  const add = (i: number): void => {
    hist[Math.round(0.2126 * bytes[i]! + 0.7152 * bytes[i + 1]! + 0.0722 * bytes[i + 2]!)]!++
    n++
  }
  if (box) { for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) add((y * w + x) * 4) }
  else for (let i = 0; i < bytes.length; i += 4) add(i)
  const at = (f: number): number => {
    let acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= f * n) return v }
    return 255
  }
  return { median: at(0.5), p1: at(0.01), p99: at(0.99) }
}

/** what the accumulation actually read back: one read per sub-frame, and the target it read from */
interface ReadBack { subFrames: number; target: { width: number; height: number; type: string; format: string; samples: number; depthBuffer: boolean } | null }
const TYPE_NAMES: Record<number, string> = { 1015: 'FloatType', 1016: 'HalfFloatType', 1009: 'UnsignedByteType' }
const FORMAT_NAMES: Record<number, string> = { 1023: 'RGBAFormat', 1022: 'RGBFormat' }
async function render(w: number, h: number, samples: number, stops = 0): Promise<{ bytes: Uint8ClampedArray; rgb: Float32Array; ms: number; readBack: ReadBack }> {
  const t = performance.now()
  const readBack: ReadBack = { subFrames: 0, target: null }
  const read = renderer.readRenderTargetPixelsAsync.bind(renderer)
  // count the reads the kit's accumulation makes and keep the target it allocated, instead of trusting its source
  renderer.readRenderTargetPixelsAsync = ((rt: J, ...rest: J[]) => {
    readBack.subFrames++
    readBack.target = { width: rt.width, height: rt.height, type: TYPE_NAMES[rt.texture.type] ?? String(rt.texture.type), format: FORMAT_NAMES[rt.texture.format] ?? String(rt.texture.format), samples: rt.samples, depthBuffer: rt.depthBuffer }
    return (read as J)(rt, ...rest)
  }) as typeof renderer.readRenderTargetPixelsAsync
  let rgb: Float32Array
  // the sky field (`?sky=set`, open/sky-set.ts): its maps for this camera, a quarter of its directions a sub-frame
  L.field?.prepare(camera)
  try {
    rgb = await accumulate(renderer, camera, linear!.post, w, h, samples, L.field ? (i: number) => L.field!.each(i) : undefined)
  } finally {
    renderer.readRenderTargetPixelsAsync = read
  }
  const bytes = printFrame(rgb, w, h, printNow(stops), 0)
  return { bytes, rgb, ms: Math.round(performance.now() - t), readBack }
}

/** a world point (gate frame) to device pixels for the current camera */
function project(p: V3, w: number, h: number): [number, number, number] {
  const v = toWorld(p).project(camera)
  return [Math.round(((v.x + 1) / 2) * w), Math.round(((1 - v.y) / 2) * h), v.z]
}

function setStates(o: { state?: 'grey' | 'flat' | 'full'; switch?: boolean }): void {
  if (o.state) U.uState.value = o.state === 'grey' ? 0 : o.state === 'flat' ? 1 : 2
  if (o.switch !== undefined) {
    U.uSwitch.value = o.switch ? 1 : 0
    uView.value = o.switch ? 1 : 0
  }
}

const rig = {
  ready: true,
  state: () => ({ planMs, counts: { ...A.counts, cityTriangles: bodies.counts.triangles }, backend: stack.backend, architecture: stack.architecture, state: U.uState.value, switch: U.uSwitch.value, duration: path.duration, record: { stop: RECORD_STOP, bodies: painted.reduce((s, p) => s + p.bodies, 0), byLetters: painted.flatMap((p) => p.byLetters) } }),
  facts: () => ({ ...B.facts, figure: { x: figure.position.x, y: figure.position.y, z: figure.position.z, height: plan.figure.height }, panels: B.panels.length, sun: Object.fromEntries(['16:40', '16:45', '17:00', '12:00'].map((h) => [h, { ...L.sunAt(hourOf(h)), toward: sunG(hourOf(h)) }])), views: { desktop: stillView('desktop'), phone: stillView('phone') }, level: (z: number) => B.level(z) }),
  views: () => ({ desktop: stillView('desktop'), phone: stillView('phone'), stops: Object.fromEntries(cams.stops.map((s: J) => [s.n, { desktop: stillView('desktop', s.n), phone: stillView('phone', s.n) }])), keys: path.keys.map((k) => ({ t: k.t, stop: k.stop, kind: k.kind, pos: k.pos })), duration: path.duration }),
  /** device-pixel boxes of the crop anchors for a framing at a size */
  crops(o: { framing: 'desktop' | 'phone'; w: number; h: number; stop?: number }) {
    aimView(stillView(o.framing, o.stop), o.w, o.h)
    const out: Record<string, unknown> = {}
    for (const [name, c] of Object.entries(cams.crops as Record<string, J>)) {
      if (c.framing !== o.framing) continue
      let at: V3
      if (c.at === 'figure') at = [figure.position.x, figure.position.y + 0.85, figure.position.z]
      else at = [c.at[0], c.at[1] ?? B.level(c.at[2]), c.at[2]]
      const [px, py] = project(at, o.w, o.h)
      const [cw, ch] = c.size as [number, number]
      const x0 = Math.max(0, Math.min(o.w - cw, px - cw / 2)), y0 = Math.max(0, Math.min(o.h - ch, py - ch / 2))
      out[name] = { anchor: at, centre: [px, py], box: [Math.round(x0), Math.round(y0), Math.round(x0) + cw, Math.round(y0) + ch], check: c.check === true }
    }
    return out
  },
  /** the hero's device-pixel boxes, the front door's opening to its crown and the figure, for a framing or a trial look */
  hero(o: { framing: 'desktop' | 'phone'; w: number; h: number; stop?: number; look?: { pos: (number | null)[]; look: (number | null)[]; hfov: number; shift?: number } }) {
    if (o.look) aimTrial(o.look, o.w, o.h)
    else aimView(stillView(o.framing, o.stop), o.w, o.h)
    const box = (pts: V3[]): number[] => {
      const p = pts.map((q) => project(q, o.w, o.h))
      return [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]
    }
    const half = FG.door / 2, foot = B.level(0), crown = FG.arch.crown
    const f = figure.position, fh = plan.figure.height
    // the measured band's projected height on the faces nearest the eye: the front towers' fronts and the door wall
    const mb = plan.switch.mBand.height as number, tx = FG.towers.gap / 2 + FG.towers.w / 2
    const bandAt: [string, number, number][] = [['east tower', -tx, FG.towers.proj], ['west tower', tx, FG.towers.proj], ['door wall east', -half - 0.5, 0], ['door wall west', half + 0.5, 0]]
    const band = Object.fromEntries(bandAt.map(([n, x, z]) => {
      const ya = toWorld([x, B.level(z), z]).project(camera).y, yb = toWorld([x, B.level(z) + mb, z]).project(camera).y
      return [n, Math.round((Math.abs(ya - yb) / 2) * o.h * 100) / 100]
    }))
    return {
      door: box([[-half, foot, 0], [half, foot, 0], [-half, crown, 0], [half, crown, 0]]),
      figure: box([[f.x - 0.3, f.y, f.z], [f.x + 0.3, f.y, f.z], [f.x - 0.3, f.y + fh, f.z], [f.x + 0.3, f.y + fh, f.z]]),
      band,
    }
  },
  /** a still: a framing, the scene state and the switch, device pixels and CSS size, sub-frames */
  async shoot(o: { framing: 'desktop' | 'phone'; stop?: number; state?: 'grey' | 'flat' | 'full'; switch?: boolean; w: number; h: number; css: [number, number]; samples: number; out: string; name: string; hour?: string; stops?: number; box?: [number, number, number, number]; look?: { pos: (number | null)[]; look: (number | null)[]; hfov: number; shift?: number } }) {
    setStates(o)
    const hour = o.hour ?? (U.uState.value === 1 ? '12:00' : cams.hour)
    setHour(hourOf(hour))
    const v = stillView(o.framing, o.stop)
    if (o.look) aimTrial(o.look, o.w, o.h)
    else aimView(v, o.w, o.h)
    const { bytes, ms, readBack } = await render(o.w, o.h, o.samples, o.stops ?? 0)
    const file = `${o.out}/${o.name}.png`
    await upload(file, await toPNG(bytes, o.w, o.h))
    const s = L.sunAt(hourOf(hour))
    const side = {
      file, framing: o.framing, stop: o.stop ?? null, state: ['grey', 'flat', 'full'][U.uState.value as number], switch: !!U.uSwitch.value,
      cssSize: o.css, devicePixels: [o.w, o.h], ratio: +(o.w / o.css[0]).toFixed(3), subFramesAsked: o.samples, subFrames: readBack.subFrames,
      renderTarget: readBack.target, sampleCountReadBack: readBack.target?.samples ?? null,
      backend: stack.backend, adapter: stack.architecture, print: printNow(o.stops ?? 0),
      hour, sun: { azimuth: +s.azimuth.toFixed(1), elevation: +s.elevation.toFixed(1), toward: sunG(hourOf(hour)).map((x) => +x.toFixed(3)), source: 'map/sun.ts' },
      env: { intensity: scene.environmentIntensity, bounce: L.uBounce.value, sunIntensity: L.sunLight.intensity, eastWalls: [(L.uWalls.value as Color).r, (L.uWalls.value as Color).g, (L.uWalls.value as Color).b].map((v) => +v.toFixed(4)), air: { sigma: L.AIR.uSigma.value, scale: L.AIR.uScale.value, on: L.AIR.uOn.value } },
      camera: o.look ? { gate: o.look } : { gate: { pos: v.pos.map((x) => +x.toFixed(3)), look: v.look }, utm: GF.utm(v.pos[0], v.pos[2]).map((x) => +x.toFixed(2)), eyeOverStreet: +(v.pos[1] - B.level(v.pos[2])).toFixed(3), hfov: v.hfov, vfov: +camera.fov.toFixed(3), shift: shiftNow, near: camera.near, far: camera.far },
      brightness: brightness(bytes), box: o.box ? { box: o.box, ...brightness(bytes, o.box, o.w) } : undefined, ms,
    }
    await upload(file.replace(/\.png$/, '.json'), JSON.stringify(side, null, 1))
    return side
  },
  /** the sketch: frames of the timed path (or a span), JPEG, with a per-frame log */
  async clip(o: { out: string; fps: number; w: number; h: number; samples: number; from?: number; to?: number; framing?: 'desktop' | 'phone'; state?: 'grey' | 'flat' | 'full'; every?: number }) {
    setStates({ state: o.state ?? 'grey', switch: false })
    const from = o.from ?? 0, to = Math.min(o.to ?? path.duration, path.duration)
    const n = Math.floor((to - from) * o.fps + 1e-6) + 1
    const log: Array<Record<string, unknown>> = []
    const t = performance.now()
    for (let i = 0; i < n; i++) {
      const time = from + i / o.fps
      const p: PathSample = path.sample(time)
      setHour(p.hour)
      // each framing's lens and shift from the path (a hold's from its still), eased between keys
      const hfov = o.framing === 'phone' ? p.phone.hfov : p.hfov
      const shift = o.framing === 'phone' ? p.phone.shift : p.shift
      const vfov = fittedFov(hfov, o.framing === 'phone' ? [390, 844] : [16, 9], o.w, o.h)
      aimWorld(new Vector3(...(p.pos as MV3)), new Vector3(...(p.look as MV3)), vfov, o.w, o.h, shift)
      const { bytes } = await render(o.w, o.h, o.samples, 0)
      const g = Math.round(time * o.fps)
      await upload(`${o.out}/${o.framing ?? 'desktop'}-f${String(g).padStart(5, '0')}.jpg`, await jpeg(bytes, o.w, o.h))
      const pg = new Vector3(...(p.pos as MV3)).applyMatrix4(W2G), lg = new Vector3(...(p.look as MV3)).applyMatrix4(W2G)
      log.push({ i: g, t: +time.toFixed(3), stop: p.stop, kind: p.kind, gate: [+pg.x.toFixed(2), +pg.y.toFixed(2), +pg.z.toFixed(2)], look: [+lg.x.toFixed(2), +lg.y.toFixed(2), +lg.z.toFixed(2)], eyeOverStreet: +(pg.y - B.level(pg.z)).toFixed(3), hour: +p.hour.toFixed(3), hfov: +hfov.toFixed(3), shift: +shift.toFixed(4) })
    }
    await upload(`${o.out}/${o.framing ?? 'desktop'}-frames-${String(Math.round(from * o.fps)).padStart(5, '0')}.json`, JSON.stringify({ fps: o.fps, w: o.w, h: o.h, samples: o.samples, from, to, frames: log }))
    return { frames: n, ms: Math.round(performance.now() - t) }
  },
  /** the south paving's centre line in the gate's frame, [x, z, y] every 2 m (a probe for its line against the map's) */
  south: () => SOUTH.line,
  /** the path in the gate's frame, no rendering (the leg numbers) */
  pathSamples(dt = 0.1) {
    const out: Array<Record<string, unknown>> = []
    for (let time = 0; time <= path.duration + 1e-9; time += dt) {
      const p = path.sample(time)
      const pg = new Vector3(...(p.pos as MV3)).applyMatrix4(W2G), lg = new Vector3(...(p.look as MV3)).applyMatrix4(W2G)
      out.push({ t: +time.toFixed(3), x: pg.x, y: pg.y, z: pg.z, lx: lg.x, ly: lg.y, lz: lg.z, stop: p.stop, kind: p.kind, street: B.level(pg.z) })
    }
    return out
  },
}
;(window as unknown as { __gate: typeof rig }).__gate = rig
const byLetters = painted.flatMap((p) => p.byLetters)
say(`ready: ${A.counts.wallTriangles} wall triangles, ${A.counts.panels} panels, ${A.counts.pavingTriangles} paving triangles, plan ${planMs} ms; record classes at stop ${RECORD_STOP}, ${byLetters.length ? `${byLetters.length} bodies on their letters (no row): ${byLetters.slice(0, 6).join(', ')}` : 'every body on its row'}`)

if (!putBase) {
  const draw = (): void => {
    aimView(first, innerWidth, innerHeight)
    renderer.setSize(innerWidth, innerHeight)
    renderer.render(scene, camera)
  }
  addEventListener('resize', draw)
  draw()
}
