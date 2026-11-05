/* STOP 12 ON THE MAP PAGE (the walk's old stop 13): the bridge's bodies (bridge-geom.ts) as one mesh in the stop's
   material (bridge-mat.ts), the river in the opening's water with an eye on the deck (open/earth.ts), the west bank's
   palms (the gate's palm part) and trees (bridge-green.ts) instanced, and the map ground's paint on the banks. Their
   classes in the evidence view come from the record like the map's (record.ts): each body by its name, its plan row in
   the band at its foot, its body row above; the plants and the water by their kind's row. */

import { InstancedBufferAttribute, InstancedMesh, Mesh, Shape, ShapeGeometry, Float32BufferAttribute, type BufferGeometry, type Material } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Built, Cls, P2 } from '../map/plan'
import { uView, type ClassTones } from '../map/mass'
import { TONE, type Namer, type Shown } from '../record'
import type { Painted } from '../record-tones'
import { palmGeometry } from '../gate/gate-life'
import { makeAirUniforms } from '../open/air'
import { palmMaterial, waterMaterial } from '../open/earth'
import { buildBridge, inPoly, type Bridge, type PlantKind } from './bridge-geom'
import { bridgeMaterial, setBridgePixel } from './bridge-mat'
import { plantMatrix, plantShape } from './bridge-green'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { abs, float, max, mix, mx_noise_float, positionWorld, select, smoothstep, step, uniform, vec3 } = TSL as unknown as Record<string, N>

const TONE_OF: Record<Cls, number> = { M: 0, R: 1, G: 2 }

export interface BridgeMount {
  bridge: Bridge
  /** the map's plan without the bodies the stop draws, and a visitor standing on the piers' and land piers' tops */
  built: Built
  meshes: Mesh[]
  /** the river's water, made once the page's sky and sun exist */
  river: (sky: (d: N) => N, uSun: N, uDay: N) => Mesh
  /** the map ground's paint on the banks */
  ground: (base: N) => N
  tone: (name: Namer) => Painted
  setPixel: (vfovDeg: number, heightPx: number) => void
  /** the film's second, for the water's motion */
  setTime: (seconds: number) => void
}

