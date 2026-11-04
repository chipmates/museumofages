/* STOP 6 ON THE MAP PAGE: the court's bodies (court-geom.ts) as one mesh in the court's material (court-mat.ts),
   and their classes in the evidence view painted from the record like the map's (record.ts): each body by its name,
   its plan row in the band at its foot, its body row above. */

import { Float32BufferAttribute, Mesh, type BufferGeometry } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls } from '../map/plan'
import type { ClassTones } from '../map/mass'
import { TONE, type Namer } from '../record'
import type { Painted } from '../record-tones'
import { buildCourt, type Court } from './court-geom'
import { courtMaterial, setCourtPixel } from './court-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

const TONE_OF: Record<Cls, number> = { M: 0, R: 1, G: 2 }

export interface CourtMount {
  court: Court
  /** the map's plan without the prisms the court draws: build the city's bodies from this one */
  built: Built
  mesh: Mesh
  tone: (name: Namer) => Painted
  setPixel: (vfovDeg: number, heightPx: number) => void
}

export function mountCourt(built: Built, mapPlan: J, courtPlan: J, tones: ClassTones): CourtMount {
  const court = buildCourt(built, mapPlan, courtPlan)
  const parts: BufferGeometry[] = court.bodies.map((b, i) => {
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
  const mesh = new Mesh(geometry, courtMaterial(court.F, courtPlan, tones))
  mesh.name = 'court'
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  const tone = (name: Namer): Painted => {
    const each = court.bodies.map((b) => name(`map:${b.id}`, b.letters))
    const a = geometry.getAttribute('cls') as Float32BufferAttribute, cid = geometry.getAttribute('cid')
    const arr = a.array as Float32Array
    for (let k = 0; k < a.count; k++) {
      const c = each[cid.getX(k)]!
      arr[k * 2] = TONE[c.above]
      arr[k * 2 + 1] = TONE[c.foot]
    }
    a.needsUpdate = true
    return { bodies: court.bodies.length, byLetters: court.bodies.filter((_, i) => each[i]!.missing.length).map((b) => b.id) }
  }
  return { court, built: court.built, mesh, tone, setPixel: setCourtPixel }
}
