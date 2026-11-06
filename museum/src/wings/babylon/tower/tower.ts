/* STOP 9 ON THE MAP PAGE: the stop's bodies (tower-geom.ts) in the stop's material (tower-mat.ts), as two meshes, the
   precinct with its street and the tower with its stairs, so a state of the scene can take the tower away and leave the
   rest; their classes in the evidence view painted from the record like the map's (record.ts): each body by its name,
   its plan row in the band at its foot, its body row above; and the map ground's paint inside the precinct and before
   the gate.
   The tower switch: three states of the tower at one camera and one light, the tower as the record reads it (`built`),
   as excavated (`dug`: tower-dug.ts) and Bruegel's painted tower (`bruegel`); only the tower changes, the precinct
   and everything else keep their 570 BC look. It is its own parameter, apart from the evidence view. */

import { Float32BufferAttribute, Mesh, type BufferAttribute, type BufferGeometry, type Material } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls } from '../map/plan'
import type { ClassTones, Sky } from '../map/mass'
import { TONE, type Namer } from '../record'
import type { Painted } from '../record-tones'
import { buildTower, type Tower, type TowerBody } from './tower-geom'
import { glazeSky, groundPaint, setTowerPixel, towerMaterial, towerSun } from './tower-mat'
import { buildDug, type Dug } from './tower-dug'
import { pondMaterial, pondSky, ruinMaterial } from './tower-dug-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any

const TONE_OF: Record<Cls, number> = { M: 0, R: 1, G: 2 }

/** the tower's own bodies: the stages, the temple and its battlements, the three stairs */
export const isTowerBody = (id: string): boolean => id.startsWith('tower-')

export type TowerState = 'built' | 'dug' | 'bruegel'
export const TOWER_STATES: readonly TowerState[] = ['built', 'dug', 'bruegel']
/** a page parameter to a state; anything else is the tower as built */
export const towerState = (s: string | null | undefined): TowerState => (TOWER_STATES.includes(s as TowerState) ? (s as TowerState) : 'built')

export interface TowerMount {
  tower: Tower
  /** the map's plan without the bodies the stop draws: build the city's bodies from this one */
  built: Built
  /** the precinct, the street and the threshold */
  mesh: Mesh
  /** the tower and its stairs */
  towerMesh: Mesh
  ground: (base: N) => N
  tone: (name: Namer) => Painted
  setPixel: (vfovDeg: number, heightPx: number) => void
  /** the page's sky, for the glaze and the water */
  sky: (s: Sky, sunDir: N) => void
  /** the excavated state's ground, water and dug stair feet */
  dug: Dug
  dugMeshes: Mesh[]
  /** the map ground mesh the excavated state opens: its vertices strictly inside the ruin's patch sink out of sight */
  attachGround: (ground: Mesh) => void
  state: (s: TowerState) => void
  current: () => TowerState
}

/** a group of the stop's bodies merged into one mesh, with its class attributes and a repaint by the record */
function merged(list: TowerBody[], mat: Material, name: string): { mesh: Mesh; tone: (name: Namer) => string[] } {
  const parts: BufferGeometry[] = list.map((b, i) => {
    const g = b.geometry
    const n = g.getAttribute('position').count
    const cls = new Float32Array(n * 2), band = new Float32Array(n).fill(b.band), cid = new Float32Array(n).fill(i)
    for (let k = 0; k < n; k++) {
      cls[k * 2] = TONE_OF[b.letters[1]]
      cls[k * 2 + 1] = TONE_OF[b.letters[0]]
    }
    g.setAttribute('cls', new Float32BufferAttribute(cls, 2))
    g.setAttribute('band', new Float32BufferAttribute(band, 1))
    g.setAttribute('cid', new Float32BufferAttribute(cid, 1))
    return g
  })
  const geometry = mergeGeometries(parts)
  const mesh = new Mesh(geometry, mat)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  const tone = (nm: Namer): string[] => {
    const each = list.map((b) => nm(`map:${b.id}`, b.letters))
    const a = geometry.getAttribute('cls') as Float32BufferAttribute, cid = geometry.getAttribute('cid')
    const arr = a.array as Float32Array
    for (let k = 0; k < a.count; k++) {
      const c = each[cid.getX(k)]!
      arr[k * 2] = TONE[c.above]
      arr[k * 2 + 1] = TONE[c.foot]
    }
    a.needsUpdate = true
    return list.filter((_, i) => each[i]!.missing.length).map((b) => b.id)
  }
  return { mesh, tone }
}

export function mountTower(built: Built, mapPlan: J, towerPlan: J, tones: ClassTones): TowerMount {
  const tower = buildTower(built, mapPlan, towerPlan)
  const mat = towerMaterial(tower.F, towerPlan, tones)
  const precinct = merged(tower.bodies.filter((b) => !isTowerBody(b.id)), mat, 'etemenanki-precinct')
  const own = merged(tower.bodies.filter((b) => isTowerBody(b.id)), mat, 'etemenanki')
  const court = groundPaint(tower.F, towerPlan, mapPlan)
  /* the excavated state */
  const dug = buildDug(built, towerPlan)
  const ruinMat = ruinMaterial(dug.frame, towerPlan, tones, court), pond = pondMaterial(tones)
  const ruin = merged(dug.bodies.filter((b) => b.id !== 'ruin-water'), ruinMat, 'etemenanki-ruin')
  const water = merged(dug.bodies.filter((b) => b.id === 'ruin-water'), pond, 'etemenanki-ruin-water')
  water.mesh.castShadow = false
  const dugMeshes = [ruin.mesh, water.mesh]
  let groundMesh: Mesh | null = null
  const sunk: { idx: number[]; y: number[] } = { idx: [], y: [] }
  const R = dug.region
  const attachGround = (g: Mesh): void => {
    groundMesh = g
    const p = g.geometry.getAttribute('position') as BufferAttribute
    sunk.idx = []
    sunk.y = []
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i)
      if (x > R.x0 + 1e-3 && x < R.x1 - 1e-3 && z > R.z0 + 1e-3 && z < R.z1 - 1e-3) {
        sunk.idx.push(i)
        sunk.y.push(p.getY(i))
      }
    }
  }
  let now: TowerState = 'built'
  const state = (s: TowerState): void => {
    now = s
    own.mesh.visible = s === 'built'
    for (const m of dugMeshes) m.visible = s === 'dug'
    if (groundMesh) {
      const p = groundMesh.geometry.getAttribute('position') as BufferAttribute
      sunk.idx.forEach((i, k) => p.setY(i, s === 'dug' ? sunk.y[k]! - 40 : sunk.y[k]!))
      p.needsUpdate = true
    }
  }
  state('built')
  const tone = (name: Namer): Painted => ({ bodies: tower.bodies.length + dug.bodies.length, byLetters: [...precinct.tone(name), ...own.tone(name), ...ruin.tone(name), ...water.tone(name)] })
  return {
    tower, built: tower.built, mesh: precinct.mesh, towerMesh: own.mesh, ground: court, tone, setPixel: setTowerPixel,
    sky: (s: Sky, sunDir: N) => {
      glazeSky(mat, s)
      towerSun(mat, towerPlan, sunDir)
      pondSky(pond, s, sunDir)
    },
    dug, dugMeshes, attachGround, state, current: () => now,
  }
}