export function mountBridge(built0: Built, mapPlan: J, bp: J, tones: ClassTones): BridgeMount {
  const bridge = buildBridge(built0, mapPlan, bp)
  const F = bridge.frame
  const WL: number = mapPlan.water.find((w: J) => w.id === 'euphrates').level

  /* ── the bodies, one mesh ── */
  const parts: BufferGeometry[] = bridge.bodies.map((b, i) => {
    const g = b.geometry
    const n = g.getAttribute('position').count
    const cls = new Float32Array(n * 2), cid = new Float32Array(n).fill(i)
    for (let k = 0; k < n; k++) {
      cls[k * 2] = TONE_OF[b.letters[1]]
      cls[k * 2 + 1] = TONE_OF[b.letters[0]]
    }
    g.setAttribute('cls', new Float32BufferAttribute(cls, 2))
    g.setAttribute('band', new Float32BufferAttribute(new Float32Array(n).fill(b.band), 1))
    g.setAttribute('cid', new Float32BufferAttribute(cid, 1))
    return g
  })
  const geometry = mergeGeometries(parts)
  const mesh = new Mesh(geometry, bridgeMaterial({ a: F.a, d: F.d, n: F.n }, bp, WL, tones))
  mesh.name = 'bridge'
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false

  /* ── the west bank's plants, instanced by kind, two shapes of each ── */
  const plantMat: Material = palmMaterial(tones)
  const plantMeshes: Array<{ kind: PlantKind; mesh: InstancedMesh }> = []
  for (const kind of ['palm', 'poplar', 'willow', 'tamarisk', 'reed'] as PlantKind[]) {
    const list = bridge.plants.filter((p) => p.kind === kind)
    for (let v = 0; v < 2; v++) {
      const mine = list.filter((_, i) => i % 2 === v)
      if (!mine.length) continue
      const g = plantShape(kind, v, palmGeometry)
      const im = new InstancedMesh(g, plantMat, mine.length)
      const cls = new Float32Array(mine.length * 2).fill(2), band = new Float32Array(mine.length)
      mine.forEach((p, i) => {
        im.setMatrixAt(i, plantMatrix(p))
        band[i] = p.y + 0.5
      })
      g.setAttribute('cls', new InstancedBufferAttribute(cls, 2))
      g.setAttribute('band', new InstancedBufferAttribute(band, 1))
      im.instanceMatrix.needsUpdate = true
      im.castShadow = true
      im.receiveShadow = true
      im.frustumCulled = false
      im.name = `bridge-${kind}-${v}`
      plantMeshes.push({ kind, mesh: im })
    }
  }

  /* ── the river's two edges along z: the west bank's line and the quay's face (the westmost and eastmost crossings) ── */
  const water = built0.water.find((x) => x.id === 'euphrates')!.poly
  const N0: number = mapPlan.frame.N0
  const zN = N0 - bp.westBank.to, zS = N0 - bp.westBank.from
  const crossing = (z: number, west: boolean): number => {
    let x = west ? Infinity : -Infinity
    for (let i = 0; i < water.length; i++) {
      const a = water[i]!, b = water[(i + 1) % water.length]!
      if ((a[1] > z) !== (b[1] > z)) {
        const xi = a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1])
        x = west ? Math.min(x, xi) : Math.max(x, xi)
      }
    }
    return x
  }
  const edgeW = (z: number): number => crossing(z, true)
  const edgeE = (z: number): number => crossing(z, false)
  /** an edge's x as a node of z, piecewise straight every 20 m over the stop's reach */
  const edgeNode = (edge: (z: number) => number, z: N): N => {
    const zs: number[] = []
    for (let k = zN - 80; k <= zS + 80; k += 20) zs.push(k)
    let ex: N = float(edge(zs[0]!))
    for (let i = 0; i + 1 < zs.length; i++) {
      const a = edge(zs[i]!), b = edge(zs[i + 1]!)
      ex = select(z.greaterThanEqual(zs[i]!), float(a).add(z.sub(zs[i]!).mul((b - a) / (zs[i + 1]! - zs[i]!))), ex)
    }
    return ex
  }

  /* ── the river: the map's Euphrates outline at its level, the opening's water as seen from the deck ── */
  const uTime = uniform(0)
  const W = bp.water
  const river = (sky: (d: N) => N, uSun: N, uDay: N): Mesh => {
    const w = built0.water.find((x) => x.id === 'euphrates')!
    const sh = new Shape()
    sh.moveTo(w.poly[0]![0], -w.poly[0]![1])
    for (const [x, z] of w.poly.slice(1)) sh.lineTo(x, -z)
    sh.closePath()
    const g = new ShapeGeometry(sh)
    g.rotateX(-Math.PI / 2)
    g.translate(0, w.level, 0)
    const A = { ...makeAirUniforms(), uSun, uDay }
    // the current runs north to south along the river's course here (scene +z), turning a little east of south
    const flow: [number, number] = [W.flow * Math.sin((W.bearing * Math.PI) / 180), -W.flow * Math.cos((W.bearing * Math.PI) / 180)]
    const wakes = bridge.piers.map((p) => ({ x: p.c[0], z: p.c[1], r: mapPlan.bridge.piers.across / 2, h: mapPlan.bridge.piers.along / 2, len: W.wake }))
    // the evidence view greys it as the map's water stays untoned
    const R = W.reflect
    // a reflected ray meets the west bank (in shadow, its groves above it) or the quay's lit face (the city above it)
    // before the sky; their heights over the water and their tones in the light of the hour
    const reflect = (p: N, r: N, skyC: N): N => {
      const h = max(r.xz.length(), 1e-4), tanE = r.y.div(h)
      const rx = r.x.div(h)
      const dW = p.x.sub(edgeNode(edgeW, p.z)).div(max(rx.negate(), 1e-3))
      const dE = edgeNode(edgeE, p.z).sub(p.x).div(max(rx, 1e-3))
      const westward = step(rx, -0.02), eastward = step(0.02, rx)
      const bankW = float(1).sub(step(R.west.bank, dW.mul(tanE))).mul(westward)
      const groveW = float(1).sub(smoothstep(R.west.grove * 0.6, R.west.grove, dW.add(25).mul(tanE))).mul(westward).mul(R.west.cover)
      const wallE = float(1).sub(step(R.east.wall, dE.mul(tanE))).mul(eastward)
      const cityE = float(1).sub(smoothstep(R.east.city * 0.6, R.east.city, dE.add(30).mul(tanE))).mul(eastward).mul(R.east.cover)
      const day = uDay
      const lit = max(uSun.y, 0).mul(4).add(0.35).mul(day)
      let c: N = mix(skyC, vec3(...R.west.groveTone).mul(day), groveW)
      c = mix(c, vec3(...R.west.bankTone).mul(day), bankW)
      c = mix(c, vec3(...R.east.cityTone).mul(lit), cityE)
      c = mix(c, vec3(...R.east.wallTone).mul(lit), wallE)
      return c
    }
    const riverMat = waterMaterial(A, sky, uTime, undefined, { body: W.body, flow, fine: W.fine, wakes, glint: W.glint, fog: true, swell: W.swell, reflect })
    const m = new Mesh(g, riverMat)
    m.name = 'water-euphrates'
    m.receiveShadow = false
    return m
  }

  /* ── the ground's paint: the west bank's earth, damp to the water, and the grove floor; the slopes by the land pier ── */
  const ground = (base: N): N => {
    const P = positionWorld
    const o = edgeNode(edgeW, P.z).sub(P.x)
    const along = smoothstep(zN - 80, zN, P.z).mul(float(1).sub(smoothstep(zS, zS + 80, P.z)))
    const silt = vec3(...bp.colours.silt)
    const broad = mx_noise_float(vec3(P.x.mul(0.05), 3.3, P.z.mul(0.05)))
    const fine = mx_noise_float(vec3(P.x.mul(0.6), 7.1, P.z.mul(0.6)))
    let earth: N = silt.mul(float(1.05).add(broad.mul(0.1)).add(fine.mul(0.05)))
    // damp and darker toward the water, a dark wet line at it
    const above = P.y.sub(WL)
    earth = mix(earth.mul(vec3(0.62, 0.6, 0.58)), earth, smoothstep(0.1, 1.6, above))
    earth = mix(earth, earth.mul(0.55), float(1).sub(smoothstep(0.0, 0.25, above)))
    // the bank's face: rain runnels down it, slumped earth, the dry crumbling lip lighter than the face below
    const onFace = smoothstep(0.2, 0.8, above).mul(float(1).sub(smoothstep(3.6, 4.0, above)))
    const runnel = mx_noise_float(vec3(P.z.mul(0.9), P.y.mul(0.12), 1.9)).mul(0.6).add(mx_noise_float(vec3(P.z.mul(3.3), P.y.mul(0.4), 8.2)).mul(0.4))
    earth = mix(earth, earth.mul(float(0.8).add(runnel.mul(0.35))), onFace)
    earth = mix(earth, earth.mul(vec3(1.18, 1.14, 1.08)), smoothstep(3.0, 3.9, above).mul(float(1).sub(smoothstep(3.95, 4.3, above))))
    // the grove floor: patches of low green and dry grass among the earth
    const green = smoothstep(-0.1, 0.35, mx_noise_float(vec3(P.x.mul(0.09), 5.5, P.z.mul(0.09))).add(fine.mul(0.2)))
    const floorC = mix(earth.mul(0.92), mix(vec3(0.075, 0.09, 0.045), vec3(0.16, 0.14, 0.08), smoothstep(-0.2, 0.4, broad)), green.mul(0.7))
    const bank = smoothstep(-2, 0, o).mul(float(1).sub(smoothstep(60, 80, o))).mul(along)
    const westC = mix(earth, floorC, smoothstep(8, 16, o))
    // by the bridge's head: the earth where the quay ends short of the land pier on both sides
    const rx = P.x.sub(F.a[0]), rz = P.z.sub(F.a[1])
    const t = rx.mul(F.d[0]).add(rz.mul(F.d[1])), c = abs(rx.mul(F.n[0]).add(rz.mul(F.n[1])))
    const head = smoothstep(-14, -8, t).mul(float(1).sub(smoothstep(4, 9, t))).mul(smoothstep(6.5, 7.5, c)).mul(float(1).sub(smoothstep(17, 22, c)))
    const painted = mix(mix(base, westC, bank), earth, head)
    return mix(painted, base, uView)
  }

  /* ── standing on the stop's own tops: the piers' capping and the land piers (the deck is the map's street) ── */
  const tops: Array<{ poly: P2[]; y: number }> = bridge.piers.map((p) => ({ poly: p.outline, y: p.capTop }))
  const LP = mapPlan.bridge.abutments
  for (const s of [LP.east, LP.west]) {
    const h = s.across / 2 - 0.3
    tops.push({ poly: [F.at(s.from + 0.3, -h), F.at(s.to - 0.3, -h), F.at(s.to - 0.3, h), F.at(s.from + 0.3, h)], y: bridge.deckTop((s.from + s.to) / 2) - 0.02 })
  }
  const stand = (x: number, z: number): number => {
    const st = bridge.built.streetAt(x, z)
    if (st.d <= st.w / 2 + 0.5) return bridge.built.stand(x, z)
    for (const tp of tops) if (inPoly([x, z], tp.poly)) return tp.y
    return bridge.built.stand(x, z)
  }

  const tone = (name: Namer): Painted => {
    const each = bridge.bodies.map((b) => name(`map:${b.id}`, b.letters))
    const a = geometry.getAttribute('cls') as Float32BufferAttribute, cid = geometry.getAttribute('cid')
    const arr = a.array as Float32Array
    for (let k = 0; k < a.count; k++) {
      const c = each[cid.getX(k)]!
      arr[k * 2] = TONE[c.above]
      arr[k * 2 + 1] = TONE[c.foot]
    }
    a.needsUpdate = true
    let missing = bridge.bodies.filter((_, i) => each[i]!.missing.length).map((b) => b.id)
    for (const { kind, mesh: im } of plantMeshes) {
      const c = name(`map:bridge-${kind}-0`, ['G', 'G'])
      const ia = im.geometry.getAttribute('cls') as InstancedBufferAttribute
      const v: Shown = c.above
      ;(ia.array as Float32Array).fill(TONE[v])
      ia.needsUpdate = true
      if (c.missing.length) missing = [...missing, `bridge-${kind}`]
    }
    return { bodies: bridge.bodies.length + plantMeshes.length, byLetters: missing }
  }
  return {
    bridge,
    built: { ...bridge.built, stand },
    meshes: [mesh, ...plantMeshes.map((p) => p.mesh as unknown as Mesh)],
    river,
    ground,
    tone,
    setPixel: setBridgePixel,
    setTime: (s: number) => { uTime.value = s },
  }
}
