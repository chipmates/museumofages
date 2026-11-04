/* STOP 8 ON THE MAP PAGE: the Nabu temple's bodies (nabu-geom.ts) as one mesh in their material (nabu-mat.ts), and
   their classes in the evidence view painted from the record like the map's (record.ts): each body by its name, its
   plan row in the band at its foot, its body row above. */

import { Float32BufferAttribute, Mesh, type BufferGeometry } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls } from '../map/plan'
import type { ClassTones } from '../map/mass'
import { TONE, type Namer } from '../record'
import type { Painted } from '../record-tones'
import { buildNabu, type Nabu } from './nabu-geom'
import { nabuMaterial, setNabuPixel } from './nabu-mat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

const TONE_OF: Record<Cls, number> = { M: 0, R: 1, G: 2 }

export interface NabuMount {
  nabu: Nabu
  /** the map's plan without the prism the temple replaces, standing on the temple's floor: build the city from it */
  built: Built
  mesh: Mesh
  tone: (name: Namer) => Painted
  setPixel: (vfovDeg: number, heightPx: number) => void
}

export function mountNabu(built: Built, mapPlan: J, np: J, tones: ClassTones): NabuMount {
  const nabu = buildNabu(built, mapPlan, np)
  const parts: BufferGeometry[] = nabu.bodies.map((b, i) => {
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
  const mesh = new Mesh(geometry, nabuMaterial(nabu.F, np, tones))
  mesh.name = 'nabu'
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  const tone = (name: Namer): Painted => {
    const each = nabu.bodies.map((b) => name(`map:${b.id}`, b.letters))
    const a = geometry.getAttribute('cls') as Float32BufferAttribute, cid = geometry.getAttribute('cid')
    const arr = a.array as Float32Array
    for (let k = 0; k < a.count; k++) {
      const c = each[cid.getX(k)]!
      arr[k * 2] = TONE[c.above]
      arr[k * 2 + 1] = TONE[c.foot]
    }
    a.needsUpdate = true
    return { bodies: nabu.bodies.length, byLetters: nabu.bodies.filter((_, i) => each[i]!.missing.length).map((b) => b.id) }
  }
  return { nabu, built: nabu.built, mesh, tone, setPixel: setNabuPixel }
}
